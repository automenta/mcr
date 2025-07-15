// tests/semanticInputRouter.test.js

const SemanticInputRouter = require('../src/evolution/semanticInputRouter');
const EmbeddingService = require('../src/embedding');
const db = require('../src/store/database');
const logger = require('../src/util/logger');

jest.mock('../src/embedding', () => {
    return jest.fn().mockImplementation(() => {
        return {
            getEmbedding: jest.fn().mockResolvedValue([0.1, 0.2, 0.3]),
            generate: jest.fn().mockResolvedValue([0.1, 0.2, 0.3]),
        };
    });
});
jest.mock('../src/store/database');
jest.mock('../src/util/logger');

const semanticArchetypes = require('../src/evolution/semanticArchetypes');

describe('SemanticInputRouter', () => {
  let semanticInputRouter;
  let mockDb;
  let mockEmbeddingService;

  beforeEach(() => {
    mockDb = {
      all: jest.fn(),
    };
    mockEmbeddingService = new EmbeddingService();
    semanticInputRouter = new SemanticInputRouter(mockDb, mockEmbeddingService);
    logger.info.mockClear();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with db and embeddingService', () => {
      expect(semanticInputRouter.db).toBe(mockDb);
      expect(semanticInputRouter.embeddingService).toBe(mockEmbeddingService);
    });
  });

  describe('_initializeArchetypeEmbeddings', () => {
    it('should fetch and cache embeddings for all archetypes', async () => {
        mockEmbeddingService.generate.mockResolvedValue([0.1,0.2,0.3]);
      await semanticInputRouter._initializeArchetypeEmbeddings();
      expect(mockEmbeddingService.generate).toHaveBeenCalled();
      expect(semanticInputRouter.archetypeEmbeddingsCache).not.toBeNull();
      expect(
        Object.keys(semanticInputRouter.archetypeEmbeddingsCache).length
      ).toBe(Object.keys(semanticArchetypes).length);
    });
  });

  describe('classifyInput', () => {
    beforeEach(async () => {
        const mockArchetypeEmbeddings = new Map();
        mockArchetypeEmbeddings.set('definition_request', [0.1, 0.2, 0.3]);
        mockArchetypeEmbeddings.set('causal_assertion', [0.7, 0.8, 0.9]);
        semanticInputRouter.archetypeEmbeddingsCache = mockArchetypeEmbeddings;
    });

    it('should return the archetype ID with the highest cosine similarity', async () => {
        const inputText = 'What is love?';
        const inputEmbedding = [0.1, 0.25, 0.35];
        mockEmbeddingService.getEmbedding.mockResolvedValue(inputEmbedding);
        semanticInputRouter.cosineSimilarity = jest.fn()
            .mockReturnValueOnce(0.99)
            .mockReturnValueOnce(0.5);

        const classification = await semanticInputRouter.classifyInput(inputText);
        expect(classification).toBe('definition_request');
    });
  });
});
