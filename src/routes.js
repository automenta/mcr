const AllHandlers = require('./handlers'); // Import from the new index file
const mcpHandler = require('./mcpHandler'); // Import MCP Handler

const setupRoutes = (app) => {
  // MCP SSE Endpoint
  app.get('/mcp/sse', mcpHandler.handleSse);

  app.get('/', AllHandlers.getRoot);

  // Session Management
  app.post('/sessions', AllHandlers.createSession);
  app.get('/sessions/:sessionId', AllHandlers.getSession);
  app.delete('/sessions/:sessionId', AllHandlers.deleteSession);

  // Fact Assertion and Querying
  app.post('/sessions/:sessionId/assert', AllHandlers.assertAsync);
  app.post('/sessions/:sessionId/query', AllHandlers.queryAsync);
  app.post('/sessions/:sessionId/explain-query', AllHandlers.explainQueryAsync);

  // Translation Endpoints
  app.post('/translate/nl-to-rules', AllHandlers.translateNlToRulesAsync);
  app.post('/translate/rules-to-nl', AllHandlers.translateRulesToNlAsync);

  // Prompt Management
  app.get('/prompts', AllHandlers.getPrompts);
  app.post('/debug/format-prompt', AllHandlers.debugFormatPromptAsync);

  // Ontology Management
  app.post('/ontologies', AllHandlers.addOntology);
  app.put('/ontologies/:name', AllHandlers.updateOntology);
  app.get('/ontologies', AllHandlers.getOntologies);
  app.get('/ontologies/:name', AllHandlers.getOntology);
  app.delete('/ontologies/:name', AllHandlers.deleteOntology);
};

module.exports = setupRoutes;
