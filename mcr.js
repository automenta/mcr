// new/mcr.js - Main server entry point
console.log('[MCR Pre-Init] Starting mcr.js...'); // Very early log

const http = require('http'); // Required for WebSocket server
const { app, setupWebSocketServer } = require('./src/app'); // Import app and WebSocket setup
const config = require('./server/config/config');
const logger = require('./server/utils/logger');

/**
 * Initializes and starts the MCR Express server and attaches the WebSocket server.
 * Configures logging, sets up graceful shutdown handlers,
 * and handles uncaught exceptions and unhandled promise rejections.
 * @returns {import('http').Server} The running HTTP server instance.
 */
function startServer() {
  logger.debug('[MCR Init] app and config required.');

  const PORT = config.server.port;
  const HOST = config.server.host;

  // Create HTTP server from Express app
  const server = http.createServer(app);

  // Setup WebSocket server and attach it to the HTTP server
  logger.info('[MCR Init] Setting up WebSocket server...');
  setupWebSocketServer(server); // This function is now imported from app.js but could be from websocketHandler.js directly
  logger.info('[MCR Init] WebSocket server setup complete.');

  // Start listening
  server.listen(PORT, HOST, () => {
    logger.info(`MCR server with WebSocket support listening on http://${HOST}:${PORT}`);
    logger.info(`WebSocket endpoint available at ws://${HOST}:${PORT}/ws`);
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
    logger.info(`  Ontology Directory: ${config.ontology.directory}`);
    logger.info(
      `  Default Translation Strategy: ${config.translationStrategy}`
    );
    logger.info('---------------------');
  });

  // Graceful shutdown for HTTP server (WebSocket server is tied to it)
  const shutdown = (signal) => {
    logger.info(`${signal} signal received: closing HTTP server`);
    server.close(() => {
      logger.info('HTTP server closed');
      // Add any other cleanup here (e.g., database connections, WebSocket cleanup if needed)
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', { reason, promise });
    // Consider a more graceful shutdown or specific error handling
  });

  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', { error: error.message, stack: error.stack });
    // It's often recommended to gracefully shut down the server on uncaught exceptions
    logger.info('Closing server due to uncaught exception...');
    server.close(() => {
      logger.info('HTTP server closed due to uncaught exception.');
      process.exit(1); // Exit with a 'failure' code
    });
    // Force exit if server close takes too long
    setTimeout(() => {
      logger.error('Forcing exit after timeout during uncaught exception shutdown.');
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
