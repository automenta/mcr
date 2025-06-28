const request = require('supertest');
const { app } = require('../mcr'); // Import the configured app instance
const ApiHandlers = require('../src/apiHandlers');

// Mock ApiHandlers to prevent actual handler logic from running
// We are testing the routing, not the handlers themselves here
jest.mock('../src/apiHandlers', () => ({
    getRoot: jest.fn((req, res) => res.status(200).json({ message: 'mock getRoot' })),
    createSession: jest.fn((req, res) => res.status(201).json({ message: 'mock createSession' })),
    getSession: jest.fn((req, res) => res.status(200).json({ message: 'mock getSession' })),
    deleteSession: jest.fn((req, res) => res.status(200).json({ message: 'mock deleteSession' })),
    assert: jest.fn((req, res) => res.status(200).json({ message: 'mock assert' })),
    query: jest.fn((req, res) => res.status(200).json({ message: 'mock query' })),
    explainQuery: jest.fn((req, res) => res.status(200).json({ message: 'mock explainQuery' })),
    translateNlToRules: jest.fn((req, res) => res.status(200).json({ message: 'mock translateNlToRules' })),
    translateRulesToNl: jest.fn((req, res) => res.status(200).json({ message: 'mock translateRulesToNl' })),
    getPrompts: jest.fn((req, res) => res.status(200).json({ message: 'mock getPrompts' })),
    addOntology: jest.fn((req, res) => res.status(201).json({ message: 'mock addOntology' })),
    updateOntology: jest.fn((req, res) => res.status(200).json({ message: 'mock updateOntology' })),
    getOntologies: jest.fn((req, res) => res.status(200).json({ message: 'mock getOntologies' })),
    getOntology: jest.fn((req, res) => res.status(200).json({ message: 'mock getOntology' })),
    deleteOntology: jest.fn((req, res) => res.status(200).json({ message: 'mock deleteOntology' })),
}));

