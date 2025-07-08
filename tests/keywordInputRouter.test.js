const KeywordInputRouter = require('../src/evolution/keywordInputRouter.js');
const logger = require('../src/logger');
const { MCRError, ErrorCodes } = require('../src/errors');

// Mock logger to prevent console output during tests and allow assertions
jest.mock('../src/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

describe('KeywordInputRouter', () => {
  let mockDb;
  let keywordInputRouter;

  beforeEach(() => {
    // Reset mocks before each test
    logger.info.mockClear();
    logger.warn.mockClear();
    logger.error.mockClear();
    logger.debug.mockClear();

    mockDb = {
      queryPerformanceResults: jest.fn(),
    };
    keywordInputRouter = new KeywordInputRouter(mockDb);
  });

  describe('constructor', () => {
    it('should initialize with a db instance', () => {
      expect(keywordInputRouter.db).toBe(mockDb);
      expect(logger.info).toHaveBeenCalledWith(
        '[InputRouter] Initialized with database instance.'
      );
    });

    it('should throw MCRError if db instance is not provided', () => {
      expect(() => new KeywordInputRouter(null)).toThrow(
        new MCRError(
          ErrorCodes.INTERNAL_ERROR,
          'InputRouter requires a database instance.'
        )
      );
    });
  });

  describe('classifyInput', () => {
    it('should classify input with question marks as query', () => {
      const text = 'What is the capital of France?';
      expect(keywordInputRouter.classifyInput(text)).toBe('general_query');
      expect(logger.debug).toHaveBeenCalledWith(
        `[InputRouter] Classified input as 'general_query': "${text}"`
      );
    });

    it('should classify input with question keywords as query', () => {
      const text = 'How does this work';
      expect(keywordInputRouter.classifyInput(text)).toBe('general_query');
    });

    it('should classify other input as assertion', () => {
      const text = 'The sky is blue.';
      expect(keywordInputRouter.classifyInput(text)).toBe('general_assert');
      expect(logger.debug).toHaveBeenCalledWith(
        `[InputRouter] Classified input as 'general_assert': "${text}"`
      );
    });

    it('should be case-insensitive for keywords', () => {
      const text = 'wHo is there?';
      expect(keywordInputRouter.classifyInput(text)).toBe('general_query');
    });
  });

  describe('getBestStrategy', () => {
    const inputClass = 'test_class';
    const llmModelId = 'test_model';

    it('should call db.queryPerformanceResults with a conceptual query', async () => {
      // This test primarily checks that the DB is queried. The actual SQL and logic are placeholders.
      mockDb.queryPerformanceResults.mockResolvedValue([]); // No results
      await keywordInputRouter.getBestStrategy(inputClass, llmModelId);

      // Current placeholder query in KeywordInputRouter is:
      // SELECT strategy_hash, metrics, latency_ms, cost
      // FROM performance_results
      // WHERE llm_model_id = ? AND example_id LIKE ?
      // ORDER BY json_extract(metrics, '$.exactMatchProlog') DESC, latency_ms ASC, json_extract(cost, '$.input_tokens') ASC
      // LIMIT 1;
      // The actual implementation in KeywordInputRouter returns null without calling DB, so this test needs an update when KeywordInputRouter's getBestStrategy is implemented.
      // For now, testing the placeholder state:
      // expect(logger.warn).toHaveBeenCalledWith(
      //   '[InputRouter] getBestStrategy: DB querying not yet implemented. Returning null.'
      // );
      // const result = await keywordInputRouter.getBestStrategy(inputClass, llmModelId);
      // expect(result).toBeNull();
      expect(mockDb.queryPerformanceResults).toHaveBeenCalled();
      const result = await keywordInputRouter.getBestStrategy(inputClass, llmModelId);
      expect(result).toBeNull(); // Expect null when no results are returned
    });

    // TODO: Add more tests for getBestStrategy once its DB querying logic is implemented.
    // e.g., when results are returned, when errors occur, etc.
    // For now, the method has a hardcoded return null and a warn log.

    it('should return null when DB querying returns no results', async () => {
      mockDb.queryPerformanceResults.mockResolvedValue([]); // Ensure no results
      const result = await keywordInputRouter.getBestStrategy(inputClass, llmModelId);
      // expect(logger.warn).toHaveBeenCalledWith(
      //   '[InputRouter] getBestStrategy: DB querying not yet implemented. Returning null.'
      // );
      expect(mockDb.queryPerformanceResults).toHaveBeenCalled();
      expect(result).toBeNull();
    });
  });

  describe('route', () => {
    const llmModelId = 'test_model';

    beforeEach(() => {
      // Spy on methods of the instance of keywordInputRouter
      jest.spyOn(keywordInputRouter, 'classifyInput');
      jest.spyOn(keywordInputRouter, 'getBestStrategy');
    });

    afterEach(() => {
      // Restore the original methods
      keywordInputRouter.classifyInput.mockRestore();
      keywordInputRouter.getBestStrategy.mockRestore();
    });

    it('should call classifyInput and getBestStrategy', async () => {
      const text = 'Test input';
      keywordInputRouter.classifyInput.mockReturnValue('classified_class');
      keywordInputRouter.getBestStrategy.mockResolvedValue('best_strategy_hash');

      await keywordInputRouter.route(text, llmModelId);

      expect(keywordInputRouter.classifyInput).toHaveBeenCalledWith(text);
      expect(keywordInputRouter.getBestStrategy).toHaveBeenCalledWith(
        'classified_class',
        llmModelId
      );
    });

    it('should return strategy hash if recommended', async () => {
      const text = 'Test input';
      const expectedHash = 'strategy123';
      keywordInputRouter.getBestStrategy.mockResolvedValue(expectedHash);

      const result = await keywordInputRouter.route(text, llmModelId);
      expect(result).toBe(expectedHash);
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining(`Recommended strategy ID: ${expectedHash}`)
      );
    });

    it('should return null if no strategy is recommended', async () => {
      const text = 'Test input';
      keywordInputRouter.getBestStrategy.mockResolvedValue(null);

      const result = await keywordInputRouter.route(text, llmModelId);
      expect(result).toBeNull();
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining(
          'No specific strategy recommendation. Fallback will be used.'
        )
      );
    });

    it('should return null and log warning if naturalLanguageText is missing', async () => {
      const result = await keywordInputRouter.route(null, llmModelId);
      expect(result).toBeNull();
      expect(logger.warn).toHaveBeenCalledWith(
        '[InputRouter] Route called with missing naturalLanguageText or llmModelId.'
      );
      expect(keywordInputRouter.classifyInput).not.toHaveBeenCalled();
      expect(keywordInputRouter.getBestStrategy).not.toHaveBeenCalled();
    });

    it('should return null and log warning if llmModelId is missing', async () => {
      const text = 'Test input';
      const result = await keywordInputRouter.route(text, null);
      expect(result).toBeNull();
      expect(logger.warn).toHaveBeenCalledWith(
        '[InputRouter] Route called with missing naturalLanguageText or llmModelId.'
      );
      expect(keywordInputRouter.classifyInput).not.toHaveBeenCalled();
      expect(keywordInputRouter.getBestStrategy).not.toHaveBeenCalled();
    });
  });
});
