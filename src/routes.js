// new/src/routes.js
const express = require('express');
const mcpHandler = require('./mcpHandler');
const logger = require('./util/logger'); // Import logger

// Import new handler modules
// const sessionHandlers = require('./api/sessionHandlers'); // Handled by WebSockets
// const strategyHandlers = require('./api/strategyHandlers'); // Handled by WebSockets
// const ontologyHandlers = require('./api/ontologyHandlers'); // Handled by WebSockets
// const translationHandlers = require('./api/translationHandlers'); // Handled by WebSockets
const utilityHandlers = require('./api/utilityHandlers'); // getStatusHandler is used

function setupRoutes(app) {
  logger.info('[Routes] Setting up minimal HTTP routes...');
  const router = express.Router();

  // Health check endpoint - Essential for service monitoring
  router.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', message: 'MCR server is running' });
  });

  // Basic status endpoint - Can be useful for quick checks
  // This handler is from utilityHandlers, so ensure it's still imported if needed.
  // If getStatusHandler is also converted to WebSocket, this can be removed.
  // For now, assuming it might be kept for HTTP.
  router.get('/status', utilityHandlers.getStatusHandler);


  // All other API routes previously defined here (sessions, ontologies, translate, strategies, etc.)
  // are now expected to be handled via WebSocket connections.
  // The WebSocket server logic in app.js and websocketHandlers.js will manage these.

  app.use('/api/v1', router); // Prefix essential HTTP routes

  // MCP SSE Endpoint - This is a Server-Sent Events endpoint, which is HTTP-based.
  // It should remain if SSE functionality is to be preserved.
  // If MCP/SSE is also to be migrated to WebSockets, this would be removed and
  // handled by the WebSocket server. For now, keeping it.
  app.get('/mcp/sse', mcpHandler.handleSse);

  // A simple root message for the server
  app.get('/', (req, res) => {
    res
      .status(200)
      .send(
        'Welcome to MCR Streamlined. Core API functionality is now via WebSockets. HTTP endpoints: /api/v1/health, /api/v1/status, /mcp/sse.'
      );
  });
  logger.info(
    '[Routes] Minimal HTTP routes setup complete. Core API via WebSockets. MCP SSE route configured.'
  );
}

module.exports = setupRoutes;
