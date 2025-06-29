// Mock ConfigManager first, as logger.js depends on it at the module level
const mockConfigLoad = jest.fn(() => ({
  logging: {
    level: 'info', // Default for tests, can be overridden
    file: 'test-logger.log',
  },
}));
jest.mock('../src/config', () => ({
  load: mockConfigLoad,
}));

// Fully mock winston before logger is imported
const mockActualWinstonLoggerInstance = {
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  http: jest.fn(),
  verbose: jest.fn(),
  debug: jest.fn(),
  silly: jest.fn(),
};
const mockFileTransportConstructor = jest.fn();
const mockConsoleTransportConstructor = jest.fn();

// Mocking winston.format and its properties
const mockWinstonFormatCombine = jest.fn((...args) => ({
  _isCombined: true,
  formats: args.map((f) => f._formatName || 'unknown'),
}));
const mockWinstonFormatTimestamp = jest.fn(() => ({
  _formatName: 'timestamp',
}));
const mockWinstonFormatJson = jest.fn(() => ({ _formatName: 'json' }));
const mockWinstonFormatColorize = jest.fn(() => ({ _formatName: 'colorize' }));
const mockWinstonFormatSimple = jest.fn(() => ({ _formatName: 'simple' }));
const mockWinstonFormatPrintf = jest.fn((callback) => ({
  _formatName: 'printf',
  callback,
}));

// winston.format itself is a function (FormatWrap) that can be called to create a new Format.
// It also has properties like .combine(), .json(), etc.
const mockFormatFunction = jest.fn((transform) => ({
  _formatName: 'custom',
  transform,
}));
mockFormatFunction.combine = mockWinstonFormatCombine;
mockFormatFunction.timestamp = mockWinstonFormatTimestamp;
mockFormatFunction.json = mockWinstonFormatJson;
mockFormatFunction.colorize = mockWinstonFormatColorize;
mockFormatFunction.simple = mockWinstonFormatSimple;
mockFormatFunction.printf = mockWinstonFormatPrintf;

jest.mock('winston', () => ({
  createLogger: jest.fn(() => mockActualWinstonLoggerInstance),
  format: mockFormatFunction, // Use the correctly structured mock for winston.format
  transports: {
    File: mockFileTransportConstructor,
    Console: mockConsoleTransportConstructor,
  },
}));

// Now require the modules under test, they will get the mocks above
const {
  logger,
  initializeLoggerContext,
  asyncLocalStorage,
} = require('../src/logger');

describe('Logger', () => {
  // @TODO: Fix failing tests - disabling for now (re-enabling)
  beforeEach(() => {
    jest.clearAllMocks();
    mockConfigLoad.mockReturnValue({
      // Reset config for each test run
      logging: {
        level: 'info',
        file: 'test-logger.log',
      },
    });
    // Note: logger.js is imported once. To test re-initialization with different configs,
    // jest.resetModules() and re-require('../src/logger') would be needed in each test,
    // which can be complex. These tests focus on the logger's setup based on the
    // config present at its first load time during tests.
  });

  test('should initialize winston logger with correct configuration on module load', () => {
    expect(require('winston').createLogger).toHaveBeenCalledTimes(1);
    const createLoggerArgs = require('winston').createLogger.mock.calls[0][0];

    expect(createLoggerArgs.level).toBe('info');
    expect(createLoggerArgs.format).toBeDefined();
    expect(createLoggerArgs.format._isCombined).toBe(true); // From combine mock
    expect(createLoggerArgs.format.formats).toContain('custom'); // from correlationIdFormat using mockFormatFunction
    expect(createLoggerArgs.format.formats).toContain('timestamp');

    expect(require('winston').transports.File).toHaveBeenCalledWith({
      filename: 'test-logger.log',
    });
    expect(require('winston').transports.Console).toHaveBeenCalledTimes(1);
    const consoleArgs = require('winston').transports.Console.mock.calls[0][0];
    expect(consoleArgs.format).toBeDefined();
    expect(consoleArgs.format._isCombined).toBe(true);
    expect(consoleArgs.format.formats).toContain('custom'); // from correlationIdFormat
    expect(consoleArgs.format.formats).toContain('colorize');
    expect(consoleArgs.format.formats).toContain('simple');
    expect(consoleArgs.format.formats).toContain('printf');

    expect(mockFormatFunction).toHaveBeenCalledTimes(2); // Once for correlationIdFormat, once for console's correlationIdFormat
    expect(mockWinstonFormatTimestamp).toHaveBeenCalled();
    expect(mockWinstonFormatJson).toHaveBeenCalled();
    expect(mockWinstonFormatColorize).toHaveBeenCalled();
    expect(mockWinstonFormatSimple).toHaveBeenCalled();
    expect(mockWinstonFormatPrintf).toHaveBeenCalled();
    expect(mockWinstonFormatCombine).toHaveBeenCalledTimes(2);
  });

  test('should export the created logger instance', () => {
    expect(logger).toBe(mockActualWinstonLoggerInstance);
  });

  test('initializeLoggerContext should set correlationId in asyncLocalStorage and call next', async () => {
    const mockReq = { correlationId: 'test-corr-id-req' };
    const mockRes = {}; // Mock response object, not used by initializeLoggerContext itself

    let capturedStore;
    asyncLocalStorage.run.mockImplementationOnce((store, callback) => {
      capturedStore = store; // Capture the store that was run
      callback(); // Execute the original callback (which calls next)
    });
    // This mock ensures that when getStore is called *within the callback of run*, it gets the correct store
    asyncLocalStorage.getStore.mockImplementation(() => capturedStore);

    await new Promise((resolve) => {
      const mockNext = jest.fn(() => {
        // This assertion is now made *after* next() is called.
        // The key is that asyncLocalStorage.run has completed its synchronous callback.
        // And our getStore mock is set up to return what run had.
        expect(asyncLocalStorage.getStore().correlationId).toBe(
          'test-corr-id-req'
        );
        resolve();
      });
      initializeLoggerContext(mockReq, mockRes, mockNext);
      // Check that next was indeed called by initializeLoggerContext's logic
      expect(mockNext).toHaveBeenCalledTimes(1);
    });
    // Reset getStore mock if it's too broad for other tests
    asyncLocalStorage.getStore.mockReset();
  });

  test('logger methods should call corresponding methods on the winston instance', () => {
    logger.info('Info test');
    expect(mockActualWinstonLoggerInstance.info).toHaveBeenCalledWith(
      'Info test'
    );
  });

  test('correlationIdFormat custom transform function (via mockFormatFunction) should add correlationId', () => {
    // Get the transform function passed to the winston.format() mock
    // This was called for correlationIdFormat and for the console's specific correlationIdFormat instance
    const transformFnForMainLogger = mockFormatFunction.mock.calls[0][0]; // Assuming first call is for main logger chain

    let info = { level: 'info', message: 'test' };
    asyncLocalStorage.run({ correlationId: 'custom-id' }, () => {
      info = transformFnForMainLogger(info);
    });
    expect(info.correlationId).toBe('custom-id');

    let info2 = { level: 'info', message: 'test2' };
    info2 = transformFnForMainLogger(info2); // No ALS store active for correlationId
    expect(info2.correlationId).toBeUndefined();
  });
});
