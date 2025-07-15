// tests/mcrService.hybrid.test.js

jest.mock('../src/bridges/embeddingBridge', () => {
  return jest.fn().mockImplementation(() => {
    return {
      encode: jest.fn().mockResolvedValue([0.1, 0.2, 0.3]),
      similarity: jest.fn().mockResolvedValue(0.9),
    };
  });
});

jest.mock('../src/bridges/kgBridge', () => {
  return jest.fn().mockImplementation(() => {
    return {
      addTriple: jest.fn(),
      queryTriples: jest.fn().mockResolvedValue([]),
      toJSON: jest.fn().mockReturnValue({}),
      fromJSON: jest.fn(),
    };
  });
});

jest.mock('../src/ontologyService', () => ({
    getGlobalOntologyRulesAsString: jest.fn().mockResolvedValue(''),
}));

const mcrService = require('../src/mcrService');
const EmbeddingBridge = require('../src/bridges/embeddingBridge');
const KnowledgeGraph = require('../src/bridges/kgBridge');
const config = require('../src/config');
const strategyManager = require('../src/strategyManager');
const llmService = require('../src/llmService');
const reasonerService = require('../src/reasonerService');
const ontologyService = require('../src/ontologyService');

describe('MCR Service Hybrid Functionality', () => {
  let sessionId;

  beforeEach(async () => {
    // Reset mocks
    jest.clearAllMocks();

    // Mock configuration for hybrid features
    config.kg.enabled = true;
    config.embedding.model = 'mock-model';

    const sessionResponse = await mcrService.createSession();
    sessionId = sessionResponse.id;
  });

  afterEach(async () => {
    if (sessionId) {
      await mcrService.deleteSession(sessionId);
    }
  });

  describe('Hybrid Session Management', () => {
    it('should add embeddings to session on assertion', async () => {
      const nlText = 'Socrates is a man.';
      strategyManager.getStrategy = jest.fn().mockReturnValue({
        id: 'test-strategy',
        name: 'Test Strategy',
        execute: async () => ['man(socrates).'],
      });
      await mcrService.assertNLToSession(sessionId, nlText);
      const session = await mcrService.getSession(sessionId);
      expect(session.embeddings.size).toBe(1);
    });

    it('should add triples to knowledge graph on assertion', async () => {
      const nlText = 'Socrates is a man.';
      strategyManager.getStrategy = jest.fn().mockReturnValue({
        id: 'test-strategy',
        name: 'Test Strategy',
        execute: async () => ['man(socrates).'],
      });
      await mcrService.assertNLToSession(sessionId, nlText);
      const session = await mcrService.getSession(sessionId);
      expect(session.kbGraph).not.toBeNull();
    });
  });

  describe('Refinement Loops', () => {
    it('should use refinement loop for assertions', async () => {
        const nlText = 'This is a test assertion.';
        const initialProlog = ['test_assertion.'];
        const refinedProlog = ['refined_assertion.'];

        strategyManager.getStrategy = jest.fn().mockReturnValue({
            id: 'test-strategy',
            name: 'Test Strategy',
        });

        const executor = require('../src/strategyExecutor');
        jest.spyOn(executor.prototype, 'execute')
            .mockResolvedValueOnce(initialProlog)
            .mockResolvedValueOnce(refinedProlog);

        jest.spyOn(reasonerService, 'validateKnowledgeBase')
            .mockResolvedValueOnce({ isValid: false, error: 'test error' })
            .mockResolvedValueOnce({ isValid: true });

        jest.spyOn(llmService, 'generate').mockResolvedValue({ text: refinedProlog[0] });

        const result = await mcrService.assertNLToSession(sessionId, nlText, { useLoops: true });

        expect(result.success).toBe(true);
        expect(result.addedFacts).toEqual(refinedProlog);
        expect(executor.prototype.execute).toHaveBeenCalledTimes(2);
    });

    it('should use refinement loop for queries', async () => {
        const nlQuestion = 'What is the test?';
        const initialQuery = 'test_query(X).';
        const refinedQuery = 'refined_query(X).';

        strategyManager.getStrategy = jest.fn().mockReturnValue({
            id: 'test-strategy',
            name: 'Test Strategy',
        });

        const executor = require('../src/strategyExecutor');
        jest.spyOn(executor.prototype, 'execute')
            .mockResolvedValueOnce(initialQuery)
            .mockResolvedValueOnce(refinedQuery);

        jest.spyOn(reasonerService, 'validateKnowledgeBase')
            .mockResolvedValueOnce({ isValid: false, error: 'test error' })
            .mockResolvedValueOnce({ isValid: true });

        jest.spyOn(llmService, 'generate').mockResolvedValue({ text: refinedQuery });
        jest.spyOn(reasonerService, 'guidedDeduce').mockResolvedValue([]);
        jest.spyOn(llmService, 'generate').mockResolvedValueOnce({text: 'Test Answer'});


        const result = await mcrService.querySessionWithNL(sessionId, nlQuestion, { useLoops: true });

        expect(result.success).toBe(true);
        expect(result.answer).toBe('Test Answer');
        expect(executor.prototype.execute).toHaveBeenCalledTimes(2);
    });
  });
});
