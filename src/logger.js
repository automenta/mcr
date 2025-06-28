
const winston = require('winston');
const ConfigManager = require('./config');

const config = ConfigManager.load();
const { AsyncLocalStorage } = require('async_hooks');

const asyncLocalStorage = new AsyncLocalStorage();

// Custom format to include correlationId from asyncLocalStorage
const correlationIdFormat = winston.format((info) => {
    const correlationId = asyncLocalStorage.getStore()?.correlationId;
    if (correlationId) {
        info.correlationId = correlationId;
    }
    return info;
});

const logger = winston.createLogger({
    level: config.logging.level,
    format: winston.format.combine(
        winston.format.timestamp(),
        correlationIdFormat(), // Add correlationId to the log entry
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ filename: config.logging.file }),
        new winston.transports.Console({
            format: winston.format.combine(
                correlationIdFormat(), // Also add to console for consistency if needed, or simplify
                winston.format.colorize(),
                winston.format.simple(),
                winston.format.printf(info => {
                    let logMessage = `${info.level}: ${info.message}`;
                    if (info.correlationId) {
                        logMessage = `[${info.correlationId}] ${logMessage}`;
                    }
                    // Add other metadata if present (e.g., stack, details from structured logging)
                    const metadata = Object.assign({}, info, {
                        level: undefined,
                        message: undefined,
                        timestamp: undefined,
                        correlationId: undefined, // Already prepended
                    });
                    if (Object.keys(metadata).length > 0 && JSON.stringify(metadata) !== '{}') {
                         // Only append if metadata is not empty after removing standard fields
                        const filteredMetadata = Object.fromEntries(Object.entries(metadata).filter(([_, v]) => v !== undefined));
                        if (Object.keys(filteredMetadata).length > 0) {
                           logMessage += ` ${JSON.stringify(filteredMetadata)}`;
                        }
                    }
                    return logMessage;
                })
            )
        }),
    ],
});

// Middleware to set correlationId in asyncLocalStorage for each request
function initializeLoggerContext(req, res, next) {
    asyncLocalStorage.run({ correlationId: req.correlationId }, () => {
        next();
    });
}

module.exports = { logger, initializeLoggerContext, asyncLocalStorage };
