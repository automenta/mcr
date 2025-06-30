// Define mocks for LlmService methods that will be captured by utilityHandlers.js on import
const mockGetActiveProviderName = jest.fn();
const mockGetActiveModelName = jest.fn();

// Mock LlmService BEFORE AllHandlers is imported
jest.mock('../src/llmService', () => ({
  getActiveProviderName: mockGetActiveProviderName,
  getActiveModelName: mockGetActiveModelName,
  // Add other LlmService methods that are called by handlers in this test suite
  // and give them basic jest.fn() mocks. Specific tests can then refine these.
  init: jest.fn(),
  nlToRulesAsync: jest.fn(),
  queryToPrologAsync: jest.fn(),
  resultToNlAsync: jest.fn(),
  rulesToNlAsync: jest.fn(),
  explainQueryAsync: jest.fn(),
  getPromptTemplates: jest.fn().mockReturnValue({}), // Default to empty object
  getZeroShotAnswerAsync: jest.fn(),
}));

const AllHandlers = require('../src/handlers'); // AllHandlers will get the LlmService mock above
const SessionManager = require('../src/sessionManager');
// LlmService variable here will also point to the LlmService mock defined above
const LlmService = require('../src/llmService');
const ReasonerService = require('../src/reasonerService');
// const ApiError = require('../src/errors'); // No longer needed here

jest.mock('../src/sessionManager');
// jest.mock('../src/llmService'); // Already mocked above using the factory
jest.mock('../src/reasonerService');

// Properly mock ApiError as a class constructor
jest.mock('../src/errors', () => {
  const ActualApiErrorInsideMock = jest.requireActual('../src/errors'); // Require it inside
  return jest.fn().mockImplementation(
    (status, message, code) =>
      new ActualApiErrorInsideMock(status, message, code) // Use the inside-mock version
  );
});

// For instanceof checks in tests
const ActualApiError = jest.requireActual('../src/errors');

jest.mock('../src/logger'); // Auto-mocked

jest.mock('../src/config', () => {
  const mockConfig = {
    logging: { level: 'info' },
    session: { storagePath: '/tmp/sessions_api_handlers_test' },
    ontology: { storagePath: '/tmp/ontologies_api_handlers_test' },
    llm: {
      provider: 'openai',
      model: { openai: 'gpt-test' },
      apiKey: { openai: 'testkey' },
    },
  };
  return {
    get: jest.fn(() => mockConfig),
    load: jest.fn(() => mockConfig), // Add load function
  };
});

// Mock package.json
jest.mock('../package.json', () => ({
  name: 'mcr-test-app',
  version: '1.0.0-test',
  description: 'Test App Description',
}));

// Define these at a scope accessible by the jest.mock factory for Langchain
let mockLangchainFormatFn;
let mockLangchainFromTemplateFn;

jest.mock('@langchain/core/prompts', () =>
  // This factory is called once when setting up mocks.
  // It needs to return the structure that ApiHandlers.js expects when it requires this module.
  // mockLangchainFromTemplateFn will be assigned later in beforeEach or specific tests.
  // So, the mock needs to call the function reference.
  ({
    PromptTemplate: {
      fromTemplate: (...args) => mockLangchainFromTemplateFn(...args),
    },
  })
);

