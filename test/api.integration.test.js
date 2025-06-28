const request = require('supertest');
const path = require('path');
const fs = require('fs');

// --- IMPORTANT: Mock setup needs to be very carefully ordered ---

// 1. Define paths for test data FIRST
const TEST_SESSION_STORAGE_PATH = path.resolve(__dirname, 'test_data_integration/sessions');
const TEST_ONTOLOGY_STORAGE_PATH = path.resolve(__dirname, 'test_data_integration/ontologies');

// 2. Mock ConfigManager: It's a dependency for SessionManager and the app (mcr.js)
// Ensure this mock is in place before SessionManager or mcr.js is imported anywhere.
jest.mock('../src/config', () => {
    const actualConfig = jest.requireActual('../src/config');
    return {
        ...actualConfig, // Keep other methods if any, though get/load are primary
        get: jest.fn().mockReturnValue({
            server: { host: '0.0.0.0', port: 8080 }, // Port used by supertest
            llm: {
                provider: 'openai', // Mocked LLM service, so provider choice less critical here
                model: { openai: 'gpt-test-int', gemini: 'gemini-test-int', ollama: 'ollama-test-int' },
                apiKey: { openai: 'testkey_integration_suite' }, // Needs to be present for validation
                ollamaBaseUrl: 'http://localhost:11434/integration',
            },
            logging: { level: 'error' }, // Keep logs quiet during tests
            session: { storagePath: TEST_SESSION_STORAGE_PATH },
            ontology: { storagePath: TEST_ONTOLOGY_STORAGE_PATH },
            debugMode: false,
        }),
        // load is also used by some modules, ensure it returns the same test config
        load: jest.fn().mockReturnValue({
            server: { host: '0.0.0.0', port: 8080 },
            llm: {
                provider: 'openai',
                model: { openai: 'gpt-test-int', gemini: 'gemini-test-int', ollama: 'ollama-test-int' },
                apiKey: { openai: 'testkey_integration_suite' },
                ollamaBaseUrl: 'http://localhost:11434/integration',
            },
            logging: { level: 'error' },
            session: { storagePath: TEST_SESSION_STORAGE_PATH },
            ontology: { storagePath: TEST_ONTOLOGY_STORAGE_PATH },
            debugMode: false,
        }),
    };
});

// 3. Mock Logger (dependency for SessionManager and mcr.js)
// const actualLoggerModule = jest.requireActual('../src/logger'); // Not needed if fully mocking
jest.mock('../src/logger', () => ({
    logger: {
        info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
        http: jest.fn(), verbose: jest.fn(), silly: jest.fn(), fatal: jest.fn(),
    },
    initializeLoggerContext: jest.fn((req, res, next) => {
        if (req) req.correlationId = req.correlationId || 'test-correlation-id-api-integration';
        if (next) next();
    }),
    asyncLocalStorage: {
        run: jest.fn((context, callback) => { if (callback) callback(); }),
        getStore: jest.fn(() => ({ correlationId: 'mock-als-id-api-integration' })),
    },
}));

// 4. Mock LlmService (dependency for mcr.js through apiHandlers)
jest.mock('../src/llmService', () => ({
    init: jest.fn(),
    nlToRulesAsync: jest.fn().mockResolvedValue(['mock_rule(integration_test).']), // Used by assert and nl-to-rules
    queryToPrologAsync: jest.fn().mockResolvedValue('mock_query_integration(Y).'), // Used by query
    resultToNlAsync: jest.fn().mockImplementation((_query, logicResultJsonString, _style) => {
        if (logicResultJsonString === JSON.stringify('No solution found.')) {
            return Promise.resolve('No, there is no solution for integration test.');
        }
        return Promise.resolve(`Yes, the mock integration answer is based on: ${logicResultJsonString}`);
    }),
    rulesToNlAsync: jest.fn().mockResolvedValue('Mock integration natural language explanation of rules.'),
    explainQueryAsync: jest.fn().mockResolvedValue('Mock integration explanation for the query.'),
    getPromptTemplates: jest.fn().mockReturnValue({ INTEGRATION_TEMPLATE: 'mock integration template' }), // Used by /prompts
}));

// 5. Mock package.json for the GET / endpoint
jest.mock('../package.json', () => ({
  name: 'mcr-integration-test-app',
  version: '1.0.0-integration-test',
  description: 'Integration Test App Description',
}));


// --- Now, require the application and other modules ---
// The order of requires matters if they have side effects or inter-dependencies affected by mocks.
// mcr.js (app) should be required after its core dependencies (config, logger, LlmService) are mocked.
const { app } = require('../mcr');
// ConfigManager and SessionManager will pick up the mocked config/logger when they are imported by mcr.js or directly.
// No need to require them separately here unless you need to access their mocked static methods directly.
const SessionManager = require('../src/sessionManager');


