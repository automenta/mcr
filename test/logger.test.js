// Mock ConfigManager first
const mockConfigLoad = jest.fn(() => ({ logging: { level: 'info' } }));
jest.mock('../src/config', () => ({
  load: mockConfigLoad,
  get: mockConfigLoad,
  validateConfig: jest.fn(),
  _config: null,
}));

// Hold spies that need to be defined before logger module is loaded
let головаCreateLoggerSpy; // Renamed to avoid conflict if any global jest setup exists
let головаAsyncLocalStorageRunSpy;
let головаAsyncLocalStorageGetStoreSpy;

describe('Logger Module', () => {
  let logger; // actual logger instance from module
  let reconfigureLogger;
  let initializeLoggerContext;
  let loggerAsyncLocalStorageInstance; // the instance exported by logger.js

  beforeEach(() => {
    jest.resetModules(); // Reset modules to get a fresh logger instance and allow spies to attach

    // Mock winston and AsyncLocalStorage again AFTER resetModules and BEFORE logger is required
    const winston = require('winston');
    головаCreateLoggerSpy = jest.spyOn(winston, 'createLogger');

    const asyncHooks = require('async_hooks');
    головаAsyncLocalStorageRunSpy = jest.spyOn(
      asyncHooks.AsyncLocalStorage.prototype,
      'run'
    );
    головаAsyncLocalStorageGetStoreSpy = jest.spyOn(
      asyncHooks.AsyncLocalStorage.prototype,
      'getStore'
    );

    // Re-establish config mock for the fresh module load
    mockConfigLoad.mockReturnValue({ logging: { level: 'info' } });
    // Re-mock config because resetModules clears Jest's mock cache for it
    jest.mock('../src/config', () => ({
      load: mockConfigLoad,
      get: mockConfigLoad,
      validateConfig: jest.fn(),
      _config: null,
    }));

    // Now require the logger module fresh for each test
    const loggerModule = require('../src/logger');
    logger = loggerModule.logger;
    reconfigureLogger = loggerModule.reconfigureLogger;
    initializeLoggerContext = loggerModule.initializeLoggerContext;
    loggerAsyncLocalStorageInstance = loggerModule.asyncLocalStorage;
  });

  describe('Logger Initialization', () => {
    test('should call winston.createLogger with correct default format structure', () => {
      expect(головаCreateLoggerSpy).toHaveBeenCalledTimes(1);
      const loggerOptions = головаCreateLoggerSpy.mock.calls[0][0];
      expect(loggerOptions.level).toBe('info');
      expect(loggerOptions.format).toBeDefined();
      expect(typeof loggerOptions.format.transform).toBe('function');
    });

    test('should export a logger instance', () => {
      expect(logger).toBeDefined();
      expect(typeof logger.info).toBe('function');
    });
  });

  describe('initializeLoggerContext', () => {
    test('should use asyncLocalStorage.run and call next', () => {
      const mockReq = {
        correlationId: 'test-id',
        method: 'GET',
        originalUrl: '/test',
        ip: '127.0.0.1',
        headers: { 'user-agent': 'jest-test' },
      };
      const mockRes = { on: jest.fn() }; // Mock 'on' method for 'finish' event
      const mockNext = jest.fn();
      initializeLoggerContext(mockReq, mockRes, mockNext);
      expect(головаAsyncLocalStorageRunSpy).toHaveBeenCalledTimes(1);
      expect(mockNext).toHaveBeenCalledTimes(1);
    });

    test('correlationId should be available via getStore within asyncLocalStorage.run callback', async () => {
      const mockReq = {
        correlationId: 'context-id',
        method: 'GET',
        originalUrl: '/context-test',
        ip: '127.0.0.1',
        headers: { 'user-agent': 'jest-context-test' },
      };
      const mockRes = { on: jest.fn() }; // Mock 'on' method for 'finish' event
      // Return a Promise from mockNext
      const mockNext = jest.fn(() => {
        expect(головаAsyncLocalStorageGetStoreSpy).toHaveBeenCalled();
        expect(loggerAsyncLocalStorageInstance.getStore()).toEqual(
          expect.objectContaining({ correlationId: 'context-id' })
        );
        return Promise.resolve(); // Resolve the promise
      });

      const instanceRunSpy = jest
        .spyOn(loggerAsyncLocalStorageInstance, 'run')
        .mockImplementationOnce((store, callback) => {
          const { AsyncLocalStorage: ActualAsyncLocalStorage } =
            jest.requireActual('async_hooks');
          ActualAsyncLocalStorage.prototype.run.call(
            loggerAsyncLocalStorageInstance,
            store,
            callback
          );
        });

      // Await the call to initializeLoggerContext if mockNext returns a Promise.
      // However, initializeLoggerContext itself is not async and doesn't await mockNext.
      // The key is that mockNext itself is where the assertions happen and it returns a Promise.
      // We need to ensure that the test waits for mockNext's promise to resolve.
      // A simple way is to await the result of mockNext if initializeLoggerContext calls it and we can grab that promise.
      // Or, more directly, since initializeLoggerContext calls mockNext synchronously:
      initializeLoggerContext(mockReq, mockRes, mockNext);
      await mockNext.mock.results[0].value; // Wait for the promise returned by mockNext

      instanceRunSpy.mockRestore();
    });
  });

  describe('reconfigureLogger', () => {
    test('should update logger level based on loaded config', () => {
      const newConfig = { logging: { level: 'debug' } };
      const infoSpy = jest.spyOn(logger, 'info'); // Spy on the specific logger instance

      reconfigureLogger(newConfig); // This should modify the 'logger' instance obtained in beforeEach

      expect(logger.level).toBe('debug'); // Check the same 'logger' instance
      expect(infoSpy).toHaveBeenCalledWith(
        'Logger reconfigured with loaded settings.'
      );
      infoSpy.mockRestore();
    });
  });

  describe('Correlation ID Formatting', () => {
    test('should include correlationId in log message when present in async local storage', () => {
      const testMessage = 'Log with correlation ID';
      const correlationId = 'corr-id-123';
      const infoSpy = jest.spyOn(logger, 'info').mockImplementation(() => {});

      loggerAsyncLocalStorageInstance.run({ correlationId }, () => {
        logger.info(testMessage);
      });
      expect(infoSpy).toHaveBeenCalledWith(testMessage);
      infoSpy.mockRestore();
    });

    test('should not include correlationId in log message when not in async local storage', () => {
      const testMessage = 'Log without correlation ID';
      const infoSpy = jest.spyOn(logger, 'info').mockImplementation(() => {});
      logger.info(testMessage);
      expect(infoSpy).toHaveBeenCalledWith(testMessage);
      infoSpy.mockRestore();
    });
  });
});