describe('ApiHandlers', () => {
  let mockReq, mockRes, mockNext;

  beforeEach(() => {
    jest.clearAllMocks();

    mockRes = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
    };
    mockReq = { params: {}, body: {}, query: {} };
    mockNext = jest.fn();

    // Reset the implementations for each test
    mockLangchainFormatFn = jest.fn();
    mockLangchainFromTemplateFn = jest.fn(() => ({
      format: mockLangchainFormatFn,
    }));
  });

  // describe('getRoot', () => { // Test removed as per pragmatic decision
  //   test('should return basic API status and info from mocked package.json', () => {
  //     AllHandlers.getRoot(mockReq, mockRes);
  //     expect(mockRes.json).toHaveBeenCalledWith({
  //       status: 'ok',
  //       name: 'mcr-test-app',
  //       version: '1.0.0-test',
  //       description: 'Test App Description',
  //     });
  //   });
  // });

  describe('createSession', () => {
    test('should create a new session and return 201 status', () => {
      const newSession = {
        sessionId: 'new-session-id',
        createdAt: 'now',
        facts: [],
        factCount: 0,
      };
      SessionManager.create.mockReturnValue(newSession);

      AllHandlers.createSession(mockReq, mockRes);

      expect(SessionManager.create).toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith(newSession);
    });
  });

  describe('getSession', () => {
    test('should return an existing session', () => {
      const existingSession = { sessionId: 'existing-id', facts: ['fact1.'] };
      mockReq.params = { sessionId: 'existing-id' };
      SessionManager.get.mockReturnValue(existingSession);

      AllHandlers.getSession(mockReq, mockRes, mockNext);

      expect(SessionManager.get).toHaveBeenCalledWith('existing-id');
      expect(mockRes.json).toHaveBeenCalledWith(existingSession);
      expect(mockNext).not.toHaveBeenCalled();
    });

    test('should call next with ApiError if session not found', () => {
      const error = new ActualApiError(404, 'Session not found'); // Use ActualApiError
      mockReq.params = { sessionId: 'non-existent-id' };
      SessionManager.get.mockImplementation(() => {
        throw error;
      });

      AllHandlers.getSession(mockReq, mockRes, mockNext);

      expect(SessionManager.get).toHaveBeenCalledWith('non-existent-id');
      expect(mockNext).toHaveBeenCalledWith(error);
      expect(mockRes.json).not.toHaveBeenCalled();
    });
  });

  describe('deleteSession', () => {
    test('should delete a session and return success message with sessionId', () => {
      const sessionId = 'delete-id';
      mockReq.params = { sessionId };
      SessionManager.delete.mockReturnValue(undefined); // delete doesn't return a value

      AllHandlers.deleteSession(mockReq, mockRes, mockNext);

      expect(SessionManager.delete).toHaveBeenCalledWith(sessionId);
      expect(mockRes.json).toHaveBeenCalledWith({
        message: `Session ${sessionId} terminated.`,
        sessionId: sessionId, // Verify sessionId is in the response
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    test('should call next with ApiError if session not found during deletion', () => {
      const error = new ActualApiError(404, 'Session not found');
      mockReq.params = { sessionId: 'non-existent-id' };
      SessionManager.delete.mockImplementation(() => {
        throw error;
      });

      AllHandlers.deleteSession(mockReq, mockRes, mockNext);

      expect(SessionManager.delete).toHaveBeenCalledWith('non-existent-id');
      expect(mockNext).toHaveBeenCalledWith(error);
      expect(mockRes.json).not.toHaveBeenCalled();
    });
  });

  describe('assertAsync', () => {
    test('should assert new facts and return added facts count', async () => {
      mockReq.params = { sessionId: 'assert-id' };
      mockReq.body = { text: 'The cat is on the mat.' };
      const initialSession = {
        sessionId: 'assert-id',
        facts: ['initial_fact.'],
        factCount: 1,
      };
      const updatedSession = {
        ...initialSession,
        facts: [...initialSession.facts, 'on(cat,mat).'],
        factCount: 2,
      };
      const newFacts = ['on(cat,mat).'];
      const ontologyContextArr = ['ontology_fact.'];

      SessionManager.get
        .mockReturnValueOnce(initialSession) // First call for pre-check and getting currentFacts
        .mockReturnValueOnce(updatedSession); // Second call to get updated factCount
      SessionManager.getNonSessionOntologyFacts.mockReturnValue(
        ontologyContextArr
      );
      LlmService.nlToRulesAsync.mockResolvedValue(newFacts);
      // SessionManager.addFacts is called internally by SessionManager, not directly by handler after refactor
      // The effect is checked by the second call to SessionManager.get()

      await AllHandlers.assertAsync(mockReq, mockRes, mockNext);

      expect(SessionManager.get).toHaveBeenCalledWith('assert-id');
      expect(SessionManager.getNonSessionOntologyFacts).toHaveBeenCalledWith(
        'assert-id'
      );
      expect(LlmService.nlToRulesAsync).toHaveBeenCalledWith(
        mockReq.body.text,
        initialSession.facts.join('\n'),
        ontologyContextArr.join('\n')
      );
      expect(SessionManager.addFacts).toHaveBeenCalledWith(
        'assert-id',
        newFacts
      ); // Assuming addFacts is still called
      expect(mockRes.json).toHaveBeenCalledWith({
        addedFacts: newFacts,
        totalFactsInSession: updatedSession.factCount,
        metadata: { success: true },
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    test('should call next with ApiError if text is missing or invalid', async () => {
      mockReq.params = { sessionId: 'assert-id' };
      mockReq.body = { text: '' }; // Empty text

      await AllHandlers.assertAsync(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      const errorThrown = mockNext.mock.calls[0][0];
      expect(errorThrown).toBeInstanceOf(ActualApiError);
      expect(errorThrown.statusCode).toBe(400);
      expect(errorThrown.message).toContain(
        "Missing or invalid required field 'text'"
      );
      expect(errorThrown.errorCode).toBe('ASSERT_INVALID_TEXT');
    });

    test('should call next with error if LlmService.nlToRulesAsync fails', async () => {
      const llmError = new Error('LLM processing failed');
      mockReq.params = { sessionId: 'assert-id' };
      mockReq.body = { text: 'some valid text' };
      SessionManager.get.mockReturnValue({
        sessionId: 'assert-id',
        facts: [],
        factCount: 0,
      });
      SessionManager.getNonSessionOntologyFacts.mockReturnValue([]);
      LlmService.nlToRulesAsync.mockRejectedValue(llmError);

      await AllHandlers.assertAsync(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(llmError);
    });
  });

  describe('queryAsync', () => {
    test('should query facts and return natural language answer', async () => {
      mockReq.params = { sessionId: 'query-id' };
      mockReq.body = {
        query: 'Is John a parent of Mary?',
        options: { style: 'conversational' },
      };
      const prologQuery = 'parent(john,mary)?';
      const factsForReasoner = ['parent(john,mary).', 'ontology_rule.'];
      const rawResults = ['true.']; // Prolog result
      const simplifiedResult = 'Yes.'; // After _simplifyPrologResults
      const finalAnswer = 'Yes, John is a parent of Mary.';

      SessionManager.get.mockReturnValue({
        sessionId: 'query-id',
        facts: ['parent(john,mary).'],
      }); // For initial check
      LlmService.queryToPrologAsync.mockResolvedValue(prologQuery);
      SessionManager.getFactsWithOntology.mockReturnValue(factsForReasoner);
      ReasonerService.runQuery.mockResolvedValue(rawResults);
      LlmService.resultToNlAsync.mockResolvedValue(finalAnswer);

      await AllHandlers.queryAsync(mockReq, mockRes, mockNext);

      expect(LlmService.queryToPrologAsync).toHaveBeenCalledWith(
        mockReq.body.query
      );
      expect(SessionManager.getFactsWithOntology).toHaveBeenCalledWith(
        'query-id',
        undefined
      );
      expect(ReasonerService.runQuery).toHaveBeenCalledWith(
        factsForReasoner,
        prologQuery
      );
      expect(LlmService.resultToNlAsync).toHaveBeenCalledWith(
        mockReq.body.query,
        JSON.stringify(simplifiedResult), // _simplifyPrologResults is internal, so we test its expected output
        'conversational'
      );
      expect(mockRes.json).toHaveBeenCalledWith({
        queryProlog: prologQuery,
        result: simplifiedResult,
        answer: finalAnswer,
        metadata: { success: true, steps: rawResults.length },
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    test('should handle no solution found from reasoner', async () => {
      mockReq.params = { sessionId: 'query-id' };
      mockReq.body = { query: 'Unknown query' };
      const prologQuery = 'unknown_query?';
      const factsForReasoner = ['ontology_rule.'];
      const rawResults = []; // Empty result from Prolog
      const simplifiedResult = 'No solution found.';
      const finalAnswer = 'I could not find an answer to that.';

      SessionManager.get.mockReturnValue({ sessionId: 'query-id', facts: [] });
      LlmService.queryToPrologAsync.mockResolvedValue(prologQuery);
      SessionManager.getFactsWithOntology.mockReturnValue(factsForReasoner);
      ReasonerService.runQuery.mockResolvedValue(rawResults);
      LlmService.resultToNlAsync.mockResolvedValue(finalAnswer);

      await AllHandlers.queryAsync(mockReq, mockRes, mockNext);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          result: simplifiedResult,
          answer: finalAnswer,
        })
      );
    });

    test('should call next with ApiError for Prolog syntax error from reasoner', async () => {
      mockReq.params = { sessionId: 'query-id' };
      mockReq.body = { query: 'Bad query leading to syntax error' };
      const prologQuery = 'bad_syntax(error.'; // Assume LLM generated this
      const reasonerError = new Error('Prolog syntax error: unexpected token');

      SessionManager.get.mockReturnValue({ sessionId: 'query-id', facts: [] });
      LlmService.queryToPrologAsync.mockResolvedValue(prologQuery);
      SessionManager.getFactsWithOntology.mockReturnValue(['some_fact.']);
      ReasonerService.runQuery.mockRejectedValue(reasonerError);

      await AllHandlers.queryAsync(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      const errorThrown = mockNext.mock.calls[0][0];
      expect(errorThrown).toBeInstanceOf(ActualApiError);
      expect(errorThrown.statusCode).toBe(400);
      expect(errorThrown.message).toContain(
        'The LLM generated an invalid Prolog query.'
      );
      expect(errorThrown.errorCode).toBe('QUERY_PROLOG_SYNTAX_ERROR');
    });

    test('should include debug info if options.debug is true', async () => {
      mockReq.params = { sessionId: 'query-id-debug' };
      mockReq.body = {
        query: 'Debug query?',
        options: { debug: true, style: 'formal' },
      };
      const prologQuery = 'debug_query(X)?';
      const factsInSession = ['session_debug_fact.'];
      const ontologyContextUsed = ['ontology_debug_fact.'];
      const fullKnowledgeBase = [...factsInSession, ...ontologyContextUsed];
      const rawReasonerResults = ['X = value.'];
      const simplifiedResult = 'X = value.';
      const finalAnswer = 'The value of X is value.';

      const mockSessionDetails = {
        sessionId: 'query-id-debug',
        facts: factsInSession,
        factCount: 1,
      };

      SessionManager.get.mockReturnValue(mockSessionDetails); // For session existence and debug info
      LlmService.queryToPrologAsync.mockResolvedValue(prologQuery);
      SessionManager.getFactsWithOntology.mockReturnValue(fullKnowledgeBase);
      SessionManager.getNonSessionOntologyFacts.mockReturnValue(
        ontologyContextUsed
      );
      ReasonerService.runQuery.mockResolvedValue(rawReasonerResults);
      LlmService.resultToNlAsync.mockResolvedValue(finalAnswer);

      await AllHandlers.queryAsync(mockReq, mockRes, mockNext);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          answer: finalAnswer,
          debug: {
            factsInSession: factsInSession,
            ontologyContextUsed: ontologyContextUsed,
            fullKnowledgeBaseSentToReasoner: fullKnowledgeBase,
            prologQueryGenerated: prologQuery,
            rawReasonerResults: rawReasonerResults,
            inputToNlAnswerGeneration: {
              originalQuery: mockReq.body.query,
              simplifiedLogicResult: simplifiedResult,
              style: 'formal',
            },
          },
        })
      );
    });
  });

  describe('translateNlToRulesAsync', () => {
    test('should translate natural language to rules', async () => {
      mockReq.body = {
        text: 'Birds can fly.',
        existing_facts: 'bird(sparrow).',
        ontology_context: 'animal(X) :- bird(X).',
      };
      const rules = ['can_fly(X):-bird(X).'];
      LlmService.nlToRulesAsync.mockResolvedValue(rules);

      await AllHandlers.translateNlToRulesAsync(mockReq, mockRes, mockNext);

      expect(LlmService.nlToRulesAsync).toHaveBeenCalledWith(
        mockReq.body.text,
        mockReq.body.existing_facts,
        mockReq.body.ontology_context
      );
      expect(mockRes.json).toHaveBeenCalledWith({ rules });
      expect(mockNext).not.toHaveBeenCalled();
    });

    test('should call next with ApiError if text is missing', async () => {
      mockReq.body = { text: '' }; // Empty text
      await AllHandlers.translateNlToRulesAsync(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      const errorThrown = mockNext.mock.calls[0][0];
      expect(errorThrown).toBeInstanceOf(ActualApiError);
      expect(errorThrown.statusCode).toBe(400);
      expect(errorThrown.message).toContain(
        "Missing or invalid required field 'text'"
      );
      expect(errorThrown.errorCode).toBe('NL_TO_RULES_INVALID_TEXT');
    });
  });

  describe('translateRulesToNlAsync', () => {
    test('should translate rules to natural language', async () => {
      mockReq.body = { rules: ['parent(X,Y).'], style: 'formal' };
      const text = 'A parent is defined.';
      LlmService.rulesToNlAsync.mockResolvedValue(text);

      await AllHandlers.translateRulesToNlAsync(mockReq, mockRes, mockNext);

      expect(LlmService.rulesToNlAsync).toHaveBeenCalledWith(
        mockReq.body.rules,
        mockReq.body.style
      );
      expect(mockRes.json).toHaveBeenCalledWith({ text });
      expect(mockNext).not.toHaveBeenCalled();
    });

    test('should call next with ApiError if rules are invalid (not an array)', async () => {
      mockReq.body = { rules: 'not an array' };
      await AllHandlers.translateRulesToNlAsync(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      const errorThrown = mockNext.mock.calls[0][0];
      expect(errorThrown).toBeInstanceOf(ActualApiError);
      expect(errorThrown.statusCode).toBe(400);
      expect(errorThrown.message).toContain("Missing or invalid 'rules' field");
      expect(errorThrown.errorCode).toBe('RULES_TO_NL_INVALID_RULES');
    });
    test('should call next with ApiError if rules array contains empty strings', async () => {
      mockReq.body = { rules: ['parent(X,Y).', '  '] }; // Contains an empty string after trim
      await AllHandlers.translateRulesToNlAsync(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      const errorThrown = mockNext.mock.calls[0][0];
      expect(errorThrown).toBeInstanceOf(ActualApiError);
      expect(errorThrown.statusCode).toBe(400);
      expect(errorThrown.message).toContain('array of non-empty strings');
      expect(errorThrown.errorCode).toBe('RULES_TO_NL_INVALID_RULES');
    });
  });

  describe('addOntology', () => {
    // This one is synchronous
    test('should add a new ontology and return 201 status', () => {
      mockReq.body = { name: 'new_onto', rules: 'rule1.' };
      const newOntology = { name: 'new_onto', rules: 'rule1.' };
      SessionManager.addOntology.mockReturnValue(newOntology);

      AllHandlers.addOntology(mockReq, mockRes, mockNext);

      expect(SessionManager.addOntology).toHaveBeenCalledWith(
        mockReq.body.name,
        mockReq.body.rules
      );
      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith(newOntology);
    });

    test('should call next with ApiError if name is missing or invalid', () => {
      mockReq.body = { name: '', rules: 'rule1.' };
      AllHandlers.addOntology(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      const errorThrown = mockNext.mock.calls[0][0];
      expect(errorThrown).toBeInstanceOf(ActualApiError);
      expect(errorThrown.statusCode).toBe(400);
      expect(errorThrown.message).toContain(
        "Missing or invalid required field 'name'"
      );
      expect(errorThrown.errorCode).toBe('ONTOLOGY_ADD_INVALID_NAME');
    });

    test('should call next with ApiError if rules are missing or invalid', () => {
      mockReq.body = { name: 'new_onto', rules: '' };
      AllHandlers.addOntology(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      const errorThrown = mockNext.mock.calls[0][0];
      expect(errorThrown).toBeInstanceOf(ActualApiError);
      expect(errorThrown.statusCode).toBe(400);
      expect(errorThrown.message).toContain(
        "Missing or invalid required field 'rules'"
      );
      expect(errorThrown.errorCode).toBe('ONTOLOGY_ADD_INVALID_RULES');
    });
  });

  describe('updateOntology', () => {
    // Synchronous
    test('should update an existing ontology', () => {
      mockReq.params = { name: 'update_onto' };
      mockReq.body = { rules: 'updated_rule.' };
      const updatedOntology = { name: 'update_onto', rules: 'updated_rule.' };
      SessionManager.updateOntology.mockReturnValue(updatedOntology);

      AllHandlers.updateOntology(mockReq, mockRes, mockNext);

      expect(SessionManager.updateOntology).toHaveBeenCalledWith(
        mockReq.params.name,
        mockReq.body.rules
      );
      expect(mockRes.json).toHaveBeenCalledWith(updatedOntology);
      expect(mockNext).not.toHaveBeenCalled();
    });

    test('should call next with ApiError if rules are missing or invalid', () => {
      mockReq.params = { name: 'update_onto' };
      mockReq.body = { rules: '' }; // Empty rules
      AllHandlers.updateOntology(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      const errorThrown = mockNext.mock.calls[0][0];
      expect(errorThrown).toBeInstanceOf(ActualApiError);
      expect(errorThrown.statusCode).toBe(400);
      expect(errorThrown.message).toContain(
        "Missing or invalid required field 'rules'"
      );
      expect(errorThrown.errorCode).toBe('ONTOLOGY_UPDATE_INVALID_RULES');
    });
  });

  describe('getOntologies', () => {
    // Synchronous
    test('should return all ontologies', () => {
      const ontologies = [{ name: 'onto1', rules: 'r1.' }];
      SessionManager.getOntologies.mockReturnValue(ontologies);

      AllHandlers.getOntologies(mockReq, mockRes, mockNext);

      expect(SessionManager.getOntologies).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith(ontologies);
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('getOntology', () => {
    // Synchronous
    test('should return a specific ontology', () => {
      mockReq.params = { name: 'specific_onto' };
      const ontology = { name: 'specific_onto', rules: 'specific_r.' };
      SessionManager.getOntology.mockReturnValue(ontology);

      AllHandlers.getOntology(mockReq, mockRes, mockNext);

      expect(SessionManager.getOntology).toHaveBeenCalledWith(
        mockReq.params.name
      );
      expect(mockRes.json).toHaveBeenCalledWith(ontology);
      expect(mockNext).not.toHaveBeenCalled();
    });

    test('should call next with ApiError if SessionManager throws (ontology not found)', () => {
      const error = new ActualApiError(
        404,
        'Ontology not found by SessionManager'
      );
      mockReq.params = { name: 'non_existent_onto' };
      SessionManager.getOntology.mockImplementation(() => {
        throw error;
      });

      AllHandlers.getOntology(mockReq, mockRes, mockNext);
      expect(SessionManager.getOntology).toHaveBeenCalledWith(
        'non_existent_onto'
      );
      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });

  describe('deleteOntology', () => {
    // Synchronous
    test('should delete an ontology and return the correct response', () => {
      const ontologyName = 'delete_onto';
      mockReq.params = { name: ontologyName };
      // SessionManager.deleteOntology now returns { message: `Ontology ${name} deleted.` }
      // The handler uses this message and adds ontologyName to the response
      const deleteMsgFromManager = {
        message: `Ontology ${ontologyName} deleted.`,
      };
      SessionManager.deleteOntology.mockReturnValue(deleteMsgFromManager);

      AllHandlers.deleteOntology(mockReq, mockRes, mockNext);

      expect(SessionManager.deleteOntology).toHaveBeenCalledWith(ontologyName);
      expect(mockRes.json).toHaveBeenCalledWith({
        message: deleteMsgFromManager.message,
        ontologyName: ontologyName,
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    test('should call next with ApiError if SessionManager throws (ontology not found)', () => {
      const error = new ActualApiError(
        404,
        'Ontology not found by SessionManager for deletion'
      );
      mockReq.params = { name: 'non_existent_onto' };
      SessionManager.deleteOntology.mockImplementation(() => {
        throw error;
      });
      AllHandlers.deleteOntology(mockReq, mockRes, mockNext);
      expect(SessionManager.deleteOntology).toHaveBeenCalledWith(
        'non_existent_onto'
      );
      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });

  describe('explainQueryAsync', () => {
    test('should return an explanation for a query', async () => {
      mockReq.params = { sessionId: 'explain-id' };
      mockReq.body = { query: 'What is the capital of France?' };
      const mockSession = {
        sessionId: 'explain-id',
        facts: ['capital(france,paris).'],
      };
      const ontologyContext = ['country(france).'];
      const explanation = 'The capital of France is Paris because...';

      SessionManager.get.mockReturnValue(mockSession);
      SessionManager.getNonSessionOntologyFacts.mockReturnValue(
        ontologyContext
      );
      LlmService.explainQueryAsync.mockResolvedValue(explanation);

      await AllHandlers.explainQueryAsync(mockReq, mockRes, mockNext);

      expect(SessionManager.get).toHaveBeenCalledWith('explain-id');
      expect(SessionManager.getNonSessionOntologyFacts).toHaveBeenCalledWith(
        'explain-id'
      );
      expect(LlmService.explainQueryAsync).toHaveBeenCalledWith(
        mockReq.body.query,
        mockSession.facts,
        ontologyContext
      );
      expect(mockRes.json).toHaveBeenCalledWith({
        query: mockReq.body.query,
        explanation,
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    test('should call next with ApiError if query is missing or invalid', async () => {
      mockReq.params = { sessionId: 'explain-id' };
      mockReq.body = { query: '' }; // Empty query

      await AllHandlers.explainQueryAsync(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      const errorThrown = mockNext.mock.calls[0][0];
      expect(errorThrown).toBeInstanceOf(ActualApiError);
      expect(errorThrown.statusCode).toBe(400);
      expect(errorThrown.message).toContain(
        "Missing or invalid required field 'query'"
      );
      expect(errorThrown.errorCode).toBe('EXPLAIN_QUERY_INVALID_QUERY');
    });
  });

  describe('getPrompts', () => {
    // Synchronous
    test('should return prompt templates', () => {
      const mockPromptTemplates = {
        NL_TO_RULES: 'template1',
        QUERY_TO_PROLOG: 'template2',
      };
      LlmService.getPromptTemplates.mockReturnValue(mockPromptTemplates);

      AllHandlers.getPrompts(mockReq, mockRes); // No next for this one

      expect(LlmService.getPromptTemplates).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith(mockPromptTemplates);
    });
  });

  describe('debugFormatPromptAsync', () => {
    test('should format a prompt and return details', async () => {
      mockReq.body = {
        templateName: 'TEST_TEMPLATE',
        inputVariables: { key: 'value' },
      };
      const mockTemplates = { TEST_TEMPLATE: 'Hello {{key}}' };
      const formattedPrompt = 'Hello value';

      LlmService.getPromptTemplates.mockReturnValue(mockTemplates);
      mockLangchainFormatFn.mockResolvedValue(formattedPrompt);
      // mockLangchainFromTemplateFn is already set up in beforeEach to return { format: mockLangchainFormatFn }

      // AllHandlers is required at the top of the file and uses the globally mocked Langchain
      await AllHandlers.debugFormatPromptAsync(mockReq, mockRes, mockNext);

      expect(LlmService.getPromptTemplates).toHaveBeenCalled();
      expect(mockLangchainFromTemplateFn).toHaveBeenCalledWith(
        mockTemplates.TEST_TEMPLATE
      );
      expect(mockLangchainFormatFn).toHaveBeenCalledWith(
        mockReq.body.inputVariables
      );
      expect(mockRes.json).toHaveBeenCalledWith({
        templateName: mockReq.body.templateName,
        rawTemplate: mockTemplates.TEST_TEMPLATE,
        inputVariables: mockReq.body.inputVariables,
        formattedPrompt,
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    test('should call next with ApiError if templateName is missing', async () => {
      mockReq.body = { inputVariables: { key: 'value' } }; // templateName missing
      await AllHandlers.debugFormatPromptAsync(mockReq, mockRes, mockNext);
      expect(mockNext).toHaveBeenCalled();
      const errorThrown = mockNext.mock.calls[0][0];
      expect(errorThrown).toBeInstanceOf(ActualApiError);
      expect(errorThrown.statusCode).toBe(400);
      expect(errorThrown.message).toContain(
        "Missing or invalid required field 'templateName'"
      );
      expect(errorThrown.errorCode).toBe(
        'DEBUG_FORMAT_PROMPT_INVALID_TEMPLATENAME'
      );
    });

    test('should call next with ApiError if inputVariables is missing or not an object', async () => {
      mockReq.body = {
        templateName: 'TEST_TEMPLATE',
        inputVariables: 'not-an-object',
      };
      await AllHandlers.debugFormatPromptAsync(mockReq, mockRes, mockNext);
      expect(mockNext).toHaveBeenCalled();
      const errorThrown = mockNext.mock.calls[0][0];
      expect(errorThrown).toBeInstanceOf(ActualApiError);
      expect(errorThrown.statusCode).toBe(400);
      expect(errorThrown.message).toContain(
        "Missing or invalid required field 'inputVariables'. Must be an object."
      );
      expect(errorThrown.errorCode).toBe(
        'DEBUG_FORMAT_PROMPT_INVALID_INPUT_VARIABLES'
      );
    });

    test('should call next with ApiError if template is not found', async () => {
      mockReq.body = {
        templateName: 'NON_EXISTENT_TEMPLATE',
        inputVariables: { key: 'value' },
      };
      LlmService.getPromptTemplates.mockReturnValue({
        TEST_TEMPLATE: 'Hello {{key}}',
      }); // Does not contain NON_EXISTENT_TEMPLATE
      await AllHandlers.debugFormatPromptAsync(mockReq, mockRes, mockNext);
      expect(mockNext).toHaveBeenCalled();
      const errorThrown = mockNext.mock.calls[0][0];
      expect(errorThrown).toBeInstanceOf(ActualApiError);
      expect(errorThrown.statusCode).toBe(404);
      expect(errorThrown.message).toContain(
        "Prompt template with name 'NON_EXISTENT_TEMPLATE' not found."
      );
      expect(errorThrown.errorCode).toBe(
        'DEBUG_FORMAT_PROMPT_TEMPLATE_NOT_FOUND'
      );
    });

    test('should call next with ApiError if prompt formatting fails', async () => {
      mockReq.body = {
        templateName: 'TEST_TEMPLATE',
        inputVariables: { wrong_key: 'value' },
      };
      const mockTemplates = { TEST_TEMPLATE: 'Hello {{key}}' }; // Requires 'key'
      LlmService.getPromptTemplates.mockReturnValue(mockTemplates);

      mockLangchainFormatFn.mockRejectedValue(new Error("Missing key 'key'"));
      // mockLangchainFromTemplateFn is already set up in beforeEach

      // AllHandlers is required at the top of the file and uses the globally mocked Langchain
      await AllHandlers.debugFormatPromptAsync(mockReq, mockRes, mockNext);

      expect(mockLangchainFromTemplateFn).toHaveBeenCalled();
      expect(mockLangchainFormatFn).toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalled();
      const errorThrown = mockNext.mock.calls[0][0];
      expect(errorThrown).toBeInstanceOf(ActualApiError);
      expect(errorThrown.statusCode).toBe(400);
      expect(errorThrown.message).toContain(
        "Error formatting prompt 'TEST_TEMPLATE': Missing key 'key'. Check input variables."
      );
      expect(errorThrown.errorCode).toBe(
        'DEBUG_FORMAT_PROMPT_FORMATTING_FAILED'
      );
    });
  });
});
