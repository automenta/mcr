
const express = require('express');
const ApiHandlers = require('./apiHandlers');

const setupRoutes = (app) => {
    app.get('/', ApiHandlers.getRoot);

    // Session Management
    app.post('/sessions', ApiHandlers.createSession);
    app.get('/sessions/:sessionId', ApiHandlers.getSession);
    app.delete('/sessions/:sessionId', ApiHandlers.deleteSession);

    // Fact Assertion and Querying
    app.post('/sessions/:sessionId/assert', ApiHandlers.assert);
    app.post('/sessions/:sessionId/query', ApiHandlers.query);
    app.post('/sessions/:sessionId/explain-query', ApiHandlers.explainQuery);

    // Translation Endpoints
    app.post('/translate/nl-to-rules', ApiHandlers.translateNlToRules);
    app.post('/translate/rules-to-nl', ApiHandlers.translateRulesToNl);

    // Ontology Management
    app.post('/ontologies', ApiHandlers.addOntology);
    app.get('/ontologies', ApiHandlers.getOntologies);
    app.get('/ontologies/:name', ApiHandlers.getOntology);
    app.delete('/ontologies/:name', ApiHandlers.deleteOntology);
};

module.exports = setupRoutes;
