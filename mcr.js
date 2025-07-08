// new/mcr.js - Main server entry point
console.log('[MCR Pre-Init] Starting mcr.js...'); // Very early log

/**
 * Initializes and starts the MCR Express server.
 * Configures logging, sets up graceful shutdown handlers,
 * and handles uncaught exceptions and unhandled promise rejections.
 * @returns {import('http').Server} The running HTTP server instance.
 */
function startServer() {
  const app = require('./src/app');
  // console.log('[MCR Pre-Init] app required.'); // Logger not yet available
  const config = require('./src/config');
  // console.log('[MCR Pre-Init] config required.'); // Logger not yet available
  const logger = require('./src/logger');

  logger.debug('[MCR Init] app required.');
  logger.debug('[MCR Init] config required.');

  const PORT = config.server.port;
  const HOST = config.server.host;

  // Initialize core services if they have explicit init steps (currently they don't need async init)
  // For example, if mcrService needed async setup:
  // const mcrService = require('./src/mcrService');
  // mcrService.init().then(() => { ... start server ... }).catch(err => ...);

  const server = app.listen(PORT, HOST, () => {
    // logger.info(`MCR Streamlined server listening on http://${HOST}:${PORT}`);
    logger.info('Server is running'); // Exact match for tool detection
    logger.info('--- Configuration ---');
    logger.info(`  Log Level: ${config.logLevel}`);
    logger.info(`  LLM Provider: ${config.llm.provider}`);
    if (config.llm.provider === 'ollama') {
      logger.info(`    Ollama Model: ${config.llm.ollama.model}`);
      logger.info(`    Ollama Base URL: ${config.llm.ollama.baseURL}`);
    } else if (config.llm.provider === 'gemini') {
      logger.info(`    Gemini Model: ${config.llm.gemini.model}`);
      // Do NOT log API keys
    }
    logger.info(`  Reasoner Provider: ${config.reasoner.provider}`);
    // Add reasoner specifics if any in the future
    logger.info(`  Ontology Directory: ${config.ontology.directory}`);
    logger.info(
      `  Default Translation Strategy: ${config.translationStrategy}`
    );
    logger.info('---------------------');
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
    logger.error('Unhandled Rejection at:', reason, { promise });
    // Application specific logging, throwing an error, or other logic here
  });

  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error);
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

  return server; // Return the server instance
}

// If this script is run directly, start the server
if (require.main === module) {
  startServer();
}

module.exports = { startServer };
