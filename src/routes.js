// new/src/routes.js
const express = require('express');
const mcpHandler = require('./mcpHandler');
const logger = require('./util/logger'); // Import logger

// Import new handler modules
const sessionHandlers = require('./api/sessionHandlers');
const strategyHandlers = require('./api/strategyHandlers');
const ontologyHandlers = require('./api/ontologyHandlers');
const translationHandlers = require('./api/translationHandlers');
const utilityHandlers = require('./api/utilityHandlers');

function setupRoutes(app) {
  logger.info('[Routes] Setting up API routes...');
  const router = express.Router();

  // Health check endpoint
  router.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', message: 'MCR server is running' });
  });

  // Basic status endpoint
  router.get('/status', utilityHandlers.getStatusHandler);

  // Session management
  router.post('/sessions', sessionHandlers.createSessionHandler);
  router.get('/sessions/:sessionId', sessionHandlers.getSessionHandler);
  router.delete('/sessions/:sessionId', sessionHandlers.deleteSessionHandler);

  // Fact assertion and querying
  router.post(
    '/sessions/:sessionId/assert',
    sessionHandlers.assertToSessionHandler
  );
  router.post(
    '/sessions/:sessionId/query',
    sessionHandlers.querySessionHandler
  );
  router.post(
    '/sessions/:sessionId/explain-query',
    translationHandlers.explainQueryHandler // Moved to translationHandlers
  );

  // Ontology management
  router.post('/ontologies', ontologyHandlers.createOntologyHandler);
  router.get('/ontologies', ontologyHandlers.listOntologiesHandler);
  router.get('/ontologies/:name', ontologyHandlers.getOntologyHandler);
  router.put('/ontologies/:name', ontologyHandlers.updateOntologyHandler);
  router.delete('/ontologies/:name', ontologyHandlers.deleteOntologyHandler);

  // Direct translation
  router.post(
    '/translate/nl-to-rules',
    translationHandlers.nlToRulesDirectHandler
  );
  router.post(
    '/translate/rules-to-nl',
    translationHandlers.rulesToNlDirectHandler
  );

  // Strategy Management Endpoints
  router.get('/strategies', strategyHandlers.listStrategiesHandler);
  router.put('/strategies/active', strategyHandlers.setStrategyHandler);
  router.get('/strategies/active', strategyHandlers.getActiveStrategyHandler);

  // Utility & Debugging
  router.get('/prompts', utilityHandlers.getPromptsHandler);
  router.post('/debug/format-prompt', utilityHandlers.debugFormatPromptHandler);

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
