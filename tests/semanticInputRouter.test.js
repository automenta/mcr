// tests/semanticInputRouter.test.js
const SemanticInputRouter = require('../src/evolution/semanticInputRouter');
const EmbeddingService = require('../src/services/embeddingService'); // Using the mock
const { inputArchetypes } = require('../src/evolution/semanticArchetypes');
const logger = require('../src/logger');
const { MCRError, ErrorCodes } = require('../src/errors');

// Mock logger to prevent console output during tests and allow assertions
jest.mock('../src/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

describe('SemanticInputRouter', () => {
  let mockDb;
  let mockEmbeddingService;
  let semanticInputRouter;

  beforeEach(() => {
    logger.info.mockClear();
    logger.warn.mockClear();
    logger.error.mockClear();
    logger.debug.mockClear();

    mockDb = {
      queryPerformanceResults: jest.fn(),
    };

    // Use the actual (mock) EmbeddingService but spy on its methods
    mockEmbeddingService = new EmbeddingService({ embeddingDimension: 3 }); // Use small dimension for predictable mock
    jest.spyOn(mockEmbeddingService, 'getEmbedding');
    jest.spyOn(mockEmbeddingService, 'getEmbeddings');

    semanticInputRouter = new SemanticInputRouter(mockDb, mockEmbeddingService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with db and embeddingService', () => {
      expect(semanticInputRouter.db).toBe(mockDb);
      expect(semanticInputRouter.embeddingService).toBe(mockEmbeddingService);
      expect(logger.info).toHaveBeenCalledWith(
        '[SemanticInputRouter] Initialized with database and embedding service.'
      );
    });

    it('should throw MCRError if db instance is not provided', () => {
      expect(() => new SemanticInputRouter(null, mockEmbeddingService)).toThrow(
        new MCRError(
          ErrorCodes.INTERNAL_ERROR,
          'SemanticInputRouter requires a database instance.'
        )
      );
    });

    it('should throw MCRError if embeddingService is not provided', () => {
      expect(() => new SemanticInputRouter(mockDb, null)).toThrow(
        new MCRError(
          ErrorCodes.INTERNAL_ERROR,
          'SemanticInputRouter requires an embedding service instance.'
        )
      );
    });
  });

  describe('cosineSimilarity', () => {
    it('should calculate cosine similarity correctly for valid vectors', () => {
      expect(
        semanticInputRouter.cosineSimilarity([1, 0, 0], [1, 0, 0])
      ).toBeCloseTo(1);
      expect(
        semanticInputRouter.cosineSimilarity([1, 0, 0], [0, 1, 0])
      ).toBeCloseTo(0);
      expect(
        semanticInputRouter.cosineSimilarity([1, 0, 0], [-1, 0, 0])
      ).toBeCloseTo(-1);
      expect(
        semanticInputRouter.cosineSimilarity([1, 2, 3], [1, 2, 3])
      ).toBeCloseTo(1);
      expect(
        semanticInputRouter.cosineSimilarity([1, 2, 3], [2, 4, 6])
      ).toBeCloseTo(1); // Parallel vectors
      expect(semanticInputRouter.cosineSimilarity([1, 1], [1, -1])).toBeCloseTo(
        0
      );
    });

    it('should return 0 for zero magnitude vectors', () => {
      expect(semanticInputRouter.cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(
        0
      );
      expect(semanticInputRouter.cosineSimilarity([1, 2, 3], [0, 0, 0])).toBe(
        0
      );
    });

    it('should return 0 for mismatched length vectors or invalid input', () => {
      expect(semanticInputRouter.cosineSimilarity([1, 0], [1, 0, 0])).toBe(0);
      expect(semanticInputRouter.cosineSimilarity(null, [1, 0, 0])).toBe(0);
      expect(semanticInputRouter.cosineSimilarity([1, 0, 0], undefined)).toBe(
        0
      );
      expect(semanticInputRouter.cosineSimilarity([], [])).toBe(0);
    });
  });

  describe('_initializeArchetypeEmbeddings', () => {
    it('should fetch and cache embeddings for all archetypes', async () => {
      const mockArchetypeEmbeddings = inputArchetypes.map((arch, i) => [
        0.1 * i,
        0.2 * i,
        0.3 * i,
      ]);
      mockEmbeddingService.getEmbeddings.mockResolvedValue(
        mockArchetypeEmbeddings
      );

      await semanticInputRouter._initializeArchetypeEmbeddings();

      expect(mockEmbeddingService.getEmbeddings).toHaveBeenCalledWith(
        inputArchetypes.map((arch) => arch.description)
      );
      expect(semanticInputRouter.archetypeEmbeddingsCache).not.toBeNull();
      inputArchetypes.forEach((arch, i) => {
        expect(
          semanticInputRouter.archetypeEmbeddingsCache.get(arch.id)
        ).toEqual(mockArchetypeEmbeddings[i]);
      });
      expect(logger.info).toHaveBeenCalledWith(
        '[SemanticInputRouter] Archetype embeddings initialized and cached.'
      );
    });

    it('should throw MCRError if embeddingService fails', async () => {
      mockEmbeddingService.getEmbeddings.mockRejectedValue(
        new Error('Embedding service failed')
      );
      await expect(
        semanticInputRouter._initializeArchetypeEmbeddings()
      ).rejects.toThrow(
        new MCRError(
          ErrorCodes.EMBEDDING_SERVICE_ERROR,
          'Failed to generate embeddings for semantic archetypes.'
        )
      );
      expect(semanticInputRouter.archetypeEmbeddingsCache).toBeNull();
    });
  });

  describe('classifyInput', () => {
    // Mock specific embeddings for archetypes for predictable tests
    const mockDefinitionEmbedding = [1, 0, 0]; // Represents "definition_request"
    const mockCausalEmbedding = [0, 1, 0]; // Represents "causal_assertion"
    const mockFactualEmbedding = [0, 0, 1]; // Represents "factual_assertion"

    beforeEach(async () => {
      // Pre-populate cache with known mock embeddings for specific archetypes
      // This setup makes classifyInput tests more predictable by controlling archetype embeddings
      semanticInputRouter.archetypeEmbeddingsCache = new Map();

      const definitionArchetype = inputArchetypes.find(
        (a) => a.id === 'definition_request'
      );
      const causalArchetype = inputArchetypes.find(
        (a) => a.id === 'causal_assertion'
      );
      const factualArchetype = inputArchetypes.find(
        (a) => a.id === 'factual_assertion'
      );

      if (definitionArchetype)
        semanticInputRouter.archetypeEmbeddingsCache.set(
          definitionArchetype.id,
          mockDefinitionEmbedding
        );
      if (causalArchetype)
        semanticInputRouter.archetypeEmbeddingsCache.set(
          causalArchetype.id,
          mockCausalEmbedding
        );
      if (factualArchetype)
        semanticInputRouter.archetypeEmbeddingsCache.set(
          factualArchetype.id,
          mockFactualEmbedding
        );

      // Mock getEmbeddings for any _initializeArchetypeEmbeddings call not to interfere
      // This ensures that if _initializeArchetypeEmbeddings is called unexpectedly, it doesn't error out
      // or overwrite our specific mocks if we only set a few.
      const fullMockEmbeddings = inputArchetypes.map((arch) => {
        if (arch.id === 'definition_request') return mockDefinitionEmbedding;
        if (arch.id === 'causal_assertion') return mockCausalEmbedding;
        if (arch.id === 'factual_assertion') return mockFactualEmbedding;
        return [Math.random(), Math.random(), Math.random()]; // Generic for others
      });
      mockEmbeddingService.getEmbeddings.mockResolvedValue(fullMockEmbeddings);
    });

    it('should return the archetype ID with the highest cosine similarity', async () => {
      const inputText = 'What is love?';
      // Mock input text embedding to be very similar to definition_request
      const inputEmbedding = [0.9, 0.1, 0.05];
      mockEmbeddingService.getEmbedding.mockResolvedValue(inputEmbedding);

      // Ensure _initializeArchetypeEmbeddings is called if cache is not set manually for all
      // For this test, we've manually set the relevant ones.
      // If it wasn't manually set, this would call the getEmbeddings mock.
      if (!semanticInputRouter.archetypeEmbeddingsCache.size) {
        await semanticInputRouter._initializeArchetypeEmbeddings();
      }

      const classification = await semanticInputRouter.classifyInput(inputText);
      expect(mockEmbeddingService.getEmbedding).toHaveBeenCalledWith(inputText);
      expect(classification).toBe('definition_request');
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining(`Classified input as 'definition_request'`)
      );
    });

    it('should classify another input correctly based on similarity', async () => {
      const inputText = 'Rain causes puddles.';
      // Mock input text embedding to be very similar to causal_assertion
      const inputEmbedding = [0.1, 0.9, 0.05];
      mockEmbeddingService.getEmbedding.mockResolvedValue(inputEmbedding);

      if (!semanticInputRouter.archetypeEmbeddingsCache.size) {
        await semanticInputRouter._initializeArchetypeEmbeddings();
      }

      const classification = await semanticInputRouter.classifyInput(inputText);
      expect(classification).toBe('causal_assertion');
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining(`Classified input as 'causal_assertion'`)
      );
    });

    it('should fallback if archetype embeddings are not initialized', async () => {
      semanticInputRouter.archetypeEmbeddingsCache = null; // Force uninitialized state
      // Simulate getEmbeddings failing during initialization
      mockEmbeddingService.getEmbeddings.mockRejectedValue(
        new Error('Failed to init')
      );

      const text = 'This is a test query?';
      // classifyInput should throw if _initializeArchetypeEmbeddings throws
      await expect(semanticInputRouter.classifyInput(text)).rejects.toThrow(
        new MCRError(
          ErrorCodes.EMBEDDING_SERVICE_ERROR,
          'Failed to generate embeddings for semantic archetypes.'
        )
      );
      // Check that the logger was called about the init failure from _initializeArchetypeEmbeddings
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to initialize archetype embeddings: Failed to init'),
        expect.anything() // For the { stack: ... } object
      );
    });

    it('should fallback if input embedding generation fails', async () => {
      await semanticInputRouter._initializeArchetypeEmbeddings(); // Ensure archetypes are loaded
      mockEmbeddingService.getEmbedding.mockRejectedValue(
        new Error('Embedding failed for input')
      );

      const text = 'This is a statement.';
      const classification = await semanticInputRouter.classifyInput(text);
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining(
          'Error during semantic classification: Embedding failed for input'
        )
      );
      expect(classification).toBe('general_assert'); // Default fallback for assertion-like text
    });

    it('should return general_assert for empty text', async () => {
      const classification = await semanticInputRouter.classifyInput('');
      expect(classification).toBe('general_assert');
      expect(logger.warn).toHaveBeenCalledWith(
        '[SemanticInputRouter] classifyInput called with empty text.'
      );
    });
  });

  describe('getBestStrategy', () => {
    const llmModelId = 'test_model';
    const inputClass = 'definition_request'; // Example semantic archetype

    it('should query performance_results with inputClass as input_type', async () => {
      mockDb.queryPerformanceResults.mockResolvedValue([]);
      await semanticInputRouter.getBestStrategy(inputClass, llmModelId);

      expect(mockDb.queryPerformanceResults).toHaveBeenCalledWith(
        expect.stringContaining('AND input_type = ?'), // Check if query filters by input_type
        [llmModelId, inputClass]
      );
    });

    it('should return the best strategy_hash based on scoring logic', async () => {
      const results = [
        {
          strategy_hash: 'hash1',
          metrics: JSON.stringify({ exactMatchProlog: 1 }),
          latency_ms: 100,
          cost: JSON.stringify({ total_tokens: 10 }),
        }, // Score: 1*100 + 1000/101*10 + 1000/11*1 ~ 100 + 99 + 90 = 289
        {
          strategy_hash: 'hash2',
          metrics: JSON.stringify({ exactMatchAnswer: 1 }),
          latency_ms: 50,
          cost: JSON.stringify({ total_tokens: 5 }),
        }, // Score: 1*100 + 1000/51*10 + 1000/6*1 ~ 100 + 196 + 166 = 462 <--- BEST
        {
          strategy_hash: 'hash1',
          metrics: JSON.stringify({ prologStructureMatch: 1 }),
          latency_ms: 120,
          cost: JSON.stringify({ total_tokens: 12 }),
        }, // Score for hash1: 0.5*100 + 1000/121*10 + 1000/13*1 ~ 50 + 82 + 76 = 208
      ];
      mockDb.queryPerformanceResults.mockResolvedValue(results);
      const bestStrategy = await semanticInputRouter.getBestStrategy(
        inputClass,
        llmModelId
      );
      expect(bestStrategy).toBe('hash2');
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining(`Best strategy selected: hash2`)
      );
    });

    it('should return null if no performance results found', async () => {
      mockDb.queryPerformanceResults.mockResolvedValue([]);
      const bestStrategy = await semanticInputRouter.getBestStrategy(
        inputClass,
        llmModelId
      );
      expect(bestStrategy).toBeNull();
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('No performance results found')
      );
    });

    it('should return null if database query fails', async () => {
      mockDb.queryPerformanceResults.mockRejectedValue(new Error('DB Error'));
      const bestStrategy = await semanticInputRouter.getBestStrategy(
        inputClass,
        llmModelId
      );
      expect(bestStrategy).toBeNull();
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining(
          '[SemanticInputRouter] Error getting best strategy: DB Error'
        )
      );
    });
  });

  describe('route', () => {
    const llmModelId = 'test_model_route';
    const text = 'What is the meaning of life?';

    beforeEach(() => {
      // Spy on methods of the instance of semanticInputRouter
      // semanticInputRouter is already an instance, so we spy on its methods directly
      jest.spyOn(semanticInputRouter, 'classifyInput');
      jest.spyOn(semanticInputRouter, 'getBestStrategy');
      // Ensure archetype embeddings are ready for classifyInput
      const mockArchetypeEmbeddings = inputArchetypes.map((arch, i) => [
        0.1 * i,
        0.2 * i,
        0.3 * i,
      ]);
      mockEmbeddingService.getEmbeddings.mockResolvedValue(
        mockArchetypeEmbeddings
      );
    });

    it('should call classifyInput and getBestStrategy', async () => {
      semanticInputRouter.classifyInput.mockResolvedValue('definition_request'); // Mock return of classifyInput
      semanticInputRouter.getBestStrategy.mockResolvedValue(
        'best_strategy_hash'
      ); // Mock return of getBestStrategy

      await semanticInputRouter.route(text, llmModelId);

      expect(semanticInputRouter.classifyInput).toHaveBeenCalledWith(text);
      expect(semanticInputRouter.getBestStrategy).toHaveBeenCalledWith(
        'definition_request',
        llmModelId
      );
    });

    it('should return strategy hash if recommended', async () => {
      const expectedHash = 'strategy123_semantic';
      // Let classifyInput run, but mock its underlying embedding calls if needed
      mockEmbeddingService.getEmbedding.mockResolvedValue([0.1, 0.2, 0.3]); // For the input text
      // getBestStrategy will be called with the result of classifyInput
      semanticInputRouter.getBestStrategy.mockResolvedValue(expectedHash);

      const result = await semanticInputRouter.route(text, llmModelId);
      // The actual classification depends on mock embeddings, ensure it's called
      expect(semanticInputRouter.classifyInput).toHaveBeenCalledWith(text);
      const classificationResult =
        await semanticInputRouter.classifyInput.mock.results[0].value;

      expect(semanticInputRouter.getBestStrategy).toHaveBeenCalledWith(
        classificationResult,
        llmModelId
      );
      expect(result).toBe(expectedHash);
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining(
          `Recommended strategy HASH: ${expectedHash.substring(0, 12)}... for semantic input class "${classificationResult}"`
        )
      );
    });

    it('should return null if no strategy is recommended', async () => {
      mockEmbeddingService.getEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);
      semanticInputRouter.getBestStrategy.mockResolvedValue(null); // No strategy found

      const result = await semanticInputRouter.route(text, llmModelId);
      const classificationResult =
        await semanticInputRouter.classifyInput.mock.results[0].value;

      expect(result).toBeNull();
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining(
          `No specific strategy recommendation for semantic class "${classificationResult}"`
        )
      );
    });

    it('should return null and log warning if naturalLanguageText is missing', async () => {
      const result = await semanticInputRouter.route(null, llmModelId);
      expect(result).toBeNull();
      expect(logger.warn).toHaveBeenCalledWith(
        '[SemanticInputRouter] Route called with missing naturalLanguageText or llmModelId.'
      );
      expect(semanticInputRouter.classifyInput).not.toHaveBeenCalled();
    });

    it('should return null and log warning if llmModelId is missing', async () => {
      const result = await semanticInputRouter.route(text, null);
      expect(result).toBeNull();
      expect(logger.warn).toHaveBeenCalledWith(
        '[SemanticInputRouter] Route called with missing naturalLanguageText or llmModelId.'
      );
      expect(semanticInputRouter.classifyInput).not.toHaveBeenCalled();
    });
  });
});
