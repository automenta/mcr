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
    головаAsyncLocalStorageRunSpy = jest.spyOn(asyncHooks.AsyncLocalStorage.prototype, 'run');
    головаAsyncLocalStorageGetStoreSpy = jest.spyOn(asyncHooks.AsyncLocalStorage.prototype, 'getStore');

    // Re-establish config mock for the fresh module load
    mockConfigLoad.mockReturnValue({ logging: { level: 'info' } });
    // Re-mock config because resetModules clears Jest's mock cache for it
    jest.mock('../src/config', () => ({
        load: mockConfigLoad, get: mockConfigLoad, validateConfig: jest.fn(), _config: null,
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
      const mockReq = { correlationId: 'test-id' };
      const mockRes = {};
      const mockNext = jest.fn();
      initializeLoggerContext(mockReq, mockRes, mockNext);
      expect(головаAsyncLocalStorageRunSpy).toHaveBeenCalledTimes(1);
      expect(mockNext).toHaveBeenCalledTimes(1);
    });

    test('correlationId should be available via getStore within asyncLocalStorage.run callback', (done) => {
      const mockReq = { correlationId: 'context-id' };
      const mockRes = {};
      const mockNext = jest.fn(() => {
        expect(головаAsyncLocalStorageGetStoreSpy).toHaveBeenCalled();
        expect(loggerAsyncLocalStorageInstance.getStore()).toEqual(expect.objectContaining({ correlationId: 'context-id' }));
        done();
      });

      const instanceRunSpy = jest.spyOn(loggerAsyncLocalStorageInstance, 'run').mockImplementationOnce((store, callback) => {
        const { AsyncLocalStorage: ActualAsyncLocalStorage } = jest.requireActual('async_hooks');
        ActualAsyncLocalStorage.prototype.run.call(loggerAsyncLocalStorageInstance, store, callback);
      });

      initializeLoggerContext(mockReq, mockRes, mockNext);
      instanceRunSpy.mockRestore();
    });
  });

  describe('reconfigureLogger', () => {
    test('should update logger level based on loaded config', () => {
      const newConfig = { logging: { level: 'debug' } };
      const infoSpy = jest.spyOn(logger, 'info'); // Spy on the specific logger instance

      reconfigureLogger(newConfig); // This should modify the 'logger' instance obtained in beforeEach

      expect(logger.level).toBe('debug'); // Check the same 'logger' instance
      expect(infoSpy).toHaveBeenCalledWith('Logger reconfigured with loaded settings.');
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
