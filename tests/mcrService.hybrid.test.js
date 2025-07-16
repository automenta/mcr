// tests/mcrService.hybrid.test.js

jest.mock('../src/config', () => ({
    llm: {
        provider: 'mockProvider',
        mockProvider: { model: 'llamablit' },
    },
    sessionStore: { type: 'memory', filePath: './test-sessions' },
    translationStrategy: 'SIR-R1',
    kgEnabled: true, // Enable KG for hybrid tests
    debugLevel: 'none',
    embeddingModel: 'mockEmbeddingModel',
}));

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
jest.mock('../src/bridges/kgBridge', () => {
    const mockKnowledgeGraphInstance = {
        addTriple: jest.fn(),
        toJSON: jest.fn(() => ({})),
        fromJSON: jest.fn(),
    };
    const MockKnowledgeGraph = jest.fn(() => mockKnowledgeGraphInstance);
    MockKnowledgeGraph.mockInstance = mockKnowledgeGraphInstance;
    return MockKnowledgeGraph;
});

jest.mock('../src/llmService');
jest.mock('../src/reasonerService');
jest.mock('../src/ontologyService', () => ({
  getGlobalOntologyRulesAsString: jest.fn(),
}));
jest.mock('../src/strategyManager', () => ({
  getStrategy: jest.fn(),
  getOperationalStrategyJson: jest.fn(),
}));
jest.mock('../src/strategyExecutor');

const mcrService = require('../src/mcrService');
const llmService = require('../src/llmService');
const reasonerService = require('../src/reasonerService');
const InMemorySessionStore = require('../src/store/InMemorySessionStore');
const ontologyService = require('../src/ontologyService');
const strategyManager = require('../src/strategyManager');
const { MCRError, ErrorCodes } = require('../src/errors');
const StrategyExecutor = require('../src/strategyExecutor');

