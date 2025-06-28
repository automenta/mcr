const winston = require('winston');

// Mock ConfigManager before requiring the logger module
jest.mock('../src/config', () => ({
    load: jest.fn(() => ({
        logging: {
            level: 'debug',
            file: 'test.log',
        },
    })),
}));

const ConfigManager = require('../src/config');
const logger = require('../src/logger'); // Now logger will use the mocked config

jest.mock('winston');

describe('Logger', () => {
    let mockCreateLogger;
    let mockFileTransport;
    let mockConsoleTransport;

    beforeEach(() => {
        jest.clearAllMocks();

        // Mock winston.transports
        mockFileTransport = jest.fn();
        mockConsoleTransport = jest.fn();
        winston.transports.File = jest.fn(() => mockFileTransport);
        winston.transports.Console = jest.fn(() => mockConsoleTransport);

        // Mock winston.format
        winston.format = {
            combine: jest.fn((...args) => `combined-format(${args.map(f => f.name).join(',')}`),
            timestamp: jest.fn(() => ({ name: 'timestamp' })),
            json: jest.fn(() => ({ name: 'json' })),
            colorize: jest.fn(() => ({ name: 'colorize' })),
            simple: jest.fn(() => ({ name: 'simple' })),
        };

        // Mock winston.createLogger
        mockCreateLogger = {
            error: jest.fn(),
            warn: jest.fn(),
            info: jest.fn(),
            http: jest.fn(),
            verbose: jest.fn(),
            debug: jest.fn(),
            silly: jest.fn(),
        };
        winston.createLogger.mockReturnValue(mockCreateLogger);

        // Ensure ConfigManager.load is called with the correct mock value
        ConfigManager.load.mockReturnValue({
            logging: {
                level: 'debug',
                file: 'test.log',
            },
        });

        // No need for jest.resetModules() and re-require here, as logger is already required above
    });

    test('should initialize winston logger with correct configuration', () => {
        expect(ConfigManager.load).toHaveBeenCalled();
        expect(winston.createLogger).toHaveBeenCalledWith({
            level: 'debug',
            format: expect.any(String), // This will be the result of winston.format.combine
            transports: [
                mockFileTransport,
                mockConsoleTransport,
            ],
        });

        expect(winston.transports.File).toHaveBeenCalledWith({ filename: 'test.log' });
        expect(winston.transports.Console).toHaveBeenCalledWith({
            format: expect.any(String), // This will be the result of winston.format.combine
        });

        expect(winston.format.combine).toHaveBeenCalledTimes(2);
        expect(winston.format.timestamp).toHaveBeenCalled();
        expect(winston.format.json).toHaveBeenCalled();
        expect(winston.format.colorize).toHaveBeenCalled();
        expect(winston.format.simple).toHaveBeenCalled();
    });

    test('should export the created logger instance', () => {
        expect(logger).toBe(mockCreateLogger);
    });

    test('should call logger methods correctly', () => {
        logger.info('Test info message');
        expect(mockCreateLogger.info).toHaveBeenCalledWith('Test info message');

        logger.error('Test error message', { detail: 'some detail' });
        expect(mockCreateLogger.error).toHaveBeenCalledWith('Test error message', { detail: 'some detail' });

        logger.debug('Test debug message');
        expect(mockCreateLogger.debug).toHaveBeenCalledWith('Test debug message');
    });
});
