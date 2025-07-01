// new/src/routes.js
const express = require('express');
const apiHandlers = require('./apiHandlers');
const mcpHandler = require('./mcpHandler');

function setupRoutes(app) {
  const router = express.Router();

  // Health check endpoint
  router.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', message: 'MCR server is running' });
  });

  // Basic status endpoint (can be kept or removed if /health is preferred)
  router.get('/status', (req, res) => res.status(200).json({ status: 'ok', message: 'MCR Streamlined API is running.' }));

  // Session management
  router.post('/sessions', apiHandlers.createSessionHandler);
  router.get('/sessions/:sessionId', apiHandlers.getSessionHandler); // Added GET session
  router.delete('/sessions/:sessionId', apiHandlers.deleteSessionHandler); // Added DELETE session

  // Fact assertion and querying
  router.post('/sessions/:sessionId/assert', apiHandlers.assertToSessionHandler);
  router.post('/sessions/:sessionId/query', apiHandlers.querySessionHandler);

  app.use('/api/v1', router); // Prefix all API routes with /api/v1

  // MCP SSE Endpoint - should not be prefixed by /api/v1 if client expects /mcp/sse directly
  app.get('/mcp/sse', mcpHandler.handleSse);

  // A simple root message for the server
  app.get('/', (req, res) => {
    res.status(200).send('Welcome to MCR Streamlined. API is at /api/v1');
  });
}

module.exports = setupRoutes;