describe('MCR API Integration Tests (with Supertest)', () => {
  let sessionId = null;
  const familyOntologyPath = path.resolve(__dirname, '../ontologies/family.pl');
  let familyOntologyContent = null;

  // Test storage paths are now defined by the ConfigManager mock.

  beforeAll(() => {
    // Clean up and create test directories based on paths from ConfigManager mock
    for (const p of [TEST_SESSION_STORAGE_PATH, TEST_ONTOLOGY_STORAGE_PATH]) {
      if (fs.existsSync(p)) {
        fs.rmSync(p, { recursive: true, force: true });
      }
      fs.mkdirSync(p, { recursive: true });
    }

    // SessionManager is initialized when mcr.js is loaded, using the mocked config.
    // If a re-initialization with different paths were needed, it would be complex
    // due to module caching. The current approach (mock config before app load) is better.

    if (fs.existsSync(familyOntologyPath)) {
      familyOntologyContent = fs.readFileSync(familyOntologyPath, 'utf8');
    }
  });

  afterAll(() => {
    // Clean up test directories
    for (const p of [TEST_SESSION_STORAGE_PATH, TEST_ONTOLOGY_STORAGE_PATH]) {
      if (fs.existsSync(p)) {
        fs.rmSync(p, { recursive: true, force: true });
      }
    }
  });

  beforeEach(async () => {
    const createSessionResponse = await request(app).post('/sessions');
    // Expectations moved to 'should create a new session and retrieve it'
    if (
      createSessionResponse.status === 201 &&
      createSessionResponse.body.sessionId
    ) {
      sessionId = createSessionResponse.body.sessionId;
    } else {
      // Throw an error to fail tests if session creation fails in beforeEach
      throw new Error(
        `Failed to create session in beforeEach: Status ${createSessionResponse.status}, Body: ${JSON.stringify(createSessionResponse.body)}`
      );
    }
  });

  afterEach(async () => {
    if (sessionId) {
      try {
        await request(app).delete(`/sessions/${sessionId}`);
      } catch (error) {
        logger.error(
          // Replaced console.error with logger.error
          `Integration Test: Failed to delete session ${sessionId} during cleanup:`,
          { errorMessage: error.message }
        );
      }
    }
  });

  test('GET / should return API status from mocked package.json', async () => {
    const response = await request(app).get('/');
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
    expect(response.body.name).toBe('mcr-integration-test-app');
    expect(response.body.version).toBe('1.0.0-integration-test');
    expect(response.body.description).toBe('Integration Test App Description');
  });

  test('should create a new session, retrieve it, and then delete it', async () => {
    // Create a new session specifically for this test
    const createResponse = await request(app).post('/sessions');
    expect(createResponse.status).toBe(201);
    const newSessionId = createResponse.body.sessionId;
    expect(newSessionId).toBeDefined();

    // Retrieve it
    const getResponse = await request(app).get(`/sessions/${newSessionId}`);
    expect(getResponse.status).toBe(200);
    expect(getResponse.body.sessionId).toBe(newSessionId);

    // Delete it
    const deleteResponse = await request(app).delete(
      `/sessions/${newSessionId}`
    );
    expect(deleteResponse.status).toBe(200);
    expect(deleteResponse.body.message).toBe(
      `Session ${newSessionId} terminated.`
    );

    // Try to retrieve it again (should fail)
    const getAfterDeleteResponse = await request(app).get(
      `/sessions/${newSessionId}`
    );
    expect(getAfterDeleteResponse.status).toBe(404);
    expect(getAfterDeleteResponse.body.error).toBeDefined();
    expect(getAfterDeleteResponse.body.error.type).toBe('ApiError');
    expect(getAfterDeleteResponse.body.error.message).toBe(`Session with ID '${newSessionId}' not found.`);
    // No specific errorCode is set by SessionManager.get for "not found"
    expect(getAfterDeleteResponse.body.error.code).toBeUndefined();
  });

  test('should create a new session and retrieve it', async () => {
    // Verify session creation from beforeEach
    expect(sessionId).toBeDefined();
    const createSessionResponse = await request(app)
      .post('/sessions')
      .redirects(0); // Make a new one for this test to check status
    expect(createSessionResponse.status).toBe(201);
    const newTestSessionId = createSessionResponse.body.sessionId;
    expect(newTestSessionId).toBeDefined();

    const getSessionResponse = await request(app).get(
      `/sessions/${newTestSessionId}`
    );
    expect(getSessionResponse.status).toBe(200);
    expect(getSessionResponse.body.sessionId).toBe(newTestSessionId);
    expect(getSessionResponse.body.facts).toEqual([]);
    expect(getSessionResponse.body.factCount).toBe(0);
  });

  describe('Session Assertions and Queries', () => {
    test('should assert a fact into the session', async () => {
      const factText = 'John is a parent of Mary.';
      const assertResponse = await request(app)
        .post(`/sessions/${sessionId}/assert`)
        .send({ text: factText });

      expect(assertResponse.status).toBe(200);
      expect(assertResponse.body.addedFacts).toEqual(['mock_rule(integration_test).']); // Aligned with mock
      expect(typeof assertResponse.body.totalFactsInSession).toBe('number');
      expect(assertResponse.body.totalFactsInSession).toBeGreaterThanOrEqual(1);

      const getSessionResponse = await request(app).get(`/sessions/${sessionId}`);
      expect(getSessionResponse.status).toBe(200);
      expect(getSessionResponse.body.facts).toContain('mock_rule(integration_test).');
    });

    test('should return 400 if asserting with empty text', async () => {
      const assertResponse = await request(app)
        .post(`/sessions/${sessionId}/assert`)
        .send({ text: '' }); // Empty text

      expect(assertResponse.status).toBe(400);
      expect(assertResponse.body.error).toBeDefined();
      expect(assertResponse.body.error.type).toBe('ApiError');
      expect(assertResponse.body.error.message).toContain("Missing or invalid required field 'text'");
      expect(assertResponse.body.error.code).toBe('ASSERT_INVALID_TEXT');
    });

    test('should query a fact from the session', async () => {
    await request(app)
      .post(`/sessions/${sessionId}/assert`)
      .send({ text: 'Some fact that leads to mock_rule(a).' });

    const queryQuestion = 'What is the mock query for X?';
    const queryResponse = await request(app)
      .post(`/sessions/${sessionId}/query`)
      .send({ query: queryQuestion });

    expect(queryResponse.status).toBe(200);
    expect(queryResponse.body.queryProlog).toBe('mock_query_integration(Y).'); // Aligned with mock
    expect(queryResponse.body.answer).toBeDefined();
  });

  test('should handle dynamic ontology loading and query (if family.pl exists)', async () => {
    if (!familyOntologyContent) {
      console.warn(
        // Log a warning that the test is being skipped
        'Skipping main assertions for dynamic ontology test as family.pl was not found or is empty.'
      );
      // Assert that the condition for skipping is indeed what we expect
      expect(familyOntologyContent).toBeFalsy();
      return;
    }
    await request(app)
      .post(`/sessions/${sessionId}/assert`)
      .send({ text: 'parent(john, mary).' });

    const dynamicQueryQuestion = 'Is Mary a child of John?';
    const dynamicQueryResponse = await request(app)
      .post(`/sessions/${sessionId}/query`)
      .send({
        query: dynamicQueryQuestion,
        ontology: familyOntologyContent,
      });

    expect(dynamicQueryResponse.status).toBe(200);
    expect(dynamicQueryResponse.body.queryProlog).toBe('mock_query_integration(Y).'); // Aligned with mock
    expect(dynamicQueryResponse.body.answer).toBeDefined();
  });

  test('should translate natural language to rules (mocked)', async () => {
    const text = 'Birds can fly. Penguins are birds but cannot fly.';
    const response = await request(app)
      .post('/translate/nl-to-rules')
      .send({ text });

    expect(response.status).toBe(200);
    expect(response.body.rules).toEqual(['mock_rule(integration_test).']); // Aligned with mock
  });

  test('should translate rules to natural language (mocked)', async () => {
    const rules = [
      'parent(X, Y) :- father(X, Y).',
      'parent(X, Y) :- mother(X, Y).',
    ];
    const response = await request(app)
      .post('/translate/rules-to-nl')
      .send({ rules, style: 'formal' });

    expect(response.status).toBe(200);
    expect(response.body.text).toBe(
      'Mock natural language explanation of rules.'
    );
  });

  test('should get prompts (mocked)', async () => {
    const response = await request(app).get('/prompts');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ INTEGRATION_TEMPLATE: 'mock integration template' }); // Aligned with mock
  });

  test('should explain query (mocked)', async () => {
    const response = await request(app)
      .post(`/sessions/${sessionId}/explain-query`)
      .send({ query: 'Why is X true?' });
    expect(response.status).toBe(200);
    expect(response.body.explanation).toBe('Mock explanation for the query.');
  });

  // --- Ontology Management Tests ---
  describe('Ontology Management', () => {
    const ontologyName = 'test_ontology';
    const ontologyRules =
      'rule1(a).\nrule2(X) :- condition(X).\n:- directive(test).';
    const updatedOntologyRules = 'rule3(b).\nrule4(Y) :- other_condition(Y).';

    test('should create a new ontology', async () => {
      const response = await request(app)
        .post('/ontologies')
        .send({ name: ontologyName, rules: ontologyRules });
      expect(response.status).toBe(201);
      expect(response.body.name).toBe(ontologyName);
      expect(response.body.rules).toBe(ontologyRules);
    });

    test('should get the created ontology', async () => {
      // Ensure ontology is created first (or rely on previous test in sequence)
      await request(app)
        .post('/ontologies')
        .send({ name: ontologyName, rules: ontologyRules });

      const response = await request(app).get(`/ontologies/${ontologyName}`);
      expect(response.status).toBe(200);
      expect(response.body.name).toBe(ontologyName);
      expect(response.body.rules).toBe(ontologyRules);
    });

    test('should list all ontologies and find the created one', async () => {
      await request(app)
        .post('/ontologies')
        .send({ name: `${ontologyName}_2`, rules: 'another(rule).' });

      const response = await request(app).get('/ontologies');
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      const found = response.body.find((o) => o.name === ontologyName);
      expect(found).toBeDefined();
      if (found) {
        expect(found.rules).toBe(ontologyRules);
      }
      const found2 = response.body.find((o) => o.name === `${ontologyName}_2`);
      expect(found2).toBeDefined();
    });

    test('should update an existing ontology', async () => {
      await request(app)
        .post('/ontologies')
        .send({ name: ontologyName, rules: ontologyRules }); // Ensure it exists

      const response = await request(app)
        .put(`/ontologies/${ontologyName}`)
        .send({ rules: updatedOntologyRules });
      expect(response.status).toBe(200);
      expect(response.body.name).toBe(ontologyName);
      expect(response.body.rules).toBe(updatedOntologyRules);

      // Verify update
      const getResponse = await request(app).get(`/ontologies/${ontologyName}`);
      expect(getResponse.body.rules).toBe(updatedOntologyRules);
    });

    test('should delete an ontology', async () => {
      await request(app)
        .post('/ontologies')
        .send({ name: ontologyName, rules: ontologyRules }); // Ensure it exists

      const deleteResponse = await request(app).delete(
        `/ontologies/${ontologyName}`
      );
      expect(deleteResponse.status).toBe(200);
      expect(deleteResponse.body.message).toBe(
        `Ontology ${ontologyName} deleted.`
      );

      // Verify deletion
      const getResponse = await request(app).get(`/ontologies/${ontologyName}`);
      expect(getResponse.status).toBe(404);
    });

    test('should return 404 when trying to get a non-existent ontology', async () => {
      const response = await request(app).get(
        '/ontologies/non_existent_ontology'
      );
      expect(response.status).toBe(404);
    });

    test('should return 404 when trying to update a non-existent ontology', async () => {
      const response = await request(app)
        .put('/ontologies/non_existent_ontology_update')
        .send({ rules: 'rule(x).' });
      expect(response.status).toBe(404);
    });

    test('should return 404 when trying to delete a non-existent ontology', async () => {
      const response = await request(app).delete(
        '/ontologies/non_existent_ontology_delete'
      );
      expect(response.status).toBe(404);
    });
  });

  // --- Debugging Endpoints ---
  describe('Debugging Endpoints', () => {
    test('POST /debug/format-prompt should format a known prompt', async () => {
      // Assuming 'NL_TO_RULES' is a valid templateName and it uses 'text' variable
      // This test relies on the mock implementation of getPromptTemplates from llmService mock
      // or actual prompts if llmService is not mocked for this specific part.
      // For this integration test, we assume prompts.js is loaded and contains NL_TO_RULES.
      const Prompts = require('../src/prompts'); // Load actual prompts

      const response = await request(app)
        .post('/debug/format-prompt')
        .send({
          templateName: 'NL_TO_RULES',
          inputVariables: { existing_facts: "", ontology_context: "", text_to_translate: "test input" },
        });
      expect(response.status).toBe(200);
      expect(response.body.templateName).toBe('NL_TO_RULES');
      expect(response.body.rawTemplate).toBe(Prompts.NL_TO_RULES);
      expect(response.body.inputVariables).toEqual({ existing_facts: "", ontology_context: "", text_to_translate: "test input" });
      expect(response.body.formattedPrompt).toContain('test input');
      expect(response.body.formattedPrompt).toContain('Existing facts:\n\n');
      expect(response.body.formattedPrompt).toContain('Ontology context:\n\n');
    });

    test('POST /debug/format-prompt should return 404 for non-existent template name', async () => {
      const templateName = 'NON_EXISTENT_TEMPLATE_DEBUG';
      const response = await request(app)
        .post('/debug/format-prompt')
        .send({
          templateName: templateName,
          inputVariables: { text: 'test input' },
        });
      expect(response.status).toBe(404); // Status code should be 404
      expect(response.body.error).toBeDefined();
      expect(response.body.error.type).toBe('ApiError');
      expect(response.body.error.message).toBe(`Prompt template with name '${templateName}' not found.`);
      expect(response.body.error.code).toBe('DEBUG_FORMAT_PROMPT_TEMPLATE_NOT_FOUND');
    });
  });
});
