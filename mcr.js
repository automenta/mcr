// mcr.js - Main server entry point
console.log('[MCR Pre-Init] Starting mcr.js...'); // Very early log

const http = require('http'); // Required for creating HTTP server explicitly
const app = require('./server/app'); // Express app for basic HTTP (health check)
const config = require('./server/config');
const logger = require('./server/logger');
const { setupWebSocketServer } = require('./server/websocketHandler');

/**
 * Initializes and starts the MCR HTTP server and attaches the WebSocket server.
 * Configures logging, sets up graceful shutdown handlers,
 * and handles uncaught exceptions and unhandled promise rejections.
 * @returns {import('http').Server} The running HTTP server instance.
 */
function startServer() {
  logger.info('[MCR Init] Initializing MCR Server...');

  const PORT = config.server.port;
  const HOST = config.server.host;

  // Create HTTP server using Express app
  const server = http.createServer(app);

  // Setup WebSocket server and attach it to the HTTP server
  setupWebSocketServer(server);
  logger.info('[MCR Init] WebSocket server setup completed.');

  // Add a simple root handler to the Express app
  app.get('/', (req, res) => {
    res.status(200).send('Welcome to MCR. WebSocket interface is active. Health check at /health.');
  });

  server.listen(PORT, HOST, () => {
    logger.info(`MCR server with WebSocket support listening on http://${HOST}:${PORT}`);
    logger.info('--- Key Configuration ---');
    logger.info(`  Log Level: ${config.logLevel}`);
    logger.info(`  LLM Provider: ${config.llm.provider}`);
    if (config.llm.provider === 'ollama') {
      logger.info(`    Ollama Model: ${config.llm.ollama.model}`);
      logger.info(`    Ollama Base URL: ${config.llm.ollama.baseURL}`);
    } else if (config.llm.provider === 'gemini') {
      logger.info(`    Gemini Model: ${config.llm.gemini.model}`);
    }
    logger.info(`  Reasoner Provider: ${config.reasoner.provider}`);
    logger.info(`  Ontology Directory: ${config.ontology.directory}`);
    logger.info(`  Default Base Strategy: ${config.translationStrategy}`);
    logger.info('-------------------------');
  });

  // Graceful shutdown
  const gracefulShutdown = (signal) => {
    logger.info(`${signal} signal received: closing HTTP server and WebSocket server.`);
    // For `ws` library, closing the HTTP server handles associated WebSocket server.
    server.close(() => {
      logger.info('HTTP server closed.');
      // Add any other cleanup here (e.g., database connections)
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', { reason, promise });
    // Consider if server should shut down on unhandled rejections
  });

  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', { error: error.stack || error });
    // Gracefully shut down the server on uncaught exceptions
    logger.info('Closing server due to uncaught exception...');
    server.close(() => {
      logger.info('HTTP server closed due to uncaught exception.');
      process.exit(1); // Exit with a 'failure' code
    });
    // Force exit if server close takes too long
    setTimeout(() => {
      logger.error('Forcefully exiting due to timeout after uncaught exception.');
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
