const winston = require('winston');
const ConfigManager = require('./config');

const config = ConfigManager.load();
const { AsyncLocalStorage } = require('async_hooks');

const asyncLocalStorage = new AsyncLocalStorage();

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
    correlationIdFormat(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: config.logging.file }),
    new winston.transports.Console({
      format: winston.format.combine(
        correlationIdFormat(),
        winston.format.colorize(),
        winston.format.simple(),
        winston.format.printf((info) => {
          let logMessage = `${info.level}: ${info.message}`;
          if (info.correlationId) {
            logMessage = `[${info.correlationId}] ${logMessage}`;
          }
          const metadata = Object.assign({}, info, {
            level: undefined,
            message: undefined,
            timestamp: undefined,
            correlationId: undefined,
          });
          if (
            Object.keys(metadata).length > 0 &&
            JSON.stringify(metadata) !== '{}'
          ) {
            const filteredMetadata = Object.fromEntries(
              Object.entries(metadata).filter(([_, v]) => v !== undefined)
            );
            if (Object.keys(filteredMetadata).length > 0) {
              logMessage += ` ${JSON.stringify(filteredMetadata)}`;
            }
          }
          return logMessage;
        })
      ),
    }),
  ],
});

function initializeLoggerContext(req, res, next) {
  asyncLocalStorage.run({ correlationId: req.correlationId }, () => {
    next();
  });
}

module.exports = { logger, initializeLoggerContext, asyncLocalStorage };
