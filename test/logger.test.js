// Mock ConfigManager first, as logger.js depends on it at the module level
const mockConfigLoad = jest.fn(() => ({
  logging: {
    level: 'debug', // Default for tests, can be overridden in specific tests if needed
    file: 'test.log',
  },
}));
jest.mock('../src/config', () => ({
  load: mockConfigLoad,
}));

// Fully mock winston before logger is imported
const mockCreateLoggerInstance = {
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  http: jest.fn(),
  verbose: jest.fn(),
  debug: jest.fn(),
  silly: jest.fn(),
};
const mockFileTransportInstance = jest.fn();
const mockConsoleTransportInstance = jest.fn();

// Rename vars to be prefixed with 'mock' for use in jest.mock factory
const mockWinstonFormatCombine = jest.fn(
  (...args) => `combined(${args.map((a) => a.name || 'format').join(',')})`
);
const mockWinstonFormatTimestamp = jest.fn(() => ({ name: 'timestamp' }));
const mockWinstonFormatJson = jest.fn(() => ({ name: 'json' }));
const mockWinstonFormatColorize = jest.fn(() => ({ name: 'colorize' }));
const mockWinstonFormatSimple = jest.fn(() => ({ name: 'simple' }));
const mockWinstonFormatPrintf = jest.fn((cb) => ({ name: 'printf', cb }));

jest.mock('winston', () => ({
  createLogger: jest.fn(() => mockCreateLoggerInstance),
  format: {
    combine: mockWinstonFormatCombine,
    timestamp: mockWinstonFormatTimestamp,
    json: mockWinstonFormatJson,
    colorize: mockWinstonFormatColorize,
    simple: mockWinstonFormatSimple,
    printf: mockWinstonFormatPrintf,
  },
  transports: {
    File: jest.fn(() => mockFileTransportInstance),
    Console: jest.fn(() => mockConsoleTransportInstance),
  },
}));

// Now require the modules under test, they will get the mocks above
const ConfigManager = require('../src/config'); // Will be the mocked version
const { logger, initializeLoggerContext, asyncLocalStorage } = require('../src/logger');

describe('Logger', () => {
  // mockCreateLogger, mockFileTransport, mockConsoleTransport are not needed here
  // as the instances are directly from the mock.

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset ConfigManager.load mock for each test to ensure clean state if needed by a test.
    // It's already called once when logger.js is imported.
    mockConfigLoad.mockClear().mockReturnValue({
      logging: {
        level: 'debug',
        file: 'test.log',
      },
    });
    // If logger needs to be "re-initialized" for a test, that's more complex
    // as it's created at module scope. For now, assume initial load is what we test for config.
  });

  test('should initialize winston logger with correct configuration on module load', () => {
    // Check that ConfigManager.load was called during the initial import of logger.js
    expect(ConfigManager.load).toHaveBeenCalledTimes(1);

    // Check that winston.createLogger was called with data from the mocked ConfigManager
    expect(require('winston').createLogger).toHaveBeenCalledWith({
      level: 'debug', // From the mocked config
      format: expect.stringMatching(/^combined\(.+timestamp.+json\)$/), // Simplified check for format
      transports: [mockFileTransportInstance, mockConsoleTransportInstance],
    });

    expect(require('winston').transports.File).toHaveBeenCalledWith({
      filename: 'test.log', // From the mocked config
    });
    expect(require('winston').transports.Console).toHaveBeenCalledWith({
      format: expect.stringMatching(/^combined\(.+colorize.+simple.+printf\)$/), // Simplified check
    });

    // Check if format functions were called
    expect(mockWinstonFormatTimestamp).toHaveBeenCalled();
    expect(mockWinstonFormatJson).toHaveBeenCalled();
    expect(mockWinstonFormatColorize).toHaveBeenCalled();
    expect(mockWinstonFormatSimple).toHaveBeenCalled();
    expect(mockWinstonFormatPrintf).toHaveBeenCalled();
    // mockWinstonFormatCombine is called twice (once for file, once for console)
    expect(mockWinstonFormatCombine).toHaveBeenCalledTimes(2);
  });

  test('should export the created logger instance', () => {
    expect(logger).toBe(mockCreateLoggerInstance);
  });

  test('should call logger methods correctly', () => {
    logger.info('Test info message');
    expect(mockCreateLogger.info).toHaveBeenCalledWith('Test info message');

    logger.error('Test error message', { detail: 'some detail' });
    expect(mockCreateLogger.error).toHaveBeenCalledWith('Test error message', {
      detail: 'some detail',
    });

    logger.debug('Test debug message');
    expect(mockCreateLogger.debug).toHaveBeenCalledWith('Test debug message');
  });
});
