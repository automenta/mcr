const path = require('path');
const logger = require('../util/logger');
const OllamaProvider = require('../llm/ollamaProvider');
const GeminiProvider = require('../llm/geminiProvider');
const PrologReasonerProvider = require('../reason/prologReasoner');
const ontologyService = require('../ontologyService');
const { prompts, fillTemplate } = require('../prompts');
const { MCRError, ErrorCodes } = require('../errors');
const strategyManager = require('../strategyManager');
const StrategyExecutor = require('../strategyExecutor');
const { KeywordInputRouter } = require('../evolutionModule.js');
const db = require('../store/database');
const EmbeddingBridge = require('../bridges/embeddingBridge');
const { loadConfig } = require('./config');
const SessionManager = require('./sessionManager');

class MCREngine {
	constructor() {
		require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });

		this.config = loadConfig();
		this.validateConfig();

		this.sessionManager = new SessionManager(this.config);

		// Configure OntologyService with the directory from config and the reasoner provider
		ontologyService.configureOntologyService({
			ontologyDir: this.config.ontology.directory,
			reasonerProvider: this.reasonerProvider,
		});

		// Eagerly initialize providers. This is the core fix.
		this.llmProvider = this._initializeLlmProvider();
		this.reasonerProvider = this._initializeReasonerProvider();

		this.embeddingBridge = this.config.embedding.model
			? new EmbeddingBridge()
			: null;
		if (this.embeddingBridge) {
			this.embeddingBridge.loadModel();
		}

		this.inputRouterInstance = new KeywordInputRouter(db);
		this.baseStrategyId = this.config.translationStrategy;
		this.logInitialStrategy();
	}

	validateConfig() {
		const { provider, gemini } = this.config.llm;
		if (provider.toLowerCase() === 'gemini' && !gemini.apiKey) {
			throw new Error(
				'Configuration Error: MCR_LLM_PROVIDER is "gemini" but GEMINI_API_KEY is not set.'
			);
		}
	}

	_initializeLlmProvider() {
		const providerName = this.config.llm.provider.toLowerCase();
		logger.info(`[MCREngine] Initializing LLM provider: ${providerName}`);
		switch (providerName) {
			case 'ollama':
				return OllamaProvider;
			case 'gemini':
				return GeminiProvider;
			default:
				throw new Error(
					`Configuration Error: Unsupported LLM provider: "${providerName}".`
				);
		}
	}

	_initializeReasonerProvider() {
		const providerName = this.config.reasoner.provider.toLowerCase();
		logger.info(`[MCREngine] Initializing Reasoner provider: ${providerName}`);
		switch (providerName) {
			case 'prolog':
				return PrologReasonerProvider;
			default:
				throw new Error(
					`Configuration Error: Unsupported Reasoner provider: "${providerName}".`
				);
		}
	}

	async _getAssertStrategy(sessionId, naturalLanguageText, multi) {
		const activeStrategyJson = await this.getOperationalStrategyJson(
			'Assert',
			naturalLanguageText,
			multi
		);
		if (!activeStrategyJson) {
			throw new MCRError(
				ErrorCodes.STRATEGY_NOT_FOUND,
				`Active strategy not found for session ${sessionId}.`
			);
		}
		return activeStrategyJson;
	}

	async _executeAssertStrategy(
		activeStrategyJson,
		strategyContext
	) {
		const executor = new StrategyExecutor(activeStrategyJson);
		const addedFacts = await executor.execute(
			this.llmProvider,
			this.reasonerProvider,
			strategyContext
		);

		if (
			!Array.isArray(addedFacts) ||
			!addedFacts.every(f => typeof f === 'string')
		) {
			throw new MCRError(
				ErrorCodes.STRATEGY_INVALID_OUTPUT,
				'Strategy did not return an array of strings.'
			);
		}
		return addedFacts;
	}

	async assertNLToSession(sessionId, naturalLanguageText, options = {}) {
		const { multi = true } = options;
		const activeStrategyJson = await this._getAssertStrategy(
			sessionId,
			naturalLanguageText,
			multi
		);
		const currentStrategyId = activeStrategyJson.id;
		logger.info(
			`[MCREngine] Enter assertNLToSession for session ${sessionId} using strategy "${activeStrategyJson.name}" (ID: ${currentStrategyId}).`
		);

		const session = await this.sessionManager.getSession(sessionId);
		if (!session) {
			throw new MCRError(ErrorCodes.SESSION_NOT_FOUND, 'Session not found.');
		}

		const strategyContext = {
			naturalLanguageText,
			existingFacts:
				(await this.sessionManager.getKnowledgeBase(sessionId)) || '',
			ontologyRules:
				(await ontologyService.getGlobalOntologyRulesAsString()) || '',
			lexiconSummary: await this.sessionManager.getLexiconSummary(sessionId),
			llm_model_id:
				this.config.llm[this.config.llm.provider]?.model || 'default',
		};

		const addedFacts = await this._executeAssertStrategy(
			activeStrategyJson,
			strategyContext
		);

		if (addedFacts.length === 0) {
			return {
				success: true,
				message: 'No facts were extracted from the input.',
				addedFacts: [],
				strategyId: currentStrategyId,
			};
		}

		await this.sessionManager.addFacts(sessionId, addedFacts);
		const fullKnowledgeBase =
			await this.sessionManager.getKnowledgeBase(sessionId);

		return {
			success: true,
			message: 'Facts asserted successfully.',
			addedFacts,
			fullKnowledgeBase,
			strategyId: currentStrategyId,
		};
	}

	async _getQueryStrategy(sessionId, naturalLanguageQuestion) {
		const activeStrategyJson = await this.getOperationalStrategyJson(
			'Query',
			naturalLanguageQuestion
		);
		if (!activeStrategyJson) {
			throw new MCRError(
				ErrorCodes.STRATEGY_NOT_FOUND,
				`Active query strategy not found for session ${sessionId}.`
			);
		}
		return activeStrategyJson;
	}

	async _executeQueryStrategy(activeStrategyJson, strategyContext) {
		const executor = new StrategyExecutor(activeStrategyJson);
		const prologQuery = await executor.execute(
			this.llmProvider,
			this.reasonerProvider,
			strategyContext
		);

		if (typeof prologQuery !== 'string' || !prologQuery.endsWith('.')) {
			throw new MCRError(
				ErrorCodes.STRATEGY_INVALID_OUTPUT,
				'Query strategy did not return a valid Prolog query string.'
			);
		}
		return prologQuery;
	}

	async _queryKnowledgeBase(
		prologQuery,
		existingFacts,
		ontologyRules,
		dynamicOntology
	) {
		let knowledgeBase = existingFacts + '\n' + ontologyRules;
		if (dynamicOntology) {
			knowledgeBase += '\n' + dynamicOntology;
		}

		return this.reasonerProvider.executeQuery(knowledgeBase, prologQuery);
	}

	async _generateNLAnswer(
		naturalLanguageQuestion,
		prologResults,
		style
	) {
		const promptContext = {
			naturalLanguageQuestion,
			prologResultsJSON: JSON.stringify(prologResults),
			style: style || 'conversational',
		};

		const llmResult = await this.llmProvider.generate(
			prompts.LOGIC_TO_NL_ANSWER.system,
			fillTemplate(prompts.LOGIC_TO_NL_ANSWER.user, promptContext)
		);
		return llmResult.text;
	}

	async querySessionWithNL(
		sessionId,
		naturalLanguageQuestion,
		queryOptions = {}
	) {
		const activeStrategyJson = await this._getQueryStrategy(
			sessionId,
			naturalLanguageQuestion
		);
		const currentStrategyId = activeStrategyJson.id;
		logger.info(
			`[MCREngine] Querying session ${sessionId} with strategy "${currentStrategyId}"`
		);

		const session = await this.sessionManager.getSession(sessionId);
		if (!session) {
			throw new MCRError(ErrorCodes.SESSION_NOT_FOUND, 'Session not found.');
		}

		const existingFacts =
			(await this.sessionManager.getKnowledgeBase(sessionId)) || '';
		const ontologyRules =
			(await ontologyService.getGlobalOntologyRulesAsString()) || '';

		const strategyContext = {
			naturalLanguageQuestion,
			existingFacts,
			ontologyRules,
			lexiconSummary: await this.sessionManager.getLexiconSummary(sessionId),
			llm_model_id:
				this.config.llm[this.config.llm.provider]?.model || 'default',
		};

		const prologQuery = await this._executeQueryStrategy(
			activeStrategyJson,
			strategyContext
		);

		const prologResults = await this._queryKnowledgeBase(
			prologQuery,
			existingFacts,
			ontologyRules,
			queryOptions.dynamicOntology
		);

		const answer = await this._generateNLAnswer(
			naturalLanguageQuestion,
			prologResults,
			queryOptions.style
		);

		return {
			success: true,
			answer,
			prologQuery,
			prologResults,
			strategyId: currentStrategyId,
		};
	}

	async getOperationalStrategyJson(
		operationType,
		naturalLanguageText,
		multi = true
	) {
		// Simplified for now, can add router logic back later
		let operationSuffix = operationType === 'Assert' ? '-Assert' : '-Query';
		if (operationType === 'Assert' && multi) {
			operationSuffix = '-Multi-Assert';
		}
		const operationalStrategyId = `${this.baseStrategyId}${operationSuffix}`;
		let strategyJson = strategyManager.getStrategy(operationalStrategyId);
		if (!strategyJson) {
			strategyJson =
				strategyManager.getStrategy(this.baseStrategyId) ||
				strategyManager.getDefaultStrategy();
		}
		return strategyJson;
	}

	async logInitialStrategy() {
		const strategy = await this.getOperationalStrategyJson('Assert', '');
		logger.info(
			`[MCREngine] Initialized with effective assertion strategy: "${strategy.name}" (ID: ${strategy.id})`
		);
	}

	async llmPassthrough(naturalLanguageText) {
		const llmResult = await this.llmProvider.generate(
			prompts.LLM_PASSTHROUGH.system,
			fillTemplate(prompts.LLM_PASSTHROUGH.user, { naturalLanguageText })
		);
		return { success: true, response: llmResult.text };
	}

	async handleMCRCommand(sessionId, naturalLanguageText) {
		if (naturalLanguageText.trim().endsWith('?')) {
			return this.querySessionWithNL(sessionId, naturalLanguageText);
		}
		return this.assertNLToSession(sessionId, naturalLanguageText);
	}

	async setKnowledgeBase(sessionId, kbContent) {
		return this.sessionManager.setKnowledgeBase(sessionId, kbContent);
	}
}

module.exports = MCREngine;
