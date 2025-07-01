// new/mcr.js - Main server entry point
const app = require('./src/app');
const config = require('./src/config');
const logger = require('./src/logger');

const PORT = config.server.port;
const HOST = config.server.host;

// Initialize core services if they have explicit init steps (currently they don't need async init)
// For example, if mcrService needed async setup:
// const mcrService = require('./src/mcrService');
// mcrService.init().then(() => { ... start server ... }).catch(err => ...);

const server = app.listen(PORT, HOST, () => {
  logger.info(`MCR Streamlined server listening on http://${HOST}:${PORT}`);
  logger.info(`Current LLM provider: ${config.llm.provider}`);
  logger.info(`Current Reasoner provider: ${config.reasoner.provider}`);
  logger.info(`Log level set to: ${config.logLevel}`);
  // Log important config paths or settings if helpful
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    logger.info('HTTP server closed');
    // Add any other cleanup here (e.g., database connections)
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT signal received: closing HTTP server');
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', { promise, reason });
  // Application specific logging, throwing an error, or other logic here
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', { error });
  // Application specific logging, shutdown, or other logic here
  // It's often recommended to gracefully shut down the server on uncaught exceptions
  server.close(() => {
    logger.info('HTTP server closed due to uncaught exception.');
    process.exit(1); // Exit with a 'failure' code
  });
  // Force exit if server close takes too long
  setTimeout(() => {
        process.exit(1);
    }, 5000); // 5 seconds
});
