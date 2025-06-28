const request = require('supertest');
const path = require('path');
const fs = require('fs');
const { app } = require('../mcr'); // Import the Express app
const logger = require('../src/logger'); // Import logger
const ConfigManager = require('../src/config'); // Import ConfigManager
const SessionManager = require('../src/sessionManager'); // Import SessionManager

// Suppress logger output during tests
jest.mock('../src/logger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
}));

// Mock LLMService to avoid actual LLM calls and dependencies
jest.mock('../src/llmService', () => ({
    init: jest.fn(), // Mock init as it's called during mcr.js import
    nlToRules: jest.fn().mockResolvedValue(['mock_rule(a).']),
    queryToProlog: jest.fn().mockResolvedValue('mock_query(X).'),
    resultToNl: jest.fn().mockImplementation((_query, result, _style) => {
        if (result === 'No solution found.') return Promise.resolve('No, there is no solution.');
        return Promise.resolve(`Yes, the mock answer is ${result}`);
    }),
    rulesToNl: jest.fn().mockResolvedValue('Mock natural language explanation of rules.'),
    explainQuery: jest.fn().mockResolvedValue('Mock explanation for the query.'),
    getPromptTemplates: jest.fn().mockReturnValue({ template1: "mock" }),
}));


describe('MCR API Integration Tests (with Supertest)', () => {
    let sessionId = null;
    const ontologyPath = path.resolve(__dirname, '../ontologies/family.pl');
    let ontologyContent = null;
    const originalSessionStoragePath = ConfigManager.load().session.storagePath;
    const testSessionStoragePath = path.join(__dirname, 'test_sessions_integration');


    beforeAll(async () => {
        // Override session storage path for test isolation
        ConfigManager.load().session.storagePath = testSessionStoragePath;
        if (fs.existsSync(testSessionStoragePath)) {
            fs.rmSync(testSessionStoragePath, { recursive: true, force: true });
        }
        fs.mkdirSync(testSessionStoragePath, { recursive: true });
        SessionManager._initializeStorage(); // Re-initialize with new path


        if (fs.existsSync(ontologyPath)) {
            ontologyContent = fs.readFileSync(ontologyPath, 'utf8');
        } else {
            console.warn(`Skipping dynamic ontology test: ${ontologyPath} not found. This test may be less effective.`);
        }
    });

    afterAll(async () => {
        // Clean up test session storage
        if (fs.existsSync(testSessionStoragePath)) {
            fs.rmSync(testSessionStoragePath, { recursive: true, force: true });
        }
        // Restore original session storage path (important if other tests depend on it)
        ConfigManager.load().session.storagePath = originalSessionStoragePath;
        SessionManager._initializeStorage(); // Re-initialize with original path
    });

    beforeEach(async () => {
        // Create a new session for each test to ensure isolation
        const createSessionResponse = await request(app).post('/sessions');
        expect(createSessionResponse.status).toBe(201);
        sessionId = createSessionResponse.body.sessionId;
        expect(sessionId).toBeDefined();
    });

    afterEach(async () => {
        // Delete the session after each test
        if (sessionId) {
            try {
                await request(app).delete(`/sessions/${sessionId}`);
            } catch (error) {
                // Log if deletion fails, but don't make the test fail for this
                console.error(`Integration Test: Failed to delete session ${sessionId} during cleanup:`, error.message);
            }
        }
    });

    test('GET / should return API status', async () => {
        const response = await request(app).get('/');
        expect(response.status).toBe(200);
        expect(response.body.status).toBe('ok');
        expect(response.body.name).toBe('Model Context Reasoner');
    });

    test('should create a new session and retrieve it', async () => {
        // Session creation is handled in beforeEach
        const getSessionResponse = await request(app).get(`/sessions/${sessionId}`);
        expect(getSessionResponse.status).toBe(200);
        expect(getSessionResponse.body.sessionId).toBe(sessionId);
        expect(getSessionResponse.body.facts).toEqual([]);
        expect(getSessionResponse.body.factCount).toBe(0);
    });

    test('should assert a fact into the session', async () => {
        const factText = "John is a parent of Mary.";
        const assertResponse = await request(app)
            .post(`/sessions/${sessionId}/assert`)
            .send({ text: factText });

        expect(assertResponse.status).toBe(200);
        expect(assertResponse.body.addedFacts).toEqual(['mock_rule(a).']); // From mocked LlmService
        expect(assertResponse.body.totalFactsInSession).toBeGreaterThanOrEqual(1); // Depends on mock

        const getSessionResponse = await request(app).get(`/sessions/${sessionId}`);
        expect(getSessionResponse.status).toBe(200);
        // Check if the mock rule was added
        expect(getSessionResponse.body.facts).toContain('mock_rule(a).');
    });

    test('should query a fact from the session', async () => {
        // Assert a (mocked) fact first
        await request(app)
            .post(`/sessions/${sessionId}/assert`)
            .send({ text: "Some fact that leads to mock_rule(a)." });

        const queryQuestion = "What is the mock query for X?";
        const queryResponse = await request(app)
            .post(`/sessions/${sessionId}/query`)
            .send({ query: queryQuestion });

        expect(queryResponse.status).toBe(200);
        expect(queryResponse.body.queryProlog).toBe('mock_query(X).');
        expect(queryResponse.body.answer).toBeDefined();
        // The exact answer depends on the mocked LlmService.resultToNl and ReasonerService.runQuery
        // For this test, we are more interested in the flow and that an answer is produced.
    });

    test('should handle dynamic ontology loading and query (if family.pl exists)', async () => {
        if (!ontologyContent) {
            // console.warn('Skipping dynamic ontology test in basic.test.js due to missing family.pl');
            return; // Skip test if ontology file is not present
        }
        // Assert a fact that would be used by the family ontology if it were real
        // With mocks, this just ensures the flow works
        await request(app)
            .post(`/sessions/${sessionId}/assert`)
            .send({ text: "parent(john, mary)." });


        const dynamicQueryQuestion = "Is Mary a child of John?";
        const dynamicQueryResponse = await request(app)
            .post(`/sessions/${sessionId}/query`)
            .send({
                query: dynamicQueryQuestion,
                ontology: ontologyContent // This will be combined with session facts by SessionManager
            });

        expect(dynamicQueryResponse.status).toBe(200);
        expect(dynamicQueryResponse.body.queryProlog).toBe('mock_query(X).'); // From mock
        expect(dynamicQueryResponse.body.answer).toBeDefined();
        // We can't assert specific Prolog output due to ReasonerService being complex to fully mock here
        // and LlmService providing the final NL answer.
        // The key is that the request completes and provides some answer.
    });

    test('should translate natural language to rules (mocked)', async () => {
        const text = "Birds can fly. Penguins are birds but cannot fly.";
        const response = await request(app)
            .post('/translate/nl-to-rules')
            .send({ text });

        expect(response.status).toBe(200);
        expect(response.body.rules).toEqual(['mock_rule(a).']); // From mocked LlmService
    });

    test('should translate rules to natural language (mocked)', async () => {
        const rules = ["parent(X, Y) :- father(X, Y).", "parent(X, Y) :- mother(X, Y)."];
        const response = await request(app)
            .post('/translate/rules-to-nl')
            .send({ rules, style: "formal" });

        expect(response.status).toBe(200);
        expect(response.body.text).toBe('Mock natural language explanation of rules.'); // From mocked LlmService
    });

    test('should get prompts (mocked)', async () => {
        const response = await request(app).get('/prompts');
        expect(response.status).toBe(200);
        expect(response.body).toEqual({ template1: "mock" }); // From mocked LlmService
    });

    test('should explain query (mocked)', async () => {
        const response = await request(app)
            .post(`/sessions/${sessionId}/explain-query`)
            .send({ query: "Why is X true?" });
        expect(response.status).toBe(200);
        expect(response.body.explanation).toBe('Mock explanation for the query.'); // From mocked LlmService
    });
});
