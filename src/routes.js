// new/src/routes.js
const express = require('express');
const apiHandlers = require('./apiHandlers');
const mcpHandler = require('./mcpHandler');
const logger = require('./logger'); // Import logger

function setupRoutes(app) {
  logger.info('[Routes] Setting up API routes...');
  const router = express.Router();

  // Health check endpoint
  router.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', message: 'MCR server is running' });
  });

  // Basic status endpoint (can be kept or removed if /health is preferred)
  // router.get('/status', (req, res) => res.status(200).json({ status: 'ok', message: 'MCR Streamlined API is running.' }));
  router.get('/status', apiHandlers.getStatusHandler); // Use dedicated handler

  // Session management
  router.post('/sessions', apiHandlers.createSessionHandler);
  router.get('/sessions/:sessionId', apiHandlers.getSessionHandler); // Added GET session
  router.delete('/sessions/:sessionId', apiHandlers.deleteSessionHandler); // Added DELETE session

  // Fact assertion and querying
  router.post(
    '/sessions/:sessionId/assert',
    apiHandlers.assertToSessionHandler
  );
  router.post('/sessions/:sessionId/query', apiHandlers.querySessionHandler);
  router.post(
    '/sessions/:sessionId/explain-query',
    apiHandlers.explainQueryHandler
  );

  // Ontology management
  router.post('/ontologies', apiHandlers.createOntologyHandler);
  router.get('/ontologies', apiHandlers.listOntologiesHandler);
  router.get('/ontologies/:name', apiHandlers.getOntologyHandler);
  router.put('/ontologies/:name', apiHandlers.updateOntologyHandler);
  router.delete('/ontologies/:name', apiHandlers.deleteOntologyHandler);

  // Direct translation
  router.post('/translate/nl-to-rules', apiHandlers.nlToRulesDirectHandler);
  router.post('/translate/rules-to-nl', apiHandlers.rulesToNlDirectHandler);

  // Utility & Debugging
  router.get('/prompts', apiHandlers.getPromptsHandler);
  router.post('/debug/format-prompt', apiHandlers.debugFormatPromptHandler);

  app.use('/api/v1', router); // Prefix all API routes with /api/v1

  // MCP SSE Endpoint - should not be prefixed by /api/v1 if client expects /mcp/sse directly
  app.get('/mcp/sse', mcpHandler.handleSse);

  // A simple root message for the server
  app.get('/', (req, res) => {
    res.status(200).send('Welcome to MCR Streamlined. API is at /api/v1');
  });
  logger.info(
    '[Routes] API routes setup complete. MCP SSE route also configured.'
  );
}

module.exports = setupRoutes;
