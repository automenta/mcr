const winston = require('winston');
const { AsyncLocalStorage } = require('async_hooks');

const asyncLocalStorage = new AsyncLocalStorage();

const correlationIdFormat = winston.format((info) => {
  const store = asyncLocalStorage.getStore();
  if (store && store.correlationId) {
    info.correlationId = store.correlationId;
  }
  return info;
});

// Initial basic logger configuration
const logger = winston.createLogger({
  level: 'info', // Default level
  format: winston.format.combine(
    winston.format.timestamp(),
    correlationIdFormat(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        correlationIdFormat(),
        winston.format.colorize(),
        winston.format.printf((info) => {
          let logMessage = `${info.timestamp} ${info.level}: ${info.message}`;
          if (info.correlationId) {
            logMessage = `[${info.correlationId}] ${logMessage}`;
          }
          // Simplified metadata logging
          const metadata = { ...info };
          delete metadata.level;
          delete metadata.message;
          delete metadata.timestamp;
          delete metadata.correlationId; // Already handled
          delete metadata.service; // Default winston field, not needed if not set

          const remainingMetadata = Object.fromEntries(
            Object.entries(metadata).filter(
              ([key, value]) => value !== undefined && key !== 'splat' && key !== 'stack' // Remove common noise
            )
          );

          if (Object.keys(remainingMetadata).length > 0) {
            try {
              const metadataString = JSON.stringify(remainingMetadata);
              if (metadataString !== '{}') {
                logMessage += ` ${metadataString}`;
              }
            } catch (e) {
              logMessage += ' (metadata not serializable)';
            }
          }
          if (info.stack) {
            logMessage += `\n${info.stack}`;
          }
          return logMessage;
        })
      ),
    }),
  ],
});

// Function to reconfigure the logger after config is loaded
function reconfigureLogger(loadedConfig) {
  logger.level = loadedConfig.logging.level || 'info';
  // Example: Add or modify transports if needed, e.g., File transport
  // For now, just updating level and ensuring console format is good.
  // If a file transport was desired:
  // if (loadedConfig.logging.file) {
  //   logger.add(new winston.transports.File({
  //     filename: loadedConfig.logging.file,
  //     format: winston.format.combine( /* ... appropriate format ... */ ),
  //   }));
  // }
  logger.info('Logger reconfigured with loaded settings.');
}

function initializeLoggerContext(req, res, next) {
  asyncLocalStorage.run({ correlationId: req.correlationId }, () => {
    // Attach a logger instance to the request that is aware of the correlationId
    // This can be a child logger if your logging library supports it well for context,
    // or rely on asyncLocalStorage for the main logger.
    // For winston with asyncLocalStorage, the main logger instance is already context-aware.
    req.log = logger;
    next();
  });
}

module.exports = {
  logger,
  reconfigureLogger,
  initializeLoggerContext,
  asyncLocalStorage,
};