describe('MCR Service Hybrid Functionality', () => {
  let sessionId;
  let mockSessionStoreInstance;
  let mcrService;
  let llmService;
  let reasonerService;
  let InMemorySessionStore;
  let ontologyService;
  let strategyManager;
  let StrategyExecutor;
  let KnowledgeGraph;

  beforeEach(async () => {
    jest.resetModules();

    // Require modules inside beforeEach to ensure mocks are applied
    llmService = require('../src/llmService');
    reasonerService = require('../src/reasonerService');
    InMemorySessionStore = require('../src/store/InMemorySessionStore');
    ontologyService = require('../src/ontologyService');
    strategyManager = require('../src/strategyManager');
    StrategyExecutor = require('../src/strategyExecutor');
    KnowledgeGraph = require('../src/bridges/kgBridge');

    // Re-require mcrService after all mocks are set up
    mcrService = require('../src/mcrService');

    sessionId = 'test-session-id';
    mockSessionStoreInstance = new InMemorySessionStore();

    // Set up the session object with embeddings and kbGraph
    const session = {
      id: sessionId,
      facts: [],
      embeddings: new Map(),
      kbGraph: new KnowledgeGraph(),
    };

    mockSessionStoreInstance.createSession.mockResolvedValue(session);
    mockSessionStoreInstance.getSession.mockResolvedValue(session);
    mockSessionStoreInstance.addFacts.mockResolvedValue(true);
    mockSessionStoreInstance.getKnowledgeBase.mockResolvedValue('');
    mockSessionStoreInstance.getLexiconSummary.mockResolvedValue('mock lexicon');
    mockSessionStoreInstance.setKnowledgeBase.mockResolvedValue(true);

    mcrService.sessionStore = mockSessionStoreInstance;
    await mcrService.createSession(sessionId);

    llmService.generate.mockResolvedValue({ text: 'mock llm response' });
    reasonerService.executeQuery.mockResolvedValue({ results: [] });
    reasonerService.validateKnowledgeBase.mockResolvedValue({ isValid: true });

    mockSessionStoreInstance.addFacts.mockImplementation(async (id, newFacts) => {
        if (sessions[id]) {
            sessions[id].facts.push(...newFacts);
            return true;
        }
        return false;
    });
    mockSessionStoreInstance.getKnowledgeBase.mockResolvedValue('');
    mockSessionStoreInstance.getLexiconSummary.mockResolvedValue(
      'mock lexicon'
    );
    mockSessionStoreInstance.addFacts.mockResolvedValue(true);
    ontologyService.getGlobalOntologyRulesAsString.mockResolvedValue(
      'mock ontology rules'
    );
    strategyManager.getStrategy.mockImplementation(id => ({
      id,
      name: `Mock Strategy ${id}`,
      nodes: [],
      edges: [],
    }));
    mcrService.getOperationalStrategyJson = jest.fn().mockResolvedValue({
      id: 'mock-strategy',
      name: 'Mock Strategy',
      nodes: [],
      edges: [],
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Hybrid Session Management', () => {
    it('should add embeddings to session on assertion', async () => {
      const nlText = 'Socrates is a man.';
      const prologFact = 'man(socrates).';
      const embedding = [0.1, 0.2, 0.3];
      StrategyExecutor.prototype.execute.mockResolvedValue([prologFact]);
      const mcr = require('../src/mcrService');
      mcr.embeddingBridge = {
        encode: jest.fn().mockResolvedValue(embedding),
      };

      await mcrService.assertNLToSession(sessionId, nlText);
      const session = await mcrService.getSession(sessionId);
      expect(session.embeddings.size).toBe(1);
    });

    it('should add triples to knowledge graph on assertion', async () => {
      const nlText = 'Socrates is a man.';
      const prologFact = 'man(socrates).';
      StrategyExecutor.prototype.execute.mockResolvedValue([prologFact]);

      await mcrService.assertNLToSession(sessionId, nlText);
      const session = await mcrService.getSession(sessionId);
      expect(session.kbGraph).not.toBeNull();
    });
  });

  describe('Refinement Loops', () => {
    it('should use refinement loop for assertions', async () => {
      const nlText = 'This is a test assertion.';
      const initialProlog = 'initial_fact.';
      const refinedProlog = 'refined_fact.';

      StrategyExecutor.prototype.execute
        .mockResolvedValueOnce([initialProlog])
        .mockResolvedValueOnce([refinedProlog]);

      reasonerService.validateKnowledgeBase
        .mockResolvedValueOnce({
          isValid: false,
          error: 'Initial fact is wrong',
        })
        .mockResolvedValueOnce({ isValid: true });

      llmService.generate.mockResolvedValue({ text: refinedProlog });

      const result = await mcrService.assertNLToSession(sessionId, nlText, {
        useLoops: true,
      });

      expect(result.success).toBe(true);
      expect(result.addedFacts).toEqual([refinedProlog]);
      expect(StrategyExecutor.prototype.execute).toHaveBeenCalledTimes(2);
    });

    it('should use refinement loop for queries', async () => {
      const nlQuestion = 'What is the test?';
      const initialQuery = 'test_query(X).';
      const refinedQuery = 'refined_query(X).';
      const finalAnswer = 'Test Answer';

      StrategyExecutor.prototype.execute
        .mockResolvedValueOnce(initialQuery)
        .mockResolvedValueOnce(refinedQuery);

      reasonerService.validateKnowledgeBase
        .mockResolvedValueOnce({
          isValid: false,
          error: 'Initial query is wrong',
        })
        .mockResolvedValueOnce({ isValid: true });

      llmService.generate
        .mockResolvedValueOnce({ text: refinedQuery }) // Refinement
        .mockResolvedValueOnce({ text: finalAnswer }); // Final answer

      reasonerService.guidedDeduce.mockResolvedValue([
        { proof: { answer: 'yes' }, probability: 1 },
      ]);

      const result = await mcrService.querySessionWithNL(
        sessionId,
        nlQuestion,
        { useLoops: true }
      );

      expect(result.success).toBe(true);
      expect(result.answer).toBe('Test Answer');
      expect(StrategyExecutor.prototype.execute).toHaveBeenCalledTimes(2);
    });
  });
});
