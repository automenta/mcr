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
              ([key, value]) =>
                value !== undefined && key !== 'splat' && key !== 'stack' // Remove common noise
            )
          );

          if (Object.keys(remainingMetadata).length > 0) {
            try {
              const metadataString = JSON.stringify(remainingMetadata);
              if (metadataString !== '{}') {
                logMessage += ` ${metadataString}`;
              }
            } catch {
              // Removed unused _e
              // Prefixed 'e'
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
  const store = {
    correlationId: req.correlationId,
    startTime: Date.now(), // Capture start time for duration calculation
  };

  asyncLocalStorage.run(store, () => {
    // Attach logger to request object, it will use the correlationId from asyncLocalStorage
    req.log = logger;

    // Log incoming request using 'http' level
    // We log standard request details. Sensitive headers/body should not be logged here.
    logger.http(
      `--> ${req.method} ${req.originalUrl || req.url} from ${req.ip}`,
      {
        httpRequest: {
          requestMethod: req.method,
          requestUrl: req.originalUrl || req.url,
          remoteIp: req.ip,
          userAgent: req.headers['user-agent'],
          // Consider adding 'referer' if valuable: req.headers.referer
        },
      }
    );

    // Capture response finish to log outgoing response
    res.on('finish', () => {
      // Retrieve startTime from the store for this specific request context
      const reqStore = asyncLocalStorage.getStore();
      const reqStartTime = reqStore ? reqStore.startTime : undefined;
      const durationMs = reqStartTime ? Date.now() - reqStartTime : undefined;

      logger.http(
        `<-- ${req.method} ${req.originalUrl || req.url} - ${res.statusCode} (${durationMs !== undefined ? `${durationMs}ms` : 'N/A'})`,
        {
          httpResponse: {
            status: res.statusCode,
            durationMs: durationMs,
          },
          // Note: Logging response body can be verbose and contain sensitive data.
          // It's generally avoided in standard access logs.
        }
      );
    });

    next();
  });
}

module.exports = {
  logger,
  reconfigureLogger,
  initializeLoggerContext,
  asyncLocalStorage,
};
