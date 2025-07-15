// new/tests/reasonerService.test.js

jest.mock('../src/config', () => ({
  llm: {
    provider: 'test-provider',
  },
  reasoner: {
    provider: 'prolog',
    type: 'prolog',
    ltnThreshold: 0.7,
  },
  logLevel: 'info',
  server: {},
  session: {},
  ontology: {},
  embedding: {},
  kg: {},
}));

jest.mock('../src/util/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const mockPrologReasonerExecuteQuery = jest.fn();
jest.mock('../src/reason/prologReasoner.js', () => ({
  name: 'prolog',
  isSupported: () => true,
  executeQuery: mockPrologReasonerExecuteQuery,
  validate: jest.fn().mockResolvedValue({ isValid: true }),
}));

const reasonerService = require('../src/reasonerService');
const llmService = require('../src/llmService');
const EmbeddingBridge = require('../src/bridges/embeddingBridge');
const config = require('../src/config');

jest.mock('../src/llmService');

jest.mock('../src/bridges/embeddingBridge');

describe('Reasoner Service', () => {
  let mockEmbeddingBridge;

  beforeEach(() => {
    mockEmbeddingBridge = new EmbeddingBridge();
    mockEmbeddingBridge.encode = jest.fn().mockResolvedValue([0.1, 0.2, 0.3]);
    mockEmbeddingBridge.similarity = jest.fn().mockResolvedValue(0.9);
    llmService.generate.mockClear();
    mockPrologReasonerExecuteQuery.mockClear();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('probabilisticDeduce', () => {
    it('should filter clauses based on similarity threshold', async () => {
        const clauses = [
            { clause: 'man(socrates).', vector: [0.1, 0.2, 0.3] },
            { clause: 'man(plato).', vector: [0.4, 0.5, 0.6] },
        ];
        const query = 'man(X).';
        const threshold = 0.7;
        mockEmbeddingBridge.similarity
            .mockResolvedValueOnce(0.9)
            .mockResolvedValueOnce(0.6);

        mockPrologReasonerExecuteQuery.mockResolvedValue({ results: [{ X: 'socrates' }] });

        await reasonerService.probabilisticDeduce(clauses, query, threshold, mockEmbeddingBridge);

        expect(mockPrologReasonerExecuteQuery).toHaveBeenCalledWith(
            'man(socrates). ',
            query
        );
    });
  });

  describe('guidedDeduce', () => {
    const query = 'mortal(socrates).';
    const session = {
      knowledgeBase: 'man(socrates). mortal(X) :- man(X).',
      embeddingBridge: mockEmbeddingBridge,
      config: config,
    };

    it('should use LLM to generate hypotheses and return probabilistic results', async () => {
      llmService.generate.mockResolvedValue({ text: 'mortal(socrates).' });
      mockPrologReasonerExecuteQuery.mockResolvedValue({ results: [{}] });

      const results = await reasonerService.guidedDeduce(query, llmService, mockEmbeddingBridge, session);

      expect(llmService.generate).toHaveBeenCalled();
      expect(results[0].probability).toBe(0.9);
    });

    it('should fall back to deterministic reasoning', async () => {
      llmService.generate.mockResolvedValue({ text: '' });
      mockPrologReasonerExecuteQuery.mockResolvedValue({ results: [{ a: 1}] });

      const results = await reasonerService.guidedDeduce(query, llmService, mockEmbeddingBridge, session);

      expect(results.every(r => r.probability === 1.0)).toBe(true);
    });

    it('should work with LTN probabilistic variant', async () => {
        config.reasoner.type = 'ltn';

        const clauses = [
            { clause: 'man(socrates).', vector: [0.1, 0.2, 0.3] },
            { clause: 'man(plato).', vector: [0.4, 0.5, 0.6] },
        ];
        const query = 'man(X).';
        const threshold = 0.7;
        mockEmbeddingBridge.similarity
            .mockResolvedValueOnce(0.9)
            .mockResolvedValueOnce(0.6);

        mockPrologReasonerExecuteQuery.mockResolvedValue({ results: [{ X: 'socrates' }] });

        await reasonerService.probabilisticDeduce(clauses, query, threshold, mockEmbeddingBridge);

        expect(mockPrologReasonerExecuteQuery).toHaveBeenCalledWith(
            'man(socrates). ',
            query
        );

        config.reasoner.type = 'prolog';
    });
  });
});
