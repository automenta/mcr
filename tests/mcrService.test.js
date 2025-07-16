// tests/mcrService.test.js

// Mock external modules first
jest.mock('../src/config', () => ({
    llm: {
        provider: 'mockProvider',
        mockProvider: { model: 'llamablit' },
    },
    sessionStore: { type: 'memory', filePath: './test-sessions' },
    translationStrategy: 'SIR-R1',
    kgEnabled: false,
    debugLevel: 'none',
    embeddingModel: 'mockEmbeddingModel',
    ontology: {
        directory: '/mock/ontology/dir',
    },
}));

// Mock external modules first


jest.mock('../src/llmService');
jest.mock('../src/reasonerService');
jest.mock('../src/ontologyService', () => ({
    getGlobalOntologyRulesAsString: jest.fn(),
    listOntologies: jest.fn(),
}));
jest.mock('../src/strategyManager', () => ({
    getStrategy: jest.fn(),
    getDefaultStrategy: jest.fn(() => ({
        id: 'default-strategy',
        name: 'Default Mock Strategy',
        nodes: [],
        edges: [],
    })),
    getOperationalStrategyJson: jest.fn(),
    getAvailableStrategies: jest.fn(),
}));
jest.mock('../src/bridges/embeddingBridge');
jest.mock('../src/evolution/keywordInputRouter.js');
jest.mock('../src/store/database');

// Mock Session Stores explicitly to control their instances
jest.mock('../src/store/InMemorySessionStore', () => {
    const mockInstance = {
        initialize: jest.fn().mockResolvedValue(undefined),
        createSession: jest.fn(),
        getSession: jest.fn(),
        addFacts: jest.fn(),
        getKnowledgeBase: jest.fn(),
        getLexiconSummary: jest.fn(),
        deleteSession: jest.fn(),
        setKnowledgeBase: jest.fn(),
    };
    return jest.fn(() => mockInstance);
});

jest.mock('../src/store/FileSessionStore', () => {
    const mockInstance = {
        initialize: jest.fn().mockResolvedValue(undefined),
        createSession: jest.fn(),
        getSession: jest.fn(),
        addFacts: jest.fn(),
        getKnowledgeBase: jest.fn(),
        getLexiconSummary: jest.fn(),
        deleteSession: jest.fn(),
        setKnowledgeBase: jest.fn(),
    };
    return jest.fn(() => mockInstance);
});


const { MCRError, ErrorCodes } = require('../src/errors');

