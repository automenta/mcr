const InputRouter = require('../src/evolution/inputRouter');
const logger = require('../src/logger');
const { MCRError, ErrorCodes } = require('../src/errors');

// Mock logger to prevent console output during tests and allow assertions
jest.mock('../src/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

describe('InputRouter', () => {
  let mockDb;
  let inputRouter;

  beforeEach(() => {
    // Reset mocks before each test
    logger.info.mockClear();
    logger.warn.mockClear();
    logger.error.mockClear();
    logger.debug.mockClear();

    mockDb = {
      queryPerformanceResults: jest.fn(),
    };
    inputRouter = new InputRouter(mockDb);
  });

  describe('constructor', () => {
    it('should initialize with a db instance', () => {
      expect(inputRouter.db).toBe(mockDb);
      expect(logger.info).toHaveBeenCalledWith(
        '[InputRouter] Initialized with database module.'
      );
    });

    it('should throw MCRError if db instance is not provided', () => {
      expect(() => new InputRouter(null)).toThrow(
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
      expect(inputRouter.classifyInput(text)).toBe('general_query');
      expect(logger.debug).toHaveBeenCalledWith(
        `[InputRouter] Classified input as 'general_query': "${text.substring(0, 50)}..."`
      );
    });

    it('should classify input with question keywords as query', () => {
      const text = 'How does this work';
      expect(inputRouter.classifyInput(text)).toBe('general_query');
    });

    it('should classify other input as assertion', () => {
      const text = 'The sky is blue.';
      expect(inputRouter.classifyInput(text)).toBe('general_assert');
      expect(logger.debug).toHaveBeenCalledWith(
        `[InputRouter] Classified input as 'general_assert': "${text.substring(0, 50)}..."`
      );
    });

    it('should be case-insensitive for keywords', () => {
      const text = 'wHo is there?';
      expect(inputRouter.classifyInput(text)).toBe('general_query');
    });
  });

  describe('getBestStrategy', () => {
    const inputClass = 'test_class';
    const llmModelId = 'test_model';

    it('should return null and log info if no performance results found', async () => {
      mockDb.queryPerformanceResults.mockResolvedValue([]); // Simulate DB returning no results
      const result = await inputRouter.getBestStrategy(inputClass, llmModelId);

      expect(mockDb.queryPerformanceResults).toHaveBeenCalled();
      // Check the query string and parameters if necessary, though the exact query might evolve.
      // For now, just checking it was called is a good first step.
      // Example of more specific check (if query structure is stable):
      // expect(mockDb.queryPerformanceResults).toHaveBeenCalledWith(
      //   expect.stringContaining('SELECT strategy_hash, metrics, latency_ms, cost FROM performance_results'),
      //   [llmModelId, 'query'] // Assuming inputClass 'test_class' maps to 'query'
      // );

      expect(logger.info).toHaveBeenCalledWith(
        `[InputRouter] No performance results found for llmModelId "${llmModelId}" (or generic) and input_type "${inputClass === 'general_assert' ? 'assert' : 'query'}".`
      );
      expect(result).toBeNull();
    });

    // The old test "should log a warning and return null as DB querying is not yet fully implemented"
    // is removed as the implementation is no longer a placeholder.
    // Additional tests for getBestStrategy can be added here to cover cases where:
    // - Results are returned and a best strategy is found.
    // - Different scoring scenarios lead to different strategy selections.
    // - Errors occur during DB query or metric parsing.
  });

  describe('route', () => {
    const llmModelId = 'test_model';

    beforeEach(() => {
      // Spy on methods of the instance of inputRouter
      jest.spyOn(inputRouter, 'classifyInput');
      jest.spyOn(inputRouter, 'getBestStrategy');
    });

    afterEach(() => {
      // Restore the original methods
      inputRouter.classifyInput.mockRestore();
      inputRouter.getBestStrategy.mockRestore();
    });

    it('should call classifyInput and getBestStrategy', async () => {
      const text = 'Test input';
      inputRouter.classifyInput.mockReturnValue('classified_class');
      inputRouter.getBestStrategy.mockResolvedValue('best_strategy_hash');

      await inputRouter.route(text, llmModelId);

      expect(inputRouter.classifyInput).toHaveBeenCalledWith(text);
      expect(inputRouter.getBestStrategy).toHaveBeenCalledWith(
        'classified_class',
        llmModelId
      );
    });

    it('should return strategy hash if recommended', async () => {
      const text = 'Test input';
      const expectedHash = 'strategy123';
      inputRouter.getBestStrategy.mockResolvedValue(expectedHash);

      const result = await inputRouter.route(text, llmModelId);
      expect(result).toBe(expectedHash);
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining(`Recommended strategy ID: ${expectedHash}`)
      );
    });

    it('should return null if no strategy is recommended', async () => {
      const text = 'Test input';
      inputRouter.getBestStrategy.mockResolvedValue(null);

      const result = await inputRouter.route(text, llmModelId);
      expect(result).toBeNull();
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining(
          'No specific strategy recommendation. Fallback will be used.'
        )
      );
    });

    it('should return null and log warning if naturalLanguageText is missing', async () => {
      const result = await inputRouter.route(null, llmModelId);
      expect(result).toBeNull();
      expect(logger.warn).toHaveBeenCalledWith(
        '[InputRouter] Route called with missing naturalLanguageText or llmModelId.'
      );
      expect(inputRouter.classifyInput).not.toHaveBeenCalled();
      expect(inputRouter.getBestStrategy).not.toHaveBeenCalled();
    });

    it('should return null and log warning if llmModelId is missing', async () => {
      const text = 'Test input';
      const result = await inputRouter.route(text, null);
      expect(result).toBeNull();
      expect(logger.warn).toHaveBeenCalledWith(
        '[InputRouter] Route called with missing naturalLanguageText or llmModelId.'
      );
      expect(inputRouter.classifyInput).not.toHaveBeenCalled();
      expect(inputRouter.getBestStrategy).not.toHaveBeenCalled();
    });
  });
});
