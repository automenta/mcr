const path = require('path');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');
const logger = require('./util/logger');
const KnowledgeGraph = require('./bridges/kgBridge');
const OllamaProvider = require('./llm/ollamaProvider');
const GeminiProvider = require('./llm/geminiProvider');
const PrologReasonerProvider = require('./reason/prologReasoner');
const ontologyService = require('./ontologyService');
const { prompts, fillTemplate, getPromptTemplateByName } = require('./prompts');
const { MCRError, ErrorCodes } = require('./errors');
const strategyManager = require('./strategyManager');
const StrategyExecutor = require('./strategyExecutor');
const {
	KeywordInputRouter,
	OptimizationCoordinator,
} = require('./evolutionModule.js');
const { generateExample, generateOntology } = require('./utility.js');
const db = require('./store/database');
const EmbeddingBridge = require('./bridges/embeddingBridge');

class MCREngine {
	constructor() {
		require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });

		this.config = {
			server: {
				port: process.env.PORT || 8081,
				host: process.env.HOST || '0.0.0.0',
			},
			llm: {
				provider: process.env.MCR_LLM_PROVIDER || 'ollama',
				ollama: {
					model: process.env.MCR_LLM_MODEL_OLLAMA || 'llama3',
					embeddingModel:
						process.env.MCR_LLM_EMBEDDING_MODEL_OLLAMA || 'nomic-embed-text',
					baseURL:
						process.env.MCR_LLM_OLLAMA_BASE_URL || 'http://localhost:11434',
				},
				gemini: {
					apiKey: process.env.GEMINI_API_KEY,
					model: process.env.MCR_LLM_MODEL_GEMINI || 'gemini-pro',
				},
				openai: {
					apiKey: process.env.OPENAI_API_KEY,
					model: process.env.MCR_LLM_MODEL_OPENAI || 'gpt-4o',
				},
				anthropic: {
					apiKey: process.env.ANTHROPIC_API_KEY,
					model:
						process.env.MCR_LLM_MODEL_ANTHROPIC || 'claude-3-opus-20240229',
				},
				generic_openai: {
					model: process.env.MCR_LLM_MODEL_GENERIC_OPENAI,
					baseURL: process.env.MCR_LLM_GENERIC_OPENAI_BASE_URL,
					apiKey: process.env.MCR_LLM_GENERIC_OPENAI_API_KEY,
				},
			},
			reasoner: {
				provider: process.env.MCR_REASONER_PROVIDER || 'prolog',
				prolog: {},
				type: process.env.REASONER_TYPE || 'prolog',
				ltnThreshold: parseFloat(process.env.LTN_THRESHOLD) || 0.7,
			},
			embedding: {
				model: process.env.EMBEDDING_MODEL || 'all-MiniLM-L6-v2',
			},
			kg: {
				enabled: process.env.KG_ENABLED === 'true',
			},
			ontology: {
				directory:
					process.env.MCR_ONTOLOGY_DIR ||
					require('path').resolve(__dirname, '../../ontologies'),
			},
			logLevel: process.env.LOG_LEVEL || 'info',
			translationStrategy:
				process.env.MCR_TRANSLATION_STRATEGY || 'conditional-multi-assert',
			debugLevel: process.env.MCR_DEBUG_LEVEL || 'none',
			sessionStore: {
				type: process.env.MCR_SESSION_STORE_TYPE || 'memory',
				filePath:
					process.env.MCR_SESSION_STORE_FILE_PATH ||
					path.resolve(process.cwd(), './.sessions'),
			},
			evolution: {
				enabled: process.env.MCR_EVOLUTION_ENABLED === 'true',
				iterations: parseInt(process.env.MCR_EVOLUTION_ITERATIONS, 10) || 1,
			},
		};

		try {
			this.validateConfig();
		} catch (error) {
			console.error('Failed to initialize MCREngine configuration:', error);
			throw error;
		}

		this.sessions = {};
		this.sessionsDir = this.config.sessionStore.filePath;
		this.initializeSessionStore();
		this.llmProvider = null;
		this.reasonerProvider = null;
		this.embeddingBridge = this.config.embedding.model
			? new EmbeddingBridge()
			: null;
		if (this.embeddingBridge) {
			logger.debug(
				'[MCREngine] EmbeddingBridge instance:',
				this.embeddingBridge
			);
			this.embeddingBridge.loadModel();
		}
		try {
			this.inputRouterInstance = new KeywordInputRouter(db);
			logger.info('[MCREngine] InputRouter initialized.');
		} catch (error) {
			logger.error(
				'[MCREngine] Failed to initialize InputRouter. Routing will be disabled.',
				error
			);
			this.inputRouterInstance = null;
		}
		this.baseStrategyId = this.config.translationStrategy;
		this.logInitialStrategy();
	}

	validateConfig() {
		const { provider, gemini, openai, anthropic } = this.config.llm;

		const selectedProvider = provider.toLowerCase();

		if (selectedProvider === 'gemini') {
			if (!gemini.apiKey) {
				throw new Error(
					'Configuration Error: MCR_LLM_PROVIDER is "gemini" but GEMINI_API_KEY is not set.'
				);
			}
		} else if (selectedProvider === 'openai') {
			if (!openai.apiKey) {
				throw new Error(
					'Configuration Error: MCR_LLM_PROVIDER is "openai" but OPENAI_API_KEY is not set.'
				);
			}
		} else if (selectedProvider === 'anthropic') {
			if (!anthropic.apiKey) {
				throw new Error(
					'Configuration Error: MCR_LLM_PROVIDER is "anthropic" but ANTHROPIC_API_KEY is not set.'
				);
			}
		} else if (selectedProvider === 'generic_openai') {
			if (!this.config.llm.generic_openai?.model) {
				throw new Error(
					'Configuration Error: MCR_LLM_PROVIDER is "generic_openai" but MCR_LLM_MODEL_GENERIC_OPENAI is not set.'
				);
			}
			if (!this.config.llm.generic_openai?.baseURL) {
				throw new Error(
					'Configuration Error: MCR_LLM_PROVIDER is "generic_openai" but MCR_LLM_GENERIC_OPENAI_BASE_URL is not set.'
				);
			}
		}

		if (this.config.reasoner.type === 'ltn') {
			if (
				typeof this.config.reasoner.ltnThreshold !== 'number' ||
				this.config.reasoner.ltnThreshold < 0 ||
				this.config.reasoner.ltnThreshold > 1
			) {
				throw new Error(
					'Configuration Error: REASONER_TYPE is "ltn" but LTN_THRESHOLD is not a float between 0 and 1.'
				);
			}
		}

		const validDebugLevels = ['none', 'basic', 'verbose'];
		if (!validDebugLevels.includes(this.config.debugLevel.toLowerCase())) {
			console.warn(
				`Warning: Invalid MCR_DEBUG_LEVEL "${this.config.debugLevel}". Allowed values: ${validDebugLevels.join(', ')}. Defaulting to "none".`
			);
			this.config.debugLevel = 'none';
		} else {
			this.config.debugLevel = this.config.debugLevel.toLowerCase();
		}
	}

	async initializeSessionStore() {
		if (this.config.sessionStore.type === 'file') {
			try {
				await fs.mkdir(this.sessionsDir, { recursive: true });
				logger.info(
					`[MCREngine] Sessions directory ensured: ${this.sessionsDir}`
				);
			} catch (error) {
				logger.error(
					`[MCREngine] Failed to create sessions directory ${this.sessionsDir}:`,
					error
				);
				throw error;
			}
		}
	}

	_getFilePath(sessionId) {
		return path.join(this.sessionsDir, `${sessionId}.json`);
	}

	async _readSessionFile(sessionId) {
		try {
			const filePath = this._getFilePath(sessionId);
			const data = await fs.readFile(filePath, 'utf8');
			const sessionData = JSON.parse(data);
			if (sessionData.lexicon && Array.isArray(sessionData.lexicon)) {
				sessionData.lexicon = new Set(sessionData.lexicon);
			} else {
				sessionData.lexicon = new Set();
			}
			if (sessionData.createdAt) {
				sessionData.createdAt = new Date(sessionData.createdAt);
			}
			if (sessionData.kbGraph) {
				const kb = new KnowledgeGraph();
				kb.fromJSON(sessionData.kbGraph);
				sessionData.kbGraph = kb;
			}
			if (sessionData.embeddings && Array.isArray(sessionData.embeddings)) {
				sessionData.embeddings = new Map(sessionData.embeddings);
			} else {
				sessionData.embeddings = new Map();
			}
			return sessionData;
		} catch (error) {
			if (error.code === 'ENOENT') {
				return null;
			}
			logger.error(
				`[MCREngine] Error reading session file for ${sessionId}:`,
				error
			);
			throw error;
		}
	}

	async _writeSessionFile(sessionId, sessionData) {
		try {
			const filePath = this._getFilePath(sessionId);
			const dataToStore = { ...sessionData };
			if (dataToStore.lexicon instanceof Set) {
				dataToStore.lexicon = Array.from(dataToStore.lexicon);
			}
			if (dataToStore.createdAt instanceof Date) {
				dataToStore.createdAt = dataToStore.createdAt.toISOString();
			}
			if (dataToStore.kbGraph) {
				dataToStore.kbGraph = dataToStore.kbGraph.toJSON();
			}
			if (dataToStore.embeddings instanceof Map) {
				dataToStore.embeddings = Array.from(dataToStore.embeddings.entries());
			}
			await fs.writeFile(
				filePath,
				JSON.stringify(dataToStore, null, 2),
				'utf8'
			);
		} catch (error) {
			logger.error(
				`[MCREngine] Error writing session file for ${sessionId}:`,
				error
			);
			throw error;
		}
	}

	async createSession(sessionIdInput) {
		const sessionId = sessionIdInput || uuidv4();
		if (this.config.sessionStore.type === 'file') {
			const filePath = this._getFilePath(sessionId);
			try {
				await fs.access(filePath);
				logger.warn(
					`[MCREngine] Session file ${filePath} already exists for ID: ${sessionId}. Reading existing session.`
				);
				const existingSession = await this._readSessionFile(sessionId);
				if (existingSession) return existingSession;
				throw new Error(
					`Session file ${filePath} exists but could not be read.`
				);
			} catch (error) {
				if (error.code !== 'ENOENT') {
					logger.error(
						`[MCREngine] Error checking existence of session file ${filePath}:`,
						error
					);
					throw error;
				}
			}
		} else {
			if (this.sessions[sessionId]) {
				logger.warn(
					`[MCREngine] createSession called with an existing ID: ${sessionId}. Returning existing session.`
				);
				const existingSession = this.sessions[sessionId];
				return {
					id: existingSession.id,
					createdAt: existingSession.createdAt,
					facts: [...existingSession.facts],
					lexicon: new Set(existingSession.lexicon),
					embeddings: existingSession.embeddings,
					kbGraph: existingSession.kbGraph,
				};
			}
		}

		const session = {
			id: sessionId,
			createdAt: new Date(),
			facts: [],
			lexicon: new Set(),
			embeddings: new Map(),
			kbGraph: this.config.kg.enabled ? new KnowledgeGraph() : null,
			contextGraph: {
				facts: [],
				rules: [],
				embeddings: {},
				models: {},
			},
		};

		if (this.config.sessionStore.type === 'file') {
			await this._writeSessionFile(sessionId, session);
			logger.info(
				`[MCREngine] Session created and file written: ${this._getFilePath(sessionId)}`
			);
		} else {
			this.sessions[sessionId] = session;
			logger.info(`[MCREngine] Session created: ${sessionId}`);
		}

		return {
			...session,
			lexicon: new Set(session.lexicon),
		};
	}

	async getSession(sessionId) {
		if (this.config.sessionStore.type === 'file') {
			const sessionData = await this._readSessionFile(sessionId);
			if (sessionData) {
				logger.debug(`[MCREngine] Session retrieved: ${sessionId}`);
				return sessionData;
			}
			logger.warn(`[MCREngine] Session not found: ${sessionId}`);
			return null;
		} else {
			if (!this.sessions[sessionId]) {
				logger.warn(`[MCREngine] Session not found: ${sessionId}`);
				return null;
			}
			const session = this.sessions[sessionId];
			return {
				id: session.id,
				createdAt: session.createdAt,
				facts: [...session.facts],
				lexicon: new Set(session.lexicon),
				embeddings: session.embeddings,
				kbGraph: session.kbGraph,
				contextGraph: session.contextGraph,
			};
		}
	}

	async translateNLToRulesDirect(naturalLanguageText, strategyIdToUse) {
		const effectiveBaseId = strategyIdToUse || this.baseStrategyId;
		const strategyJsonToUse = strategyIdToUse
			? strategyManager.getStrategy(`${effectiveBaseId}-Assert`) ||
				strategyManager.getStrategy(effectiveBaseId) ||
				(await this.getOperationalStrategyJson('Assert', naturalLanguageText))
			: await this.getOperationalStrategyJson('Assert', naturalLanguageText);

		if (!strategyJsonToUse) {
			logger.error(
				`[MCREngine] No valid strategy found for direct NL to Rules. Base ID: "${effectiveBaseId}".`
			);
			return {
				success: false,
				message: `No valid strategy could be determined for base ID "${effectiveBaseId}".`,
				error: ErrorCodes.STRATEGY_NOT_FOUND,
				strategyId: effectiveBaseId,
			};
		}
		const currentStrategyId = strategyJsonToUse.id;
		const operationId = `transNLToRules-${Date.now()}`;
		logger.info(
			`[MCREngine] Enter translateNLToRulesDirect (OpID: ${operationId}). Strategy ID: "${currentStrategyId}". NL Text: "${naturalLanguageText}"`
		);

		try {
			logger.info(
				`[MCREngine] Using strategy "${strategyJsonToUse.name}" (ID: ${currentStrategyId}) for direct NL to Rules. OpID: ${operationId}`
			);
			const globalOntologyRules =
				await ontologyService.getGlobalOntologyRulesAsString();
			const initialContext = {
				naturalLanguageText,
				ontologyRules: globalOntologyRules,
				lexiconSummary: 'No lexicon summary available for direct translation.',
				existingFacts: '',
				llm_model_id:
					this.config.llm[this.config.llm.provider]?.model || 'default',
			};

			const prologRules = await new StrategyExecutor(strategyJsonToUse).execute(
				this,
				this,
				initialContext
			);

			if (
				!Array.isArray(prologRules) ||
				!prologRules.every(r => typeof r === 'string')
			) {
				logger.error(
					`[MCREngine] Strategy "${currentStrategyId}" execution for direct translation did not return an array of strings. OpID: ${operationId}. Output: ${JSON.stringify(prologRules)}`
				);
				throw new MCRError(
					ErrorCodes.STRATEGY_INVALID_OUTPUT,
					'Strategy execution for direct translation returned an unexpected output format. Expected array of Prolog strings.'
				);
			}
			logger.debug(
				`[MCREngine] Strategy "${currentStrategyId}" execution returned (OpID: ${operationId}):`,
				{ prologRules }
			);

			if (!prologRules || prologRules.length === 0) {
				logger.warn(
					`[MCREngine] Strategy "${currentStrategyId}" extracted no rules from text (OpID: ${operationId}): "${naturalLanguageText}"`
				);
				return {
					success: false,
					message: 'Could not translate text into valid rules.',
					error: ErrorCodes.NO_RULES_EXTRACTED,
					strategyId: currentStrategyId,
				};
			}
			logger.info(
				`[MCREngine] Successfully translated NL to Rules (Direct). OpID: ${operationId}. Rules count: ${prologRules.length}. Strategy ID: ${currentStrategyId}`
			);
			return {
				success: true,
				rules: prologRules,
				strategyId: currentStrategyId,
			};
		} catch (error) {
			logger.error(
				`[MCREngine] Error translating NL to Rules (Direct) using strategy "${currentStrategyId}" (OpID: ${operationId}): ${error.message}`,
				{ stack: error.stack, details: error.details, errorCode: error.code }
			);
			return {
				success: false,
				message: `Error during NL to Rules translation: ${error.message}`,
				error: error.code || ErrorCodes.STRATEGY_EXECUTION_ERROR,
				details: error.message,
				strategyId: currentStrategyId,
			};
		}
	}

	async translateRulesToNLDirect(prologRules, style = 'conversational') {
		const operationId = `transRulesToNL-${Date.now()}`;
		logger.info(
			`[MCREngine] Enter translateRulesToNLDirect (OpID: ${operationId}). Style: ${style}. Rules length: ${prologRules?.length}`
		);
		logger.debug(
			`[MCREngine] Rules for direct translation to NL (OpID: ${operationId}):\n${prologRules}`
		);

		if (
			!prologRules ||
			typeof prologRules !== 'string' ||
			prologRules.trim() === ''
		) {
			logger.warn(
				`[MCREngine] translateRulesToNLDirect called with empty or invalid prologRules. OpID: ${operationId}`
			);
			return {
				success: false,
				message: 'Input Prolog rules must be a non-empty string.',
				error: ErrorCodes.EMPTY_RULES_INPUT,
			};
		}

		const directRulesToNlPrompt = getPromptTemplateByName('RULES_TO_NL_DIRECT');
		if (!directRulesToNlPrompt) {
			logger.error('[MCREngine] RULES_TO_NL_DIRECT prompt template not found.');
			return {
				success: false,
				message:
					'Internal error: RULES_TO_NL_DIRECT prompt template not found.',
				error: ErrorCodes.PROMPT_TEMPLATE_NOT_FOUND,
			};
		}

		try {
			const promptContext = { prologRules, style };
			logger.info(
				`[MCREngine] Generating NL explanation from rules using LLM. OpID: ${operationId}`
			);
			logger.debug(
				`[MCREngine] Context for RULES_TO_NL_DIRECT prompt (OpID: ${operationId}):`,
				promptContext
			);
			const rulesToNLPromptUser = fillTemplate(
				directRulesToNlPrompt.user,
				promptContext
			);

			const llmExplanationResult = await this.callLLM(
				directRulesToNlPrompt.system,
				rulesToNLPromptUser
			);
			let nlExplanationText = null;
			if (
				llmExplanationResult &&
				typeof llmExplanationResult.text === 'string'
			) {
				nlExplanationText = llmExplanationResult.text;
			} else if (llmExplanationResult && llmExplanationResult.text === null) {
				nlExplanationText = null;
			}

			logger.debug(
				`[MCREngine] Prolog rules translated to NL (Direct) (OpID: ${operationId}):\n${nlExplanationText}`
			);

			if (
				nlExplanationText === null ||
				(typeof nlExplanationText === 'string' &&
					nlExplanationText.trim() === '')
			) {
				logger.warn(
					`[MCREngine] Empty explanation generated for rules to NL (Direct). OpID: ${operationId}`
				);
				return {
					success: false,
					message: 'Failed to generate a natural language explanation.',
					error: ErrorCodes.EMPTY_EXPLANATION_GENERATED,
				};
			}
			logger.info(
				`[MCREngine] Successfully translated Rules to NL (Direct). OpID: ${operationId}. Explanation length: ${nlExplanationText.length}.`
			);
			return { success: true, explanation: nlExplanationText };
		} catch (error) {
			logger.error(
				`[MCREngine] Error translating Rules to NL (Direct) (OpID: ${operationId}): ${error.message}`,
				{ error: error.stack }
			);
			return {
				success: false,
				message: `Error during Rules to NL translation: ${error.message}`,
				error: error.code || 'RULES_TO_NL_TRANSLATION_FAILED',
				details: error.message,
			};
		}
	}

	async explainQuery(sessionId, naturalLanguageQuestion) {
		const activeStrategyJson = await this.getOperationalStrategyJson(
			'Query',
			naturalLanguageQuestion
		);
		const currentStrategyId = activeStrategyJson.id;
		const operationId = `explain-${Date.now()}`;

		logger.info(
			`[MCREngine] Enter explainQuery for session ${sessionId} (OpID: ${operationId}). Strategy: "${activeStrategyJson.name}" (ID: ${currentStrategyId}). NL Question: "${naturalLanguageQuestion}"`
		);

		const sessionExists = await this.getSession(sessionId);
		if (!sessionExists) {
			return {
				success: false,
				message: 'Session not found.',
				error: ErrorCodes.SESSION_NOT_FOUND,
				strategyId: currentStrategyId,
			};
		}

		const debugInfo = {
			naturalLanguageQuestion,
			strategyId: currentStrategyId,
			operationId,
			level: this.config.debugLevel,
		};

		const explainPrologQueryPrompt = getPromptTemplateByName(
			'EXPLAIN_PROLOG_QUERY'
		);
		if (!explainPrologQueryPrompt) {
			logger.error(
				'[MCREngine] EXPLAIN_PROLOG_QUERY prompt template not found.'
			);
			return {
				success: false,
				message:
					'Internal error: EXPLAIN_PROLOG_QUERY prompt template not found.',
				error: ErrorCodes.PROMPT_TEMPLATE_NOT_FOUND,
				debugInfo,
			};
		}

		try {
			const existingFacts = (await this.getKnowledgeBase(sessionId)) || '';
			let contextOntologyRulesForQueryTranslation = '';
			try {
				const globalOntologies = await ontologyService.listOntologies(true);
				if (globalOntologies && globalOntologies.length > 0) {
					contextOntologyRulesForQueryTranslation = globalOntologies
						.map(ont => ont.rules)
						.join('\n');
				}
			} catch (ontError) {
				logger.warn(
					`[MCREngine] Error fetching global ontologies for NL_TO_QUERY context in explain (OpID: ${operationId}): ${ontError.message}`
				);
				debugInfo.ontologyErrorForStrategy = `Failed to load global ontologies for query translation context: ${ontError.message}`;
			}

			const lexiconSummary = await this.getLexiconSummary(sessionId);
			const initialStrategyContext = {
				naturalLanguageQuestion,
				existingFacts,
				ontologyRules: contextOntologyRulesForQueryTranslation,
				lexiconSummary,
				llm_model_id:
					this.config.llm[this.config.llm.provider]?.model || 'default',
			};

			logger.info(
				`[MCREngine] Executing strategy "${activeStrategyJson.name}" (ID: ${currentStrategyId}) for query translation in explain. OpID: ${operationId}.`
			);

			const prologQuery = await new StrategyExecutor(
				activeStrategyJson
			).execute(this, this, initialStrategyContext);

			if (typeof prologQuery !== 'string' || !prologQuery.endsWith('.')) {
				logger.error(
					`[MCREngine] Strategy "${currentStrategyId}" execution for explain query did not return a valid Prolog query string. OpID: ${operationId}. Output: ${prologQuery}`
				);
				throw new MCRError(
					ErrorCodes.STRATEGY_INVALID_OUTPUT,
					'Strategy execution for explain query returned an unexpected output format. Expected Prolog query string ending with a period.'
				);
			}
			logger.info(
				`[MCREngine] Strategy "${currentStrategyId}" translated NL to Prolog query for explanation (OpID: ${operationId}): ${prologQuery}`
			);
			debugInfo.prologQuery = prologQuery;

			if (this.config.debugLevel === 'verbose')
				debugInfo.sessionFactsSnapshot = existingFacts;
			else if (this.config.debugLevel === 'basic')
				debugInfo.sessionFactsSummary = `Session facts length: ${existingFacts.length}`;

			let explainPromptOntologyRules = '';
			try {
				const ontologiesForExplainPrompt =
					await ontologyService.listOntologies(true);
				if (
					ontologiesForExplainPrompt &&
					ontologiesForExplainPrompt.length > 0
				) {
					explainPromptOntologyRules = ontologiesForExplainPrompt
						.map(ont => ont.rules)
						.join('\n');
				}
			} catch (ontErrorForExplain) {
				logger.warn(
					`[MCREngine] Error fetching global ontologies for EXPLAIN_PROLOG_QUERY prompt context (OpID: ${operationId}): ${ontErrorForExplain.message}`
				);
				debugInfo.ontologyErrorForPrompt = `Failed to load global ontologies for explanation prompt: ${ontErrorForExplain.message}`;
			}
			if (this.config.debugLevel === 'verbose')
				debugInfo.ontologyRulesForPromptSnapshot = explainPromptOntologyRules;

			const explainPromptContext = {
				naturalLanguageQuestion,
				prologQuery,
				sessionFacts: existingFacts,
				ontologyRules: explainPromptOntologyRules,
			};
			const llmExplanationResult = await this.callLLM(
				explainPrologQueryPrompt.system,
				fillTemplate(explainPrologQueryPrompt.user, explainPromptContext)
			);
			const explanationText =
				llmExplanationResult && typeof llmExplanationResult.text === 'string'
					? llmExplanationResult.text
					: null;

			if (
				!explanationText ||
				(typeof explanationText === 'string' && explanationText.trim() === '')
			) {
				return {
					success: false,
					message: 'Failed to generate an explanation for the query.',
					debugInfo,
					error: ErrorCodes.LLM_EMPTY_RESPONSE,
					strategyId: currentStrategyId,
				};
			}
			return { success: true, explanation: explanationText, debugInfo };
		} catch (error) {
			logger.error(
				`[MCREngine] Error explaining query for session ${sessionId} (OpID: ${operationId}, Strategy ID: ${currentStrategyId}): ${error.message}`,
				{ stack: error.stack, details: error.details, errorCode: error.code }
			);
			debugInfo.error = error.message;
			return {
				success: false,
				message: `Error during query explanation: ${error.message}`,
				debugInfo,
				error: error.code || ErrorCodes.STRATEGY_EXECUTION_ERROR,
				details: error.message,
				strategyId: currentStrategyId,
			};
		}
	}

	async getPrompts() {
		const operationId = `getPrompts-${Date.now()}`;
		logger.info(`[MCREngine] Enter getPrompts (OpID: ${operationId})`);
		try {
			logger.debug(
				`[MCREngine] Successfully retrieved prompts. OpID: ${operationId}. Prompt count: ${Object.keys(prompts).length}`
			);
			return { success: true, prompts: prompts };
		} catch (error) {
			logger.error(
				`[MCREngine] Error retrieving prompts (OpID: ${operationId}): ${error.message}`,
				{ error: error.stack }
			);
			return {
				success: false,
				message: `Error retrieving prompts: ${error.message}`,
				error: error.code || 'GET_PROMPTS_FAILED',
				details: error.message,
			};
		}
	}

	async debugFormatPrompt(templateName, inputVariables) {
		const operationId = `debugFormat-${Date.now()}`;
		logger.info(
			`[MCREngine] Enter debugFormatPrompt (OpID: ${operationId}). Template: ${templateName}`,
			{ inputVariables }
		);

		if (!templateName || typeof templateName !== 'string') {
			logger.warn(
				`[MCREngine] Invalid template name for debugFormatPrompt. OpID: ${operationId}`,
				{ templateName }
			);
			return {
				success: false,
				message: 'Template name must be a non-empty string.',
				error: 'INVALID_TEMPLATE_NAME',
			};
		}
		if (!inputVariables || typeof inputVariables !== 'object') {
			logger.warn(
				`[MCREngine] Invalid input variables for debugFormatPrompt (OpID: ${operationId}). Received: ${typeof inputVariables}`,
				{ inputVariables }
			);
			return {
				success: false,
				message: 'Input variables must be an object.',
				error: 'INVALID_INPUT_VARIABLES',
			};
		}

		const template = prompts[templateName];
		if (!template) {
			logger.warn(
				`[MCREngine] Prompt template "${templateName}" not found for debugFormatPrompt. OpID: ${operationId}`
			);
			return {
				success: false,
				message: `Prompt template "${templateName}" not found.`,
				error: 'TEMPLATE_NOT_FOUND',
			};
		}
		if (!template.user) {
			logger.warn(
				`[MCREngine] Prompt template "${templateName}" has no 'user' field for debugFormatPrompt. OpID: ${operationId}`
			);
			return {
				success: false,
				message: `Prompt template "${templateName}" does not have a 'user' field to format.`,
				error: 'TEMPLATE_USER_FIELD_MISSING',
			};
		}

		try {
			logger.debug(
				`[MCREngine] Attempting to fill template "${templateName}" with variables. OpID: ${operationId}`
			);
			const formattedUserPrompt = fillTemplate(template.user, inputVariables);
			logger.info(
				`[MCREngine] Successfully formatted prompt "${templateName}". OpID: ${operationId}`
			);
			return {
				success: true,
				templateName,
				rawTemplate: template,
				formattedUserPrompt,
				inputVariables,
			};
		} catch (error) {
			logger.error(
				`[MCREngine] Error formatting prompt ${templateName} (OpID: ${operationId}): ${error.message}`,
				{ error: error.stack }
			);
			return {
				success: false,
				message: `Error formatting prompt: ${error.message}`,
				error: error.code || 'PROMPT_FORMATTING_FAILED',
				details: error.message,
			};
		}
	}

	async llmPassthrough(naturalLanguageText) {
		const operationId = `llmPassthrough-${Date.now()}`;
		logger.info(
			`[MCREngine] Enter llmPassthrough (OpID: ${operationId}). NL Text: "${naturalLanguageText}"`
		);

		try {
			const llmPassthroughPrompt = getPromptTemplateByName('LLM_PASSTHROUGH');
			if (!llmPassthroughPrompt) {
				logger.error('[MCREngine] LLM_PASSTHROUGH prompt template not found.');
				return {
					success: false,
					message: 'Internal error: LLM_PASSTHROUGH prompt template not found.',
					error: ErrorCodes.PROMPT_TEMPLATE_NOT_FOUND,
				};
			}

			const promptContext = { naturalLanguageText };
			const llmPassthroughPromptUser = fillTemplate(
				llmPassthroughPrompt.user,
				promptContext
			);

			const llmResult = await this.callLLM(
				llmPassthroughPrompt.system,
				llmPassthroughPromptUser
			);
			let responseText = null;
			if (llmResult && typeof llmResult.text === 'string') {
				responseText = llmResult.text;
			} else if (llmResult && llmResult.text === null) {
				responseText = null;
			}

			if (
				responseText === null ||
				(typeof responseText === 'string' && responseText.trim() === '')
			) {
				logger.warn(
					`[MCREngine] Empty response generated for llmPassthrough. OpID: ${operationId}`
				);
				return {
					success: false,
					message: 'Failed to generate a response.',
					error: ErrorCodes.LLM_EMPTY_RESPONSE,
				};
			}
			logger.info(
				`[MCREngine] Successfully generated response for llmPassthrough. OpID: ${operationId}. Response length: ${responseText.length}.`
			);
			return { success: true, response: responseText };
		} catch (error) {
			logger.error(
				`[MCREngine] Error in llmPassthrough (OpID: ${operationId}): ${error.message}`,
				{ error: error.stack }
			);
			return {
				success: false,
				message: `Error during llmPassthrough: ${error.message}`,
				error: error.code || 'LLM_PASSTHROUGH_FAILED',
				details: error.message,
			};
		}
	}

	async setSessionKnowledgeBase(sessionId, kbContent) {
		const operationId = `setKB-${Date.now()}`;
		logger.info(
			`[MCREngine] Enter setSessionKnowledgeBase for session ${sessionId}. OpID: ${operationId}. KB length: ${kbContent.length}`
		);

		const sessionExists = await this.getSession(sessionId);
		if (!sessionExists) {
			logger.warn(
				`[MCREngine] Session ${sessionId} not found for setKnowledgeBase. OpID: ${operationId}`
			);
			return {
				success: false,
				message: 'Session not found.',
				error: ErrorCodes.SESSION_NOT_FOUND,
			};
		}

		try {
			if (typeof kbContent !== 'string') {
				logger.error(
					`[MCREngine] Invalid kbContent type for setKnowledgeBase. OpID: ${operationId}. Type: ${typeof kbContent}`
				);
				return {
					success: false,
					message: 'Invalid knowledge base content: must be a string.',
					error: ErrorCodes.INVALID_KB_CONTENT,
				};
			}

			const success = await this.setKnowledgeBase(sessionId, kbContent);
			if (success) {
				const fullKnowledgeBase = await this.getKnowledgeBase(sessionId);
				logger.info(
					`[MCREngine] Knowledge base for session ${sessionId} successfully replaced. OpID: ${operationId}`
				);
				return {
					success: true,
					message: 'Knowledge base updated successfully.',
					fullKnowledgeBase,
				};
			} else {
				logger.error(
					`[MCREngine] Failed to set knowledge base in session store for session ${sessionId}. OpID: ${operationId}`
				);
				return {
					success: false,
					message: 'Failed to update knowledge base in session store.',
					error: ErrorCodes.SESSION_SET_KB_FAILED,
				};
			}
		} catch (error) {
			logger.error(
				`[MCREngine] Error setting knowledge base for session ${sessionId} (OpID: ${operationId}): ${error.message}`,
				{ stack: error.stack, details: error.details, errorCode: error.code }
			);
			return {
				success: false,
				message: `Error setting knowledge base: ${error.message}`,
				error: error.code || ErrorCodes.SESSION_SET_KB_FAILED,
				details: error.message,
			};
		}
	}

	async assertRawPrologToSession(sessionId, rules, validate = true) {
		const operationId = `assertRawProlog-${Date.now()}`;
		logger.info(
			`[MCREngine] Enter assertRawPrologToSession for session ${sessionId}. OpID: ${operationId}. Rules count/length: ${Array.isArray(rules) ? rules.length : rules.length}`
		);

		const sessionExists = await this.getSession(sessionId);
		if (!sessionExists) {
			logger.warn(
				`[MCREngine] Session ${sessionId} not found for raw Prolog assertion. OpID: ${operationId}`
			);
			return {
				success: false,
				message: 'Session not found.',
				error: ErrorCodes.SESSION_NOT_FOUND,
			};
		}

		const factsToAssert = Array.isArray(rules)
			? rules
			: rules
					.split(/(?<=\.)\s*/)
					.map(r => r.trim())
					.filter(r => r.length > 0);
		if (factsToAssert.length === 0) {
			logger.warn(
				`[MCREngine] No valid Prolog facts/rules provided to assert. OpID: ${operationId}`
			);
			return {
				success: false,
				message: 'No valid Prolog facts/rules provided.',
				error: ErrorCodes.NO_FACTS_TO_ASSERT,
			};
		}

		if (validate) {
			for (const factString of factsToAssert) {
				const validationResult = await this.validateKnowledgeBase(factString);
				if (!validationResult.isValid) {
					const validationErrorMsg = `Provided Prolog is invalid: "${factString}". Error: ${validationResult.error}`;
					logger.error(
						`[MCREngine] Validation failed for provided Prolog. OpID: ${operationId}. Details: ${validationErrorMsg}`
					);
					return {
						success: false,
						message: 'Failed to assert rules: Provided Prolog is invalid.',
						error: ErrorCodes.INVALID_PROVIDED_PROLOG,
						details: validationErrorMsg,
					};
				}
			}
			logger.info(
				`[MCREngine] All ${factsToAssert.length} provided Prolog snippets validated successfully. OpID: ${operationId}`
			);
		}

		try {
			const addSuccess = await this.addFacts(sessionId, factsToAssert);
			if (addSuccess) {
				const fullKnowledgeBase = await this.getKnowledgeBase(sessionId);
				logger.info(
					`[MCREngine] Raw Prolog facts/rules successfully added to session ${sessionId}. OpID: ${operationId}. Count: ${factsToAssert.length}`
				);
				return {
					success: true,
					message: 'Raw Prolog facts/rules asserted successfully.',
					addedFacts: factsToAssert,
					fullKnowledgeBase,
				};
			} else {
				logger.error(
					`[MCREngine] Failed to add raw Prolog to session ${sessionId} after validation/processing. OpID: ${operationId}`
				);
				return {
					success: false,
					message: 'Failed to add raw Prolog to session store.',
					error: ErrorCodes.SESSION_ADD_FACTS_FAILED,
				};
			}
		} catch (error) {
			logger.error(
				`[MCREngine] Error asserting raw Prolog to session ${sessionId} (OpID: ${operationId}): ${error.message}`,
				{ stack: error.stack, details: error.details, errorCode: error.code }
			);
			return {
				success: false,
				message: `Error during raw Prolog assertion: ${error.message}`,
				error: error.code || ErrorCodes.ASSERT_RAW_PROLOG_FAILED,
				details: error.message,
			};
		}
	}

	async addFacts(sessionId, newFacts) {
		let sessionData;
		if (this.config.sessionStore.type === 'file') {
			sessionData = await this._readSessionFile(sessionId);
		} else {
			sessionData = this.sessions[sessionId];
		}

		if (!sessionData) {
			logger.warn(
				`[MCREngine] Cannot add facts: Session not found: ${sessionId}`
			);
			return false;
		}
		if (
			!Array.isArray(newFacts) ||
			!newFacts.every(f => typeof f === 'string')
		) {
			logger.warn(
				`[MCREngine] Cannot add facts: newFacts must be an array of strings. Session: ${sessionId}`
			);
			return false;
		}

		const validatedFacts = newFacts
			.map(f => String(f).trim())
			.filter(f => f.length > 0 && f.endsWith('.'));

		if (validatedFacts.length !== newFacts.length) {
			logger.warn(
				`[MCREngine] Some facts were invalid and were not added to session ${sessionId}.`
			);
		}

		const newContextGraph = {
			...sessionData.contextGraph,
			facts: [...(sessionData.contextGraph?.facts || []), ...validatedFacts],
		};

		sessionData.facts.push(...validatedFacts);
		sessionData.contextGraph = newContextGraph;
		this._updateLexiconWithFacts(sessionData, validatedFacts);

		if (this.config.sessionStore.type === 'file') {
			await this._writeSessionFile(sessionId, sessionData);
		}

		logger.info(
			`[MCREngine] ${validatedFacts.length} facts added to session: ${sessionId}. Total facts: ${sessionData.facts.length}. Lexicon size: ${sessionData.lexicon.size}`
		);
		return true;
	}

	_updateLexiconWithFacts(sessionData, facts) {
		facts.forEach(fact => {
			const cleanFact = fact.replace(/%.*$/, '').trim();
			if (!cleanFact.endsWith('.')) return;
			let termToParse = cleanFact;
			const ruleMatch = cleanFact.match(/^(.*?):-(.*)\.$/);
			if (ruleMatch) {
				termToParse = ruleMatch[1].trim();
			} else {
				termToParse = cleanFact.slice(0, -1).trim();
			}
			const structuredTermMatch = termToParse.match(
				/^([a-z_][a-zA-Z0-9_]*)\((.*)\)$/
			);
			if (structuredTermMatch) {
				const predicate = structuredTermMatch[1];
				const argsString = structuredTermMatch[2];
				let arity = 0;
				if (argsString.trim() !== '') {
					const potentialArgs = argsString.match(
						/(?:[^,(]|\([^)]*\)|'[^']*')+/g
					);
					arity = potentialArgs ? potentialArgs.length : 0;
				}
				sessionData.lexicon.add(`${predicate}/${arity}`);
			} else {
				const simpleAtomMatch = termToParse.match(/^([a-z_][a-zA-Z0-9_]*)$/);
				if (simpleAtomMatch) {
					sessionData.lexicon.add(`${simpleAtomMatch[1]}/0`);
				} else {
					logger.debug(
						`[MCREngine] Could not parse predicate/arity from term: ${termToParse} in session ${sessionData.id}`
					);
				}
			}
		});
	}

	async getKnowledgeBase(sessionId) {
		let sessionData;
		if (this.config.sessionStore.type === 'file') {
			sessionData = await this._readSessionFile(sessionId);
		} else {
			sessionData = this.sessions[sessionId];
		}
		if (!sessionData) {
			logger.warn(
				`[MCREngine] Cannot get knowledge base: Session not found: ${sessionId}`
			);
			return null;
		}
		return sessionData.facts.join('\n');
	}

	async deleteSession(sessionId) {
		if (this.config.sessionStore.type === 'file') {
			const filePath = this._getFilePath(sessionId);
			try {
				await fs.unlink(filePath);
				logger.info(`[MCREngine] Session file deleted: ${filePath}`);
				return true;
			} catch (error) {
				if (error.code === 'ENOENT') {
					logger.warn(
						`[MCREngine] Cannot delete session: File not found: ${filePath}`
					);
					return false;
				}
				logger.error(
					`[MCREngine] Error deleting session file ${filePath}:`,
					error
				);
				throw error;
			}
		} else {
			if (!this.sessions[sessionId]) {
				logger.warn(
					`[MCREngine] Cannot delete session: Session not found: ${sessionId}`
				);
				return false;
			}
			delete this.sessions[sessionId];
			logger.info(`[MCREngine] Session deleted: ${sessionId}`);
			return true;
		}
	}

	async getLexiconSummary(sessionId) {
		let sessionData;
		if (this.config.sessionStore.type === 'file') {
			sessionData = await this._readSessionFile(sessionId);
		} else {
			sessionData = this.sessions[sessionId];
		}
		if (!sessionData) {
			logger.warn(
				`[MCREngine] Cannot get lexicon summary: Session not found: ${sessionId}`
			);
			return null;
		}
		if (sessionData.lexicon.size === 0) {
			return "No specific predicates identified in the current session's knowledge base yet.";
		}
		const sortedLexicon = Array.from(sessionData.lexicon).sort();
		return `Known Predicates (name/arity):\n- ${sortedLexicon.join('\n- ')}`;
	}

	async listSessions() {
		if (this.config.sessionStore.type === 'file') {
			try {
				const files = await fs.readdir(this.sessionsDir);
				const sessionFiles = files.filter(file => file.endsWith('.json'));

				const sessionsData = await Promise.all(
					sessionFiles.map(async file => {
						const sessionId = file.replace(/\.json$/, '');
						try {
							const session = await this._readSessionFile(sessionId);
							if (session) {
								return { id: session.id, createdAt: session.createdAt };
							}
						} catch (error) {
							logger.warn(
								`[MCREngine] Could not read or parse session file ${file}: ${error.message}`
							);
							return null;
						}
						return null;
					})
				);

				const validSessions = sessionsData.filter(s => s !== null);
				logger.debug(`[MCREngine] Listed ${validSessions.length} sessions.`);
				return validSessions;
			} catch (error) {
				logger.error(
					`[MCREngine] Error listing sessions from directory ${this.sessionsDir}:`,
					error
				);
				return [];
			}
		} else {
			const sessionList = Object.values(this.sessions).map(session => ({
				id: session.id,
				createdAt: session.createdAt,
			}));
			logger.debug(`[MCREngine] Listed ${sessionList.length} sessions.`);
			return sessionList;
		}
	}

	getLlmProvider(provider) {
		if (provider && provider['jest-mock']) {
			return provider;
		}
		if (provider) {
			this.llmProvider = provider;
		}
		if (!this.llmProvider) {
			const providerName = this.config.llm.provider.toLowerCase();
			logger.info(
				`[MCREngine] Attempting to initialize LLM provider: ${providerName}`
			);
			switch (providerName) {
				case 'ollama':
					this.llmProvider = OllamaProvider;
					break;
				case 'gemini':
					this.llmProvider = GeminiProvider;
					break;
				default:
					throw new Error(
						`Configuration Error: Unsupported LLM provider configured: "${providerName}". Supported providers are "ollama", "gemini".`
					);
			}
			logger.info(
				`[MCREngine] LLM Service initialized with provider: ${this.llmProvider.name}.`
			);
		}
		return this.llmProvider;
	}

	async callLLM(systemPrompt, userPrompt, options = {}, input = {}) {
		if (input.embed) {
			userPrompt += `\nEmbeddings context: ${JSON.stringify(input.embed)}`;
		}

		const provider = this.getLlmProvider(options.llmProvider);
		if (!provider || typeof provider.generate !== 'function') {
			logger.error(
				'[MCREngine] LLM provider is not correctly configured or does not support a generate function.'
			);
			throw new Error('LLM provider misconfiguration.');
		}

		try {
			const result = await provider.generate(systemPrompt, userPrompt, options);
			if (typeof result === 'string') {
				logger.warn(
					`[MCREngine] Provider ${provider.name} returned a string instead of {text, costData} object. Assuming no cost data.`
				);
				return { text: result, costData: null };
			}
			return result;
		} catch (error) {
			logger.error(
				`[MCREngine] Error during LLM generation with ${provider.name}: ${error.message}`,
				{
					provider: provider.name,
					systemPrompt,
					userPrompt,
					options,
					error,
				}
			);
			throw error;
		}
	}

	getReasonerProvider(provider) {
		if (provider) {
			this.reasonerProvider = provider;
		}
		if (!this.reasonerProvider) {
			const providerName = this.config.reasoner.provider.toLowerCase();
			logger.info(
				`[MCREngine] Attempting to initialize Reasoner provider: ${providerName}`
			);
			switch (providerName) {
				case 'prolog':
					this.reasonerProvider = PrologReasonerProvider;
					break;
				case 'ltn':
					this.reasonerProvider = PrologReasonerProvider;
					break;
				default:
					logger.error(
						`Unsupported Reasoner provider configured: ${providerName}. Defaulting to Prolog.`
					);
					this.reasonerProvider = PrologReasonerProvider;
			}
			logger.info(
				`[MCREngine] Reasoner Service initialized with provider: ${this.reasonerProvider.name}`
			);
		}
		return this.reasonerProvider;
	}

	async queryProlog(knowledgeBase, query, options = {}) {
		const provider = this.getReasonerProvider(options.reasonerProvider);
		if (!provider || typeof provider.executeQuery !== 'function') {
			logger.error(
				'[MCREngine] Reasoner provider is not correctly configured or does not support executeQuery.'
			);
			throw new Error('Reasoner provider misconfiguration.');
		}

		try {
			logger.debug(
				`[MCREngine] queryProlog called with provider ${provider.name}`,
				{ knowledgeBaseLen: knowledgeBase.length, query, options }
			);
			return await provider.executeQuery(knowledgeBase, query, options);
		} catch (error) {
			logger.error(
				`[MCREngine] Error during reasoner execution with ${provider.name}: ${error.message}`,
				{
					provider: provider.name,
					query,
					error,
				}
			);
			throw error;
		}
	}

	async probabilisticDeduce(clauses, query, threshold, embeddingBridge) {
		const queryVector = await embeddingBridge.encode(query);

		const weightedClauses = await Promise.all(
			clauses.map(async c => {
				const clauseVector = await embeddingBridge.encode(c.clause);
				const similarity = await embeddingBridge.similarity(
					queryVector,
					clauseVector
				);
				return { ...c, weight: similarity };
			})
		);

		const activeClauses = weightedClauses.filter(c => c.weight >= threshold);

		const knowledgeBase = activeClauses.map(c => c.clause).join('\n');
		const provider = this.getReasonerProvider();
		if (provider.name.toLowerCase() !== 'prolog') {
			throw new Error(
				'Probabilistic deduce currently relies on the Prolog reasoner.'
			);
		}

		return await provider.executeQuery(knowledgeBase, query);
	}

	async guidedDeduce(query, llmService, embeddingBridge, session) {
		const provider = this.getReasonerProvider();
		const { knowledgeBase, config } = session;
		const { ltnThreshold } = config ? config.reasoner : 0;

		const hypothesesResponse = await this.callLLM(
			'hypothesize.system',
			`Based on the query "${query}" and the knowledge base, generate potential answers.`
		);
		const hypotheses = hypothesesResponse.text.split('\n').map(h => h.trim());

		const results = [];
		for (const hypothesis of hypotheses) {
			const result = await provider.executeQuery(knowledgeBase, hypothesis);
			if (result.results.length > 0) {
				const probability =
					embeddingBridge && result.results[0].embedding
						? await embeddingBridge.similarity(
								await embeddingBridge.encode(query),
								result.results[0].embedding
							)
						: 0.9;

				if (probability >= ltnThreshold) {
					results.push({ proof: result.results[0], probability });
				}
			}
		}

		if (results.length === 0) {
			const deterministicResult = await provider.executeQuery(
				session.knowledgeBase,
				query
			);
			if (deterministicResult.results) {
				return deterministicResult.results.map(r => ({
					...r,
					probability: 1.0,
				}));
			}
			return [];
		}

		return results;
	}

	async validateKnowledgeBase(knowledgeBase) {
		const provider = this.getReasonerProvider();
		if (!provider || typeof provider.validate !== 'function') {
			logger.error(
				'[MCREngine] Reasoner provider is not correctly configured or does not support validate.'
			);
			throw new Error('Reasoner provider misconfiguration for validate.');
		}
		try {
			logger.debug(
				`[MCREngine] validateKnowledgeBase called with provider ${provider.name}`
			);
			return await provider.validate(knowledgeBase);
		} catch (error) {
			logger.error(
				`[MCREngine] Error during reasoner validation with ${provider.name}: ${error.message}`,
				{ provider: provider.name, error }
			);
			throw error;
		}
	}

	async getOperationalStrategyJson(
		operationType,
		naturalLanguageText,
		multi = true
	) {
		let strategyJson = null;
		const llmModelId =
			this.config.llm[this.config.llm.provider]?.model || 'default';

		if (this.inputRouterInstance && naturalLanguageText) {
			try {
				const recommendedStrategyId =
					await this.inputRouterInstance.getStrategy(naturalLanguageText);
				if (recommendedStrategyId) {
					strategyJson = strategyManager.getStrategy(recommendedStrategyId);
					if (strategyJson) {
						logger.info(
							`[MCREngine] InputRouter recommended strategy ID "${recommendedStrategyId}" for input: "${naturalLanguageText.substring(0, 50)}..."`
						);
					} else {
						logger.warn(
							`[MCREngine] InputRouter recommended strategy ID "${recommendedStrategyId}" but it was not found by StrategyManager. Falling back.`
						);
					}
				}
			} catch (routerError) {
				logger.error(
					`[MCREngine] InputRouter failed: ${routerError.message}. Falling back.`
				);
			}
		}

		if (!strategyJson) {
			let operationSuffix = operationType === 'Assert' ? '-Assert' : '-Query';
			if (operationType === 'Assert' && multi) {
				operationSuffix = '-Multi-Assert';
			}

			const operationalStrategyId = `${this.baseStrategyId}${operationSuffix}`;
			strategyJson = strategyManager.getStrategy(operationalStrategyId);
			if (strategyJson) {
				logger.info(
					`[MCREngine] Using configured operational strategy: "${strategyJson.id}"`
				);
			} else {
				logger.warn(
					`[MCREngine] Operational strategy "${operationalStrategyId}" not found. Trying base strategy "${this.baseStrategyId}".`
				);
				strategyJson =
					strategyManager.getStrategy(this.baseStrategyId) ||
					strategyManager.getDefaultStrategy();
				if (strategyJson) {
					logger.info(
						`[MCREngine] Using fallback strategy: "${strategyJson.id}"`
					);
				} else {
					logger.error(
						`[MCREngine] Failed to initialize with a default assertion strategy. Base ID: "${this.baseStrategyId}".`
					);
				}
			}
		}
		return strategyJson;
	}

	async logInitialStrategy() {
		try {
			const initialDisplayStrategy = await this.getOperationalStrategyJson(
				'Assert',
				'System startup initial strategy check.'
			);
			logger.info(
				`[MCREngine] Initialized with base translation strategy ID: "${this.baseStrategyId}". Effective assertion strategy: "${initialDisplayStrategy.name}" (ID: ${initialDisplayStrategy.id})`
			);
		} catch (e) {
			logger.error(
				`[MCREngine] Failed to initialize with a default assertion strategy. Base ID: "${this.baseStrategyId}". Error: ${e.message}`
			);
		}
	}

	async setTranslationStrategy(strategyId) {
		logger.debug(
			`[MCREngine] Attempting to set base translation strategy ID to: ${strategyId}`
		);
		const assertVariantId = `${strategyId}-Assert`;
		const queryVariantId = `${strategyId}-Query`;

		const assertStrategyExists = strategyManager.getStrategy(assertVariantId);
		const queryStrategyExists = strategyManager.getStrategy(queryVariantId);
		const baseStrategyItselfExists = strategyManager.getStrategy(strategyId);

		if (
			assertStrategyExists ||
			queryStrategyExists ||
			baseStrategyItselfExists
		) {
			const oldBaseStrategyId = this.baseStrategyId;
			this.baseStrategyId = strategyId;
			try {
				const currentAssertStrategy = await this.getOperationalStrategyJson(
					'Assert',
					'Strategy set check.'
				);
				logger.info(
					`[MCREngine] Base translation strategy ID changed from "${oldBaseStrategyId}" to "${this.baseStrategyId}". Effective assertion strategy: "${currentAssertStrategy.name}" (ID: ${currentAssertStrategy.id})`
				);
			} catch (e) {
				logger.warn(
					`[MCREngine] Base translation strategy ID changed from "${oldBaseStrategyId}" to "${this.baseStrategyId}", but failed to determine effective assertion strategy for logging: ${e.message}`
				);
			}
			return true;
		}

		logger.warn(
			`[MCREngine] Attempted to set unknown or invalid base strategy ID: ${strategyId}. Neither "${assertVariantId}", "${queryVariantId}" nor the base ID "${strategyId}" itself were found. Available strategies: ${JSON.stringify(strategyManager.getAvailableStrategies())}`
		);
		return false;
	}

	getActiveStrategyId() {
		return this.baseStrategyId;
	}

	async _refineLoop(operation, initialInput, context, maxIter = 3) {
		let currentResult = initialInput;
		let lastResult = null;
		let issues = [];
		let iteration = 1;
		const { embeddingBridge, session } = context;

		logger.info(
			`[MCREngine] Starting refinement loop for ${operation.name}. Max iterations: ${maxIter}`
		);

		while (iteration <= maxIter) {
			logger.info(`[RefineLoop] Iteration ${iteration}`);

			currentResult = await operation(currentResult, context);

			const validation = await this.validateKnowledgeBase(
				Array.isArray(currentResult) ? currentResult.join('\n') : currentResult
			);

			if (validation.isValid) {
				logger.info(
					`[RefineLoop] Validation successful on iteration ${iteration}. Loop terminated.`
				);
				return {
					result: currentResult,
					iterations: iteration,
					converged: true,
					history: issues,
				};
			}

			logger.warn(
				`[RefineLoop] Validation failed on iteration ${iteration}: ${validation.error}`
			);
			issues.push({ iteration, error: validation.error });

			if (iteration < maxIter) {
				const similarContext = {};
				if (embeddingBridge && session.embeddings.size > 0) {
					const inputEmbedding = await embeddingBridge.encode(
						Array.isArray(currentResult)
							? currentResult.join(' ')
							: currentResult
					);
					let bestMatch = null;
					let maxSim = -1;
					for (const [text, embedding] of session.embeddings.entries()) {
						const sim = await embeddingBridge.similarity(
							inputEmbedding,
							embedding
						);
						if (sim > maxSim) {
							maxSim = sim;
							bestMatch = text;
						}
					}
					if (bestMatch) {
						similarContext.embeddings = {
							most_similar_fact: bestMatch,
							similarity_score: maxSim,
						};
					}
				}

				const refinePromptContext = {
					original_input: initialInput,
					failed_output: currentResult,
					validation_error: validation.error,
					similar_context: JSON.stringify(similarContext),
					iteration,
				};

				const refinePrompt = getPromptTemplateByName('REFINE_FOR_CONSISTENCY');
				if (!refinePrompt) {
					throw new Error('REFINE_FOR_CONSISTENCY prompt template not found.');
				}

				const llmRefinement = await this.callLLM(
					refinePrompt.system,
					fillTemplate(refinePrompt.user, refinePromptContext)
				);

				if (llmRefinement.text) {
					logger.info(`[RefineLoop] LLM provided a refinement.`);
					currentResult = llmRefinement.text;
				} else {
					logger.warn(
						`[RefineLoop] LLM did not provide a refinement. Breaking loop.`
					);
					break;
				}
			}

			iteration++;
		}

		logger.warn(
			`[RefineLoop] Loop finished after ${maxIter} iterations without converging.`
		);
		return {
			result: currentResult,
			iterations: maxIter,
			converged: false,
			history: issues,
		};
	}

	async assertNLToSession(sessionId, naturalLanguageText, options = {}) {
		const { useLoops = true, multi = true } = options;
		const activeStrategyJson = await this.getOperationalStrategyJson(
			'Assert',
			naturalLanguageText,
			multi
		);
		if (!activeStrategyJson) {
			throw new MCRError(
				ErrorCodes.STRATEGY_NOT_FOUND,
				`Active strategy not found for session ${sessionId}. Please ensure a valid strategy is selected.`
			);
		}
		const currentStrategyId = activeStrategyJson.id;
		logger.info(
			`[MCREngine] Enter assertNLToSession for session ${sessionId} using strategy "${activeStrategyJson.name}" (ID: ${currentStrategyId}). NL Text: "${naturalLanguageText}"`
		);
		const operationId = `assert-${Date.now()}`;

		const session = await this.getSession(sessionId);
		if (!session) {
			logger.warn(
				`[MCREngine] Session ${sessionId} not found for assertion. OpID: ${operationId}`
			);
			return {
				success: false,
				message: 'Session not found.',
				error: ErrorCodes.SESSION_NOT_FOUND,
				strategyId: currentStrategyId,
			};
		}

		try {
			const existingFacts = (await this.getKnowledgeBase(sessionId)) || '';
			const ontologyRules =
				(await ontologyService.getGlobalOntologyRulesAsString()) || '';
			const lexiconSummary = await this.getLexiconSummary(sessionId);

			const nlToLogicOperation = async (nlInput, context) => {
				const strategyContext = {
					naturalLanguageText: nlInput,
					existingFacts,
					ontologyRules,
					lexiconSummary,
					llm_model_id:
						this.config.llm[this.config.llm.provider]?.model || 'default',
				};
				const executor = new StrategyExecutor(activeStrategyJson);
				const result = await executor.execute(
					this.llmProvider,
					this.reasonerProvider,
					strategyContext
				);

				if (result.intermediate_model) {
					session.contextGraph.models.push(result.intermediate_model);
				}
				return result;
			};

			let addedFacts;
			let loopInfo = {};

			if (useLoops) {
				const loopResult = await this._refineLoop(
					nlToLogicOperation,
					naturalLanguageText,
					{ session, embeddingBridge: this.embeddingBridge }
				);
				addedFacts = loopResult.result;
				loopInfo = {
					loopIterations: loopResult.iterations,
					loopConverged: loopResult.converged,
				};
			} else {
				addedFacts = await nlToLogicOperation(naturalLanguageText, { session });
				for (const factString of addedFacts) {
					const validationResult = await this.validateKnowledgeBase(factString);
					if (!validationResult.isValid) {
						const validationErrorMsg = `Generated Prolog is invalid: "${factString}". Error: ${validationResult.error}`;
						return {
							success: false,
							message: 'Failed to assert facts: Generated Prolog is invalid.',
							error: ErrorCodes.INVALID_GENERATED_PROLOG,
							details: validationErrorMsg,
							strategyId: currentStrategyId,
						};
					}
				}
			}

			if (
				!Array.isArray(addedFacts) ||
				!addedFacts.every(f => typeof f === 'string')
			) {
				throw new MCRError(
					ErrorCodes.STRATEGY_INVALID_OUTPUT,
					'Strategy did not return an array of strings.'
				);
			}

			if (addedFacts.length === 0) {
				return {
					success: true,
					message: 'No facts were extracted from the input.',
					error: ErrorCodes.NO_FACTS_EXTRACTED,
					strategyId: currentStrategyId,
					...loopInfo,
				};
			}

			const addSuccess = await this.addFacts(sessionId, addedFacts);
			if (addSuccess) {
				if (this.embeddingBridge && session.embeddings) {
					for (const fact of addedFacts) {
						const embedding = await this.embeddingBridge.encode(fact);
						session.embeddings.set(fact, embedding);
					}
				}
				if (this.config.kg.enabled && session.kbGraph) {
					for (const fact of addedFacts) {
						const parts = fact.slice(0, -1).split(/[()]/);
						if (parts.length >= 2) {
							const predicate = parts[0];
							const args = parts[1].split(',').map(s => s.trim());
							if (args.length === 2) {
								session.kbGraph.addTriple(args[0], predicate, args[1]);
							}
						}
					}
				}

				const fullKnowledgeBase = await this.getKnowledgeBase(sessionId);
				return {
					success: true,
					message: 'Facts asserted successfully.',
					addedFacts,
					fullKnowledgeBase,
					strategyId: currentStrategyId,
					...loopInfo,
				};
			} else {
				throw new MCRError(
					ErrorCodes.SESSION_ADD_FACTS_FAILED,
					'Failed to add facts to session store after validation.'
				);
			}
		} catch (error) {
			logger.error(
				`[MCREngine] Error asserting NL to session ${sessionId}: ${error.message}`,
				{ stack: error.stack }
			);
			return {
				success: false,
				message: `Error during assertion: ${error.message}`,
				error: error.code || ErrorCodes.STRATEGY_EXECUTION_ERROR,
				strategyId: currentStrategyId,
			};
		}
	}

	async querySessionWithNL(
		sessionId,
		naturalLanguageQuestion,
		queryOptions = {}
	) {
		const {
			dynamicOntology,
			style = 'conversational',
			trace = false,
			useLoops = true,
		} = queryOptions;

		const activeStrategyJson = await this.getOperationalStrategyJson(
			'Query',
			naturalLanguageQuestion
		);
		if (!activeStrategyJson) {
			throw new MCRError(
				ErrorCodes.STRATEGY_NOT_FOUND,
				`Active strategy not found for session ${sessionId}. Please ensure a valid strategy is selected.`
			);
		}
		const currentStrategyId = activeStrategyJson.id;
		const operationId = `query-${Date.now()}`;
		logger.info(
			`[MCREngine] Enter querySessionWithNL for session ${sessionId} using strategy "${activeStrategyJson.name}" (ID: ${currentStrategyId}). NL Question: "${naturalLanguageQuestion}"`,
			{ queryOptions }
		);

		const session = await this.getSession(sessionId);
		if (!session) {
			return {
				success: false,
				message: 'Session not found.',
				error: ErrorCodes.SESSION_NOT_FOUND,
				strategyId: currentStrategyId,
			};
		}

		const debugInfo = {
			strategyId: currentStrategyId,
			operationId,
			level: this.config.debugLevel,
			traceRequested: trace,
			loopsEnabled: useLoops,
		};

		try {
			const existingFacts = (await this.getKnowledgeBase(sessionId)) || '';
			const ontologyRules =
				(await ontologyService.getGlobalOntologyRulesAsString()) || '';
			const lexiconSummary = await this.getLexiconSummary(sessionId);

			const nlToQueryOperation = async nlInput => {
				const strategyContext = {
					naturalLanguageQuestion: nlInput,
					existingFacts,
					ontologyRules,
					lexiconSummary,
					llm_model_id:
						this.config.llm[this.config.llm.provider]?.model || 'default',
				};
				const executor = new StrategyExecutor(activeStrategyJson);
				return executor.execute(
					this.llmProvider,
					this.reasonerProvider,
					strategyContext
				);
			};

			let prologQuery;
			let nlToLogicLoopInfo = {};
			if (useLoops) {
				const loopResult = await this._refineLoop(
					nlToQueryOperation,
					naturalLanguageQuestion,
					{ session, embeddingBridge: this.embeddingBridge },
					2
				);
				prologQuery = loopResult.result;
				nlToLogicLoopInfo = {
					nlToLogicLoopIterations: loopResult.iterations,
					nlToLogicLoopConverged: loopResult.converged,
				};
				debugInfo.nlToLogicLoopHistory = loopResult.history;
			} else {
				prologQuery = await nlToQueryOperation(naturalLanguageQuestion);
			}

			if (typeof prologQuery !== 'string' || !prologQuery.endsWith('.')) {
				throw new MCRError(
					ErrorCodes.STRATEGY_INVALID_OUTPUT,
					'Strategy for query generation did not return a valid Prolog query string.'
				);
			}
			debugInfo.prologQuery = prologQuery;

			let knowledgeBase = await this.getKnowledgeBase(sessionId);
			knowledgeBase += `\n${ontologyRules}`;
			if (dynamicOntology) {
				knowledgeBase += `\n% --- Dynamic RAG Ontology (Query-Specific) ---\n${dynamicOntology.trim()}`;
				debugInfo.dynamicOntologyProvided = true;
			}

			const reasonerResult = await this.guidedDeduce(
				prologQuery,
				this,
				this.embeddingBridge,
				session
			);
			const prologResults = reasonerResult.map(r => r.proof);
			const probabilities = reasonerResult.map(r => r.probability);
			const proofTrace = null;
			debugInfo.prologResultsJSON = JSON.stringify(prologResults);
			debugInfo.probabilities = probabilities;

			const logicToNlOperation = async symbolicResultStr => {
				const promptContext = {
					naturalLanguageQuestion,
					prologResultsJSON: symbolicResultStr,
					style,
				};
				const llmResult = await this.callLLM(
					prompts.LOGIC_TO_NL_ANSWER.system,
					fillTemplate(prompts.LOGIC_TO_NL_ANSWER.user, promptContext)
				);
				if (!llmResult.text || llmResult.text.trim().length === 0) {
					throw new Error('LLM generated an empty answer.');
				}
				return llmResult.text;
			};

			let naturalLanguageAnswerText;
			let logicToNlLoopInfo = {};
			if (useLoops) {
				naturalLanguageAnswerText = await logicToNlOperation(
					JSON.stringify(prologResults)
				);
			} else {
				naturalLanguageAnswerText = await logicToNlOperation(
					JSON.stringify(prologResults)
				);
			}

			if (!naturalLanguageAnswerText) {
				throw new MCRError(
					ErrorCodes.LLM_EMPTY_RESPONSE,
					'Failed to generate a natural language answer.'
				);
			}

			let explanation = null;
			if (trace && proofTrace) {
				const tracePrompt = getPromptTemplateByName('LOGIC_TRACE_TO_NL');
				if (tracePrompt) {
					const llmTraceResult = await this.callLLM(
						tracePrompt.system,
						fillTemplate(tracePrompt.user, {
							trace: JSON.stringify(proofTrace, null, 2),
						})
					);
					explanation = llmTraceResult.text;
				}
			}
			debugInfo.loopInfo = { ...nlToLogicLoopInfo, ...logicToNlLoopInfo };

			return {
				success: true,
				answer: naturalLanguageAnswerText,
				explanation,
				debugInfo,
			};
		} catch (error) {
			logger.error(
				`[MCREngine] Error querying session ${sessionId}: ${error.message}`,
				{ stack: error.stack }
			);
			debugInfo.error = error.message;
			return {
				success: false,
				message: `Error during query: ${error.message}`,
				debugInfo,
				error: error.code || ErrorCodes.STRATEGY_EXECUTION_ERROR,
				strategyId: currentStrategyId,
			};
		}
	}

	async *executeProgram(sessionId, program) {
		logger.info(`[MCREngine] Executing program for session ${sessionId}`, {
			program,
		});
		const session = await this.getSession(sessionId);
		if (!session) {
			yield { op: 'error', message: 'Session not found' };
			return;
		}

		const context = {};

		for (const operation of program) {
			yield { op: 'status', message: `Executing operation: ${operation.op}` };
			switch (operation.op) {
				case 'neural':
					const { prompt, outputVar, storeEmbedding } = operation;
					const llmResult = await this.callLLM(prompt.system, prompt.user);
					context[outputVar] = llmResult.text;
					if (storeEmbedding && this.embeddingBridge) {
						const embedding = await this.embeddingBridge.encode(llmResult.text);
						session.contextGraph.embeddings[outputVar] = embedding;
					}
					yield { op: 'result', data: { [outputVar]: llmResult.text } };
					break;
				case 'symbolic':
					const { query, bindingsVar } = operation;
					const knowledgeBase = await this.getKnowledgeBase(sessionId);
					const results = await this.queryProlog(knowledgeBase, query);
					context[bindingsVar] = results;
					yield { op: 'result', data: { [bindingsVar]: results } };
					break;
				case 'hybrid':
					const { inputVar, refine, probabilistic } = operation;
					if (refine) {
						const loopResult = await this._refineLoop(
							async input => {
								const llmResult = await this.callLLM({
									system: 'Refine the following text:',
									user: input,
								});
								return llmResult.text;
							},
							context[inputVar],
							{ session, embeddingBridge: this.embeddingBridge }
						);
						context[inputVar] = loopResult.result;
						yield { op: 'result', data: { [inputVar]: loopResult.result } };
					}
					if (probabilistic) {
						const { clauses, query, threshold } = operation;
						const results = await this.probabilisticDeduce(
							clauses,
							query,
							threshold,
							this.embeddingBridge
						);
						yield { op: 'result', data: { results } };
					}
					break;
				default:
					yield { op: 'error', message: `Unknown operation: ${operation.op}` };
			}
		}
		yield { op: 'status', message: 'Execution finished' };
	}

	async handleInput(sessionId, input) {
		const program = [
			{
				op: 'neural',
				prompt: {
					system: 'You are a helpful assistant.',
					user: `Translate the following natural language text to a Prolog query: ${input}`,
				},
				outputVar: 'prologQuery',
				storeEmbedding: true,
			},
			{
				op: 'symbolic',
				query: 'prologQuery',
				bindingsVar: 'results',
			},
			{
				op: 'neural',
				prompt: {
					system: 'You are a helpful assistant.',
					user: `Based on the following results, provide a natural language response: {{results}}`,
				},
				outputVar: 'response',
			},
		];

		const results = [];
		for await (const result of this.executeProgram(sessionId, program)) {
			results.push(result);
		}
		return results;
	}

	async evolve(sessionId, input) {
		if (!this.config.evolution.enabled) {
			return {
				success: false,
				message: 'Evolution is not enabled in the configuration.',
			};
		}

		return {
			success: true,
			message: 'Evolution process completed.',
			results: [],
		};
	}

	async generateExample(domain, instructions) {
		const llmProviderName = this.config.llm.provider;
		const modelName = this.config.llm[llmProviderName]?.model;
		return generateExample(domain, instructions, llmProviderName, modelName);
	}

	async generateOntology(domain, instructions) {
		const llmProviderName = this.config.llm.provider;
		const modelName = this.config.llm[llmProviderName]?.model;
		return generateOntology(domain, instructions, llmProviderName, modelName);
	}
}

module.exports = MCREngine;
