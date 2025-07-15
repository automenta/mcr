// tests/mcrService.hybrid.test.js

jest.mock('../src/store/InMemorySessionStore', () => {
  return jest.fn().mockImplementation(() => {
    return {
      initialize: jest.fn().mockResolvedValue(undefined),
      createSession: jest.fn(),
      getSession: jest.fn(),
      addFacts: jest.fn(),
      getKnowledgeBase: jest.fn(),
      getLexiconSummary: jest.fn(),
      deleteSession: jest.fn(),
    };
  });
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

  beforeEach(() => {
    sessionId = 'test-session-id';
    mockSessionStoreInstance = new InMemorySessionStore();
    mcrService.sessionStore = mockSessionStoreInstance;

    llmService.generate.mockResolvedValue({ text: 'mock llm response' });
    reasonerService.executeQuery.mockResolvedValue({ results: [] });
    reasonerService.validateKnowledgeBase.mockResolvedValue({ isValid: true });
    mockSessionStoreInstance.getSession.mockImplementation(
      async (sessionId) => {
        if (sessions[sessionId]) {
          return {
            ...sessions[sessionId],
            embeddings: new Map(),
            kbGraph: { addTriple: jest.fn() },
          };
        }
        return {
          id: sessionId,
          facts: [],
          embeddings: new Map(),
          kbGraph: { addTriple: jest.fn() },
        };
      }
    );
    mockSessionStoreInstance.getKnowledgeBase.mockResolvedValue('');
    mockSessionStoreInstance.getLexiconSummary.mockResolvedValue(
      'mock lexicon'
    );
    mockSessionStoreInstance.addFacts.mockResolvedValue(true);
    ontologyService.getGlobalOntologyRulesAsString.mockResolvedValue(
      'mock ontology rules'
    );
    strategyManager.getStrategy.mockImplementation((id) => ({
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