describe('API Routes (src/routes.js)', () => {
    afterEach(() => {
        jest.clearAllMocks();
    });

    test('GET / should call ApiHandlers.getRoot', async () => {
        const response = await request(app).get('/');
        expect(response.statusCode).toBe(200);
        expect(ApiHandlers.getRoot).toHaveBeenCalledTimes(1);
        expect(response.body.message).toBe('mock getRoot');
    });

    // Session Management
    test('POST /sessions should call ApiHandlers.createSession', async () => {
        const response = await request(app).post('/sessions').send({});
        expect(response.statusCode).toBe(201);
        expect(ApiHandlers.createSession).toHaveBeenCalledTimes(1);
    });

    test('GET /sessions/:sessionId should call ApiHandlers.getSession', async () => {
        const response = await request(app).get('/sessions/test-id');
        expect(response.statusCode).toBe(200);
        expect(ApiHandlers.getSession).toHaveBeenCalledTimes(1);
        expect(ApiHandlers.getSession.mock.calls[0][0].params.sessionId).toBe('test-id');
    });

    test('DELETE /sessions/:sessionId should call ApiHandlers.deleteSession', async () => {
        const response = await request(app).delete('/sessions/test-id');
        expect(response.statusCode).toBe(200);
        expect(ApiHandlers.deleteSession).toHaveBeenCalledTimes(1);
        expect(ApiHandlers.deleteSession.mock.calls[0][0].params.sessionId).toBe('test-id');
    });

    // Fact Assertion and Querying
    test('POST /sessions/:sessionId/assert should call ApiHandlers.assert', async () => {
        const response = await request(app).post('/sessions/test-id/assert').send({ text: 'fact' });
        expect(response.statusCode).toBe(200);
        expect(ApiHandlers.assert).toHaveBeenCalledTimes(1);
        expect(ApiHandlers.assert.mock.calls[0][0].params.sessionId).toBe('test-id');
    });

    test('POST /sessions/:sessionId/query should call ApiHandlers.query', async () => {
        const response = await request(app).post('/sessions/test-id/query').send({ query: 'question?' });
        expect(response.statusCode).toBe(200);
        expect(ApiHandlers.query).toHaveBeenCalledTimes(1);
        expect(ApiHandlers.query.mock.calls[0][0].params.sessionId).toBe('test-id');
    });

    test('POST /sessions/:sessionId/explain-query should call ApiHandlers.explainQuery', async () => {
        const response = await request(app).post('/sessions/test-id/explain-query').send({ query: 'question?' });
        expect(response.statusCode).toBe(200);
        expect(ApiHandlers.explainQuery).toHaveBeenCalledTimes(1);
        expect(ApiHandlers.explainQuery.mock.calls[0][0].params.sessionId).toBe('test-id');
    });

    // Translation Endpoints
    test('POST /translate/nl-to-rules should call ApiHandlers.translateNlToRules', async () => {
        const response = await request(app).post('/translate/nl-to-rules').send({ text: 'nl text' });
        expect(response.statusCode).toBe(200);
        expect(ApiHandlers.translateNlToRules).toHaveBeenCalledTimes(1);
    });

    test('POST /translate/rules-to-nl should call ApiHandlers.translateRulesToNl', async () => {
        const response = await request(app).post('/translate/rules-to-nl').send({ rules: ['rule.'] });
        expect(response.statusCode).toBe(200);
        expect(ApiHandlers.translateRulesToNl).toHaveBeenCalledTimes(1);
    });

    // Prompt Management
    test('GET /prompts should call ApiHandlers.getPrompts', async () => {
        const response = await request(app).get('/prompts');
        expect(response.statusCode).toBe(200);
        expect(ApiHandlers.getPrompts).toHaveBeenCalledTimes(1);
    });

    // Ontology Management
    test('POST /ontologies should call ApiHandlers.addOntology', async () => {
        const response = await request(app).post('/ontologies').send({ name: 'onto', rules: 'rule.' });
        expect(response.statusCode).toBe(201);
        expect(ApiHandlers.addOntology).toHaveBeenCalledTimes(1);
    });

    test('PUT /ontologies/:name should call ApiHandlers.updateOntology', async () => {
        const response = await request(app).put('/ontologies/onto-name').send({ rules: 'new rule.' });
        expect(response.statusCode).toBe(200);
        expect(ApiHandlers.updateOntology).toHaveBeenCalledTimes(1);
        expect(ApiHandlers.updateOntology.mock.calls[0][0].params.name).toBe('onto-name');
    });

    test('GET /ontologies should call ApiHandlers.getOntologies', async () => {
        const response = await request(app).get('/ontologies');
        expect(response.statusCode).toBe(200);
        expect(ApiHandlers.getOntologies).toHaveBeenCalledTimes(1);
    });

    test('GET /ontologies/:name should call ApiHandlers.getOntology', async () => {
        const response = await request(app).get('/ontologies/onto-name');
        expect(response.statusCode).toBe(200);
        expect(ApiHandlers.getOntology).toHaveBeenCalledTimes(1);
        expect(ApiHandlers.getOntology.mock.calls[0][0].params.name).toBe('onto-name');
    });

    test('DELETE /ontologies/:name should call ApiHandlers.deleteOntology', async () => {
        const response = await request(app).delete('/ontologies/onto-name');
        expect(response.statusCode).toBe(200);
        expect(ApiHandlers.deleteOntology).toHaveBeenCalledTimes(1);
        expect(ApiHandlers.deleteOntology.mock.calls[0][0].params.name).toBe('onto-name');
    });

    // Test JSON body parsing middleware
    test('should parse JSON request bodies', async () => {
        const testBody = { key: 'value', nested: { num: 1 } };
        // Using a route we know expects a body
        await request(app).post('/sessions/test-id/assert').send(testBody);

        // Check the req.body received by the mock handler
        expect(ApiHandlers.assert).toHaveBeenCalledWith(
            expect.objectContaining({
                body: testBody
            }),
            expect.anything(), // res object
            expect.anything()  // next function
        );
    });
});
