// new/mcr.js - Main server entry point
console.log('[MCR Pre-Init] Starting mcr.js...'); // Very early log

/**
 * Initializes and starts the MCR Express server.
 * Configures logging, sets up graceful shutdown handlers,
 * and handles uncaught exceptions and unhandled promise rejections.
 * @returns {Promise<import('http').Server>} A promise that resolves to the running HTTP server instance.
 */
async function startServer() {
  // Logger and config should be initialized first
  const config = require('./src/config');
  const logger = require('./src/util/logger');
  logger.info('[MCR Init] Initializing MCR server...');

  const createHttpServer = require('./src/app'); // This is now an async function

  logger.debug('[MCR Init] src/app (createServer) required.');
  logger.debug('[MCR Init] config required.');

  const PORT = config.server.port;
  const HOST = config.server.host;

  // Initialize core services if they have explicit init steps (currently they don't need async init)
  // For example, if mcrService needed async setup:
  // const mcrService = require('./src/mcrService');
  // await mcrService.init(); // if it were async

  // createHttpServer is an async function that returns the configured http.Server instance
  const server = await createHttpServer();
  logger.info('[MCR Init] HTTP server instance created by src/app.');

  // Now, attach the listener to the server instance
  server.listen(PORT, HOST, () => {
    logger.info('Server is running'); // Exact match for tool detection
    logger.info(`  Listening on: http://${HOST}:${PORT}`);
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

  server.on('error', (error) => {
    if (error.syscall !== 'listen') {
      throw error;
    }
    // Handle specific listen errors with friendly messages
    switch (error.code) {
      case 'EACCES':
        logger.error(
          `[MCR Start] Error: Port ${PORT} requires elevated privileges.`
        );
        process.exit(1);
        break;
      case 'EADDRINUSE':
        logger.error(`[MCR Start] Error: Port ${PORT} is already in use.`);
        process.exit(1);
        break;
      default:
        logger.error(`[MCR Start] Error starting server: ${error.message}`);
        process.exit(1);
    }
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
  startServer().catch((error) => {
    // Use logger if available, otherwise console.error
    const logger = require('./src/util/logger'); // Re-require in this scope or ensure it's global
    logger.error('[MCR Critical] Failed to start server:', error);
    process.exit(1);
  });
}

module.exports = { startServer };
