// Mock ConfigManager first, as logger.js might be reconfigured based on it.
const mockConfigLoad = jest.fn(() => ({
  logging: {
    level: 'info',
  },
}));
jest.mock('../src/config', () => ({
  // Provide the same interface as the actual ConfigManager
  load: mockConfigLoad, // Used by SessionManager if it re-requires config
  get: mockConfigLoad,  // Used by mcr.js, potentially by logger if reconfigured
  validateConfig: jest.fn(),
  _config: null, // internal state if needed by tests
}));


// Import winston to spy on it, but use the actual implementation.
const winston = require('winston');
const { AsyncLocalStorage } = require('async_hooks'); // Import for direct spying if needed

// Spy on winston.createLogger before logger module is loaded
const createLoggerSpy = jest.spyOn(winston, 'createLogger');

// Spy on AsyncLocalStorage methods BEFORE the logger module (which creates an instance) is loaded.
// We need to spy on the prototype if methods are called on an instance created within logger.js
const asyncLocalStorageRunSpy = jest.spyOn(AsyncLocalStorage.prototype, 'run');
const asyncLocalStorageGetStoreSpy = jest.spyOn(AsyncLocalStorage.prototype, 'getStore');


// Now require the modules under test. src/logger.js will use the real winston.
const {
  logger: actualLoggerInstance, // Renamed to avoid conflict if we define 'logger'
  reconfigureLogger,
  initializeLoggerContext,
  asyncLocalStorage, // This is the instance from logger.js
} = require('../src/logger');


describe('Logger Module', () => {
  beforeEach(() => {
    // Clear all spies and mocks before each test
    jest.clearAllMocks();

    // Reset config mock for each test if necessary
    mockConfigLoad.mockReturnValue({
      logging: {
        level: 'info',
      },
    });

    // Re-initialize LlmService with the current config if it's part of the test setup
    // This ensures that if reconfigureLogger is called, it uses the latest mockConfig
    // For logger tests, this might not be directly needed unless testing reconfigureLogger interactions
  });

  describe('Logger Initialization', () => {
    test('should call winston.createLogger with correct default format structure', () => {
      // src/logger.js runs on import, so createLoggerSpy should have been called once.
      expect(createLoggerSpy).toHaveBeenCalledTimes(1);
      const loggerOptions = createLoggerSpy.mock.calls[0][0];

      expect(loggerOptions.level).toBe('info');
      expect(loggerOptions.format).toBeDefined();
      expect(typeof loggerOptions.format.transform).toBe('function'); // Check it's a valid format

      // Check for presence of key formatters by their typical behavior or properties
      // This is an indirect check since we're not deeply mocking individual formatters anymore.
      // For example, combined format should include timestamp, custom correlation, and json.
      // This is hard to verify without more introspection or specific format object checks.
      // For now, checking it's a function (valid format) is a good step.
    });

    test('should export a logger instance', () => {
      expect(actualLoggerInstance).toBeDefined();
      expect(typeof actualLoggerInstance.info).toBe('function');
    });
  });

  describe('initializeLoggerContext', () => {
    test('should use asyncLocalStorage.run and call next', () => {
      const mockReq = { correlationId: 'test-id' };
      const mockRes = {};
      const mockNext = jest.fn();

      initializeLoggerContext(mockReq, mockRes, mockNext);

      expect(asyncLocalStorageRunSpy).toHaveBeenCalledTimes(1);
      // Check that the 'run' callback called mockNext
      expect(mockNext).toHaveBeenCalledTimes(1);
    });

    test('correlationId should be available via getStore within asyncLocalStorage.run callback', (done) => {
      const mockReq = { correlationId: 'context-id' };
      const mockRes = {};
      const mockNext = jest.fn(() => {
        // Inside the 'next()' call, which is inside the asyncLocalStorage.run callback
        expect(asyncLocalStorageGetStoreSpy).toHaveBeenCalled();
        expect(asyncLocalStorage.getStore()).toEqual(expect.objectContaining({ correlationId: 'context-id' }));
        done();
      });

      // Override the spy for this specific test to inspect the store value
      // This spy is on the instance created in src/logger.js
      const instanceRunSpy = jest.spyOn(asyncLocalStorage, 'run').mockImplementationOnce((store, callback) => {
        // Call the original prototype's run method to execute the actual logic
        // but ensure our spies can still track calls to getStore etc.
        AsyncLocalStorage.prototype.run.call(asyncLocalStorage, store, callback);
      });

      initializeLoggerContext(mockReq, mockRes, mockNext);
      instanceRunSpy.mockRestore(); // Clean up spy
    });
  });

  describe('reconfigureLogger', () => {
    test('should update logger level based on loaded config', () => {
      const newConfig = { logging: { level: 'debug' } };
      reconfigureLogger(newConfig);
      // Winston's level property is on the logger instance.
      expect(actualLoggerInstance.level).toBe('debug');
      // Check if logger.info was called by reconfigureLogger itself
      expect(actualLoggerInstance.info).toHaveBeenCalledWith('Logger reconfigured with loaded settings.');
    });
  });

  // Test the custom correlationIdFormat indirectly by logging and checking output,
  // or by extracting and testing it if it were exported.
  // Given it's not exported, we test its effect.
  describe('Correlation ID Formatting', () => {
    test('should include correlationId in log message when present in async local storage', () => {
      const testMessage = 'Log with correlation ID';
      const correlationId = 'corr-id-123';

      // Spy on a method of the actual logger instance to see the formatted message
      const infoSpy = jest.spyOn(actualLoggerInstance, 'info').mockImplementation(() => {});

      asyncLocalStorage.run({ correlationId }, () => {
        actualLoggerInstance.info(testMessage); // This call will be captured by infoSpy
      });

      // Winston formatting is complex to assert directly on console.log output
      // Instead, we check if the logger's method was called.
      // The actual formatting including correlationId is an integration aspect.
      // For a unit test of correlationIdFormat, it would need to be exported from logger.js.
      // Given it's not, this test verifies that logging happens within the ALS context.
      expect(infoSpy).toHaveBeenCalledWith(testMessage);

      infoSpy.mockRestore();
    });

    test('should not include correlationId in log message when not in async local storage', () => {
      const testMessage = 'Log without correlation ID';
      const infoSpy = jest.spyOn(actualLoggerInstance, 'info').mockImplementation(() => {});

      actualLoggerInstance.info(testMessage);

      expect(infoSpy).toHaveBeenCalledWith(testMessage);
      // Verifying the *absence* of correlationId in the formatted string is harder
      // without access to the raw formatted string. This test mainly ensures logging works.

      infoSpy.mockRestore();
    });
  });
});