describe('MCR Service (mcrService.js)', () => {
	let sessionId;
	let mockSessionStoreInstance;
	let mcrService;
	let llmService;
	let reasonerService;
	let InMemorySessionStore;
	let FileSessionStore;
	let ontologyService;
	let strategyManager;
	let config;
	let EmbeddingBridge;
	let KeywordInputRouter;
	let db;

	beforeEach(async () => {
		jest.resetModules();

		// Require modules inside beforeEach to ensure mocks are applied
		llmService = require('../src/llmService');
		reasonerService = require('../src/reasonerService');
		InMemorySessionStore = require('../src/store/InMemorySessionStore');
		FileSessionStore = require('../src/store/FileSessionStore');
		ontologyService = require('../src/ontologyService');
		strategyManager = require('../src/strategyManager');
		config = require('../src/config');
		EmbeddingBridge = require('../src/bridges/embeddingBridge');
		KeywordInputRouter = require('../src/evolution/keywordInputRouter.js');
		db = require('../src/store/database');

		// Set up config mocks before requiring mcrService
		config.llm = {
			provider: 'mockProvider',
			mockProvider: { model: 'llamablit' },
		};
		config.sessionStore = { type: 'memory', filePath: './test-sessions' };
		config.translationStrategy = 'SIR-R1';
		config.kgEnabled = false;
		config.debugLevel = 'none';
		config.embeddingModel = 'mockEmbeddingModel';

		// Re-require mcrService after all mocks are set up
		mcrService = require('../src/mcrService');

		sessionId = 'test-session-id';

		// Instantiate the mocked session store
		mockSessionStoreInstance = new InMemorySessionStore(); // This will now return the pre-configured mockInstance from the jest.mock factory

		// Set up mocks for imported functions/objects
		llmService.generate.mockResolvedValue({ text: 'mock llm response' });
		reasonerService.executeQuery.mockResolvedValue({ results: [] });
		reasonerService.validateKnowledgeBase.mockResolvedValue({ isValid: true });
		ontologyService.getGlobalOntologyRulesAsString.mockResolvedValue('mock ontology rules');

		strategyManager.getStrategy.mockImplementation(id => {
			if (id === 'SIR-R1-Assert' || id === 'SIR-R1-Query' || id === 'SIR-R1') {
				return { id, name: `Mock Strategy ${id}`, nodes: [], edges: [] };
			}
			return undefined;
		});
		strategyManager.getDefaultStrategy.mockReturnValue({
			id: 'default-strategy',
			name: 'Default Mock Strategy',
			nodes: [],
			edges: [],
		});
		strategyManager.getOperationalStrategyJson.mockResolvedValue({
			id: 'mock-strategy',
			name: 'Mock Strategy',
			nodes: [],
			edges: [],
		});
		strategyManager.getAvailableStrategies.mockReturnValue([
			{ id: 'SIR-R1-Assert', name: 'SIR-R1-Assert' },
			{ id: 'SIR-R1-Query', name: 'SIR-R1-Query' },
			{ id: 'SIR-R1', name: 'SIR-R1' },
		]);

		


		const session = {
			id: sessionId,
			facts: [],
			embeddings: new Map(),
			kbGraph: null,
		};
		// Set up the mock behaviors on the *instance* that mcrService will receive
		mockSessionStoreInstance.createSession.mockResolvedValue(session);
		mockSessionStoreInstance.getSession.mockResolvedValue(session);
		mockSessionStoreInstance.getKnowledgeBase.mockResolvedValue('');
		mockSessionStoreInstance.getLexiconSummary.mockResolvedValue(
			'mock lexicon'
		);
		mockSessionStoreInstance.addFacts.mockResolvedValue(true);
		mockSessionStoreInstance.setKnowledgeBase.mockResolvedValue(true); // Added this mock

		// Now call createSession, which will use the mocked sessionStore
		await mcrService.createSession(sessionId);
	});

	afterEach(() => {
		jest.clearAllMocks();
	});

	describe('assertNLToSession', () => {
		it('should successfully assert a natural language statement using SIR-R1-Assert strategy', async () => {
			const nlText = 'The sky is blue.';
			const prologFact = 'is_blue(sky).';
			const StrategyExecutor = require('../src/strategyExecutor');
			jest
				.spyOn(StrategyExecutor.prototype, 'execute')
				.mockResolvedValue([prologFact]);

			const result = await mcrService.assertNLToSession(sessionId, nlText, {
				useLoops: false,
			});
			expect(result.success).toBe(true);
			expect(result.message).toBe('Facts asserted successfully.');
			expect(result.addedFacts).toEqual([prologFact]);
		});

		it('should return session not found if sessionStore.getSession returns null', async () => {
			mockSessionStoreInstance.getSession.mockResolvedValue(null);
			const result = await mcrService.assertNLToSession(sessionId, 'Some text');
			expect(result.success).toBe(false);
			expect(result.message).toBe('Session not found.');
			expect(result.error).toBe('SESSION_NOT_FOUND');
		});

		it('should return NO_FACTS_EXTRACTED if strategy returns an empty array', async () => {
			const StrategyExecutor = require('../src/strategyExecutor');
			jest.spyOn(StrategyExecutor.prototype, 'execute').mockResolvedValue([]);

			const result = await mcrService.assertNLToSession(
				sessionId,
				'some text',
				{ useLoops: false }
			);
			expect(result.success).toBe(true);
			expect(result.message).toBe('No facts were extracted from the input.');
			expect(result.error).toBe(ErrorCodes.NO_FACTS_EXTRACTED);
		});

		it('should return SESSION_ADD_FACTS_FAILED if sessionStore.addFacts returns false', async () => {
			const nlText = 'The sky is blue.';
			const prologFact = 'is_blue(sky).';
			const StrategyExecutor = require('../src/strategyExecutor');
			jest
				.spyOn(StrategyExecutor.prototype, 'execute')
				.mockResolvedValue([prologFact]);
			mockSessionStoreInstance.addFacts.mockResolvedValue(false);
			const result = await mcrService.assertNLToSession(sessionId, nlText, {
				useLoops: false,
			});
			expect(result.success).toBe(false);
			expect(result.message).toBe(
				'Error during assertion: Failed to add facts to session store after validation.'
			);
		});
	});

	describe('querySessionWithNL', () => {
		it('should successfully query a session with NL using SIR-R1-Query strategy', async () => {
			const nlQuestion = 'Is the sky blue?';
			const prologQuery = 'is_blue(sky).';
			const nlAnswer = 'The sky is blue.';
			const StrategyExecutor = require('../src/strategyExecutor');
			jest
				.spyOn(StrategyExecutor.prototype, 'execute')
				.mockResolvedValue(prologQuery);
			reasonerService.guidedDeduce.mockResolvedValue([
				{ proof: { answer: 'yes' }, probability: 1 },
			]);
			llmService.generate.mockResolvedValue({ text: nlAnswer });
			const result = await mcrService.querySessionWithNL(
				sessionId,
				nlQuestion,
				{ useLoops: false }
			);
			expect(result.success).toBe(true);
			expect(result.answer).toBe(nlAnswer);
		});
	});

	describe('Hybrid Session', () => {
		it('should set embeddings when asserting a fact', async () => {
			const nlText = 'The grass is green.';
			const prologFact = 'is_green(grass).';
			const embedding = [[0.1, 0.2, 0.3]];

			const StrategyExecutor = require('../src/strategyExecutor');
			jest
				.spyOn(StrategyExecutor.prototype, 'execute')
				.mockResolvedValue([prologFact]);

			const session = {
				id: sessionId,
				facts: [],
				embeddings: new Map(),
				kbGraph: null,
			};
			mockSessionStoreInstance.getSession.mockResolvedValue(session);

			await mcrService.assertNLToSession(sessionId, nlText, {
				useLoops: false,
			});

			expect(session.embeddings.get(prologFact)).toEqual(embedding);
		});
	});

	describe('Refinement Loops', () => {
		it('should converge after one refinement loop', async () => {
			const nlText = 'The sun is hot.';
			const wrongProlog = 'is_hot(moon).';
			const correctProlog = 'is_hot(sun).';

			const StrategyExecutor = require('../src/strategyExecutor');
			const executeMock = jest
				.spyOn(StrategyExecutor.prototype, 'execute')
				.mockResolvedValueOnce([wrongProlog])
				.mockResolvedValueOnce([correctProlog]);

			reasonerService.validateKnowledgeBase
				.mockResolvedValueOnce({ isValid: false, error: 'Incorrect subject' })
				.mockResolvedValueOnce({ isValid: true });

			llmService.generate.mockResolvedValue({ text: 'is_hot(sun).' });

			const result = await mcrService.assertNLToSession(sessionId, nlText, {
				useLoops: true,
			});

			expect(result.success).toBe(true);
			expect(result.addedFacts).toEqual([correctProlog]);
			expect(result.loopIterations).toBe(2);
			expect(result.loopConverged).toBe(true);

			executeMock.mockRestore();
		});
	});
});