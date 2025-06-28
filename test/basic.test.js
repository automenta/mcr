const axios = require('axios');
const path = require('path');
const fs = require('fs');

const API_BASE_URL = process.env.MCR_API_URL || 'http://localhost:3000';

describe('MCR API Basic Integration Tests', () => {
    let sessionId = null;
    const ontologyPath = path.resolve(__dirname, '../ontologies/family.pl');
    let ontologyContent = null;

    beforeAll(async () => {
        // Ensure the MCR server is running before tests
        try {
            await axios.get(`${API_BASE_URL}/`);
            console.log(`\nMCR server is running at ${API_BASE_URL}`);
        } catch (error) {
            // Temporarily comment out process.exit(1) to allow other tests to run
            // console.error(`\nError: MCR server not reachable at ${API_BASE_URL}. Please ensure it is running.`);
            // process.exit(1);
            console.warn(`\nWarning: MCR server not reachable at ${API_BASE_URL}. Integration tests may fail.`);
        }

        // Load ontology content once
        if (fs.existsSync(ontologyPath)) {
            ontologyContent = fs.readFileSync(ontologyPath, 'utf8');
        } else {
            console.warn(`Skipping dynamic ontology test: ${ontologyPath} not found.`);
        }
    });

    beforeEach(async () => {
        // Create a new session for each test to ensure isolation
        const createSessionResponse = await axios.post(`${API_BASE_URL}/sessions`);
        sessionId = createSessionResponse.data.sessionId;
        expect(sessionId).toBeDefined();
    });

    afterEach(async () => {
        // Delete the session after each test
        if (sessionId) {
            try {
                await axios.delete(`${API_BASE_URL}/sessions/${sessionId}`);
            } catch (error) {
                console.error(`Failed to delete session ${sessionId}:`, error.message);
            }
        }
    });

    test('should create a new session', async () => {
        // Session creation is handled in beforeEach, just assert sessionId exists
        expect(sessionId).toBeDefined();
        const getSessionResponse = await axios.get(`${API_BASE_URL}/sessions/${sessionId}`);
        expect(getSessionResponse.data.sessionId).toBe(sessionId);
        expect(getSessionResponse.data.facts).toEqual([]);
        expect(getSessionResponse.data.factCount).toBe(0);
    });

    test('should assert a fact into the session', async () => {
        const factText = "John is a parent of Mary.";
        const assertResponse = await axios.post(`${API_BASE_URL}/sessions/${sessionId}/assert`, { text: factText });
        expect(assertResponse.data.addedFacts).toBeInstanceOf(Array);
        expect(assertResponse.data.addedFacts.length).toBeGreaterThan(0);
        expect(assertResponse.data.totalFactsInSession).toBeGreaterThan(0);

        const getSessionResponse = await axios.get(`${API_BASE_URL}/sessions/${sessionId}`);
        expect(getSessionResponse.data.facts).toContain(expect.stringContaining('parent(john,mary)'));
    });

    test('should query a fact from the session', async () => {
        const factText = "John is a parent of Mary.";
        await axios.post(`${API_BASE_URL}/sessions/${sessionId}/assert`, { text: factText });

        const queryQuestion = "Who is Mary's parent?";
        const queryResponse = await axios.post(`${API_BASE_URL}/sessions/${sessionId}/query`, { query: queryQuestion });

        expect(queryResponse.data.answer).toBeDefined();
        expect(queryResponse.data.answer.toLowerCase()).toContain('john');
        expect(queryResponse.data.result).toBeDefined();
    });

    test('should handle dynamic ontology loading and query', async () => {
        if (!ontologyContent) {
            console.warn('Skipping dynamic ontology test due to missing family.pl');
            return;
        }

        const dynamicQueryQuestion = "Is Mary a child of John?";
        const dynamicQueryResponse = await axios.post(`${API_BASE_URL}/sessions/${sessionId}/query`, {
            query: dynamicQueryQuestion,
            ontology: ontologyContent
        });

        expect(dynamicQueryResponse.data.answer).toBeDefined();
        expect(dynamicQueryResponse.data.answer.toLowerCase()).toContain('yes');
        expect(dynamicQueryResponse.data.result).toBeDefined();
    });

    test('should translate natural language to rules', async () => {
        const text = "Birds can fly. Penguins are birds but cannot fly.";
        const response = await axios.post(`${API_BASE_URL}/translate/nl-to-rules`, { text });
        expect(response.data.rules).toBeInstanceOf(Array);
        expect(response.data.rules.length).toBeGreaterThan(0);
        expect(response.data.rules).toContain(expect.stringContaining('can_fly(X) :- bird(X)'));
        expect(response.data.rules).toContain(expect.stringContaining('bird(penguin)'));
    });

    test('should translate rules to natural language', async () => {
        const rules = ["parent(X, Y) :- father(X, Y).", "parent(X, Y) :- mother(X, Y)."];
        const response = await axios.post(`${API_BASE_URL}/translate/rules-to-nl`, { rules, style: "formal" });
        expect(response.data.text).toBeDefined();
        expect(response.data.text.toLowerCase()).toContain('parent');
        expect(response.data.text.toLowerCase()).toContain('father');
        expect(response.data.text.toLowerCase()).toContain('mother');
    });
});
