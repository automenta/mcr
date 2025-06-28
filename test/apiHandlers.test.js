const ApiHandlers = require('../src/apiHandlers');
const SessionManager = require('../src/sessionManager');
const LlmService = require('../src/llmService');
const ReasonerService = require('../src/reasonerService');
const ApiError = require('../src/errors');

jest.mock('../src/sessionManager');
jest.mock('../src/llmService');
jest.mock('../src/reasonerService');
jest.mock('../src/errors');
jest.mock('../src/logger'); // Auto-mocked
jest.mock('../src/config', () => ({
  // Factory mock for config
  load: jest.fn(() => ({
    // Provide minimal config structure needed by indirect dependencies like logger
    logging: { level: 'info', file: 'test.log' },
    session: { storagePath: '/tmp/sessions' }, // Dummy paths
    ontology: { storagePath: '/tmp/ontologies' },
    llm: { provider: 'openai', model: {}, apiKey: {} }, // Add other necessary fields
  })),
}));

describe('ApiHandlers', () => {
  let mockReq, mockRes, mockNext;

  beforeEach(() => {
    jest.clearAllMocks();

    mockRes = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
    };

    mockReq = {};
    mockNext = jest.fn();
    ApiError.mockImplementation((status, message) => ({ status, message }));
  });

  describe('getRoot', () => {
    test('should return basic API status and info', () => {
      ApiHandlers.getRoot(mockReq, mockRes);
      expect(mockRes.json).toHaveBeenCalledWith({
        status: 'ok',
        name: 'Model Context Reasoner',
        version: '2.0.0',
        description: 'MCR API',
      });
    });
  });

  describe('createSession', () => {
    test('should create a new session and return 201 status', () => {
      const newSession = {
        sessionId: 'new-session-id',
        createdAt: 'now',
        facts: [],
        factCount: 0,
      };
      SessionManager.create.mockReturnValue(newSession);

      ApiHandlers.createSession(mockReq, mockRes);

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

      ApiHandlers.getSession(mockReq, mockRes, mockNext);

      expect(SessionManager.get).toHaveBeenCalledWith('existing-id');
      expect(mockRes.json).toHaveBeenCalledWith(existingSession);
      expect(mockNext).not.toHaveBeenCalled();
    });

    test('should call next with ApiError if session not found', () => {
      const error = new ApiError(404, 'Session not found');
      mockReq.params = { sessionId: 'non-existent-id' };
      SessionManager.get.mockImplementation(() => {
        throw error;
      });

      ApiHandlers.getSession(mockReq, mockRes, mockNext);

      expect(SessionManager.get).toHaveBeenCalledWith('non-existent-id');
      expect(mockNext).toHaveBeenCalledWith(error);
      expect(mockRes.json).not.toHaveBeenCalled();
    });
  });

  describe('deleteSession', () => {
    test('should delete a session and return success message', () => {
      mockReq.params = { sessionId: 'delete-id' };
      SessionManager.delete.mockReturnValue(undefined);

      ApiHandlers.deleteSession(mockReq, mockRes, mockNext);

      expect(SessionManager.delete).toHaveBeenCalledWith('delete-id');
      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'Session delete-id terminated.',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    test('should call next with ApiError if session not found during deletion', () => {
      const error = new ApiError(404, 'Session not found');
      mockReq.params = { sessionId: 'non-existent-id' };
      SessionManager.delete.mockImplementation(() => {
        throw error;
      });

      ApiHandlers.deleteSession(mockReq, mockRes, mockNext);

      expect(SessionManager.delete).toHaveBeenCalledWith('non-existent-id');
      expect(mockNext).toHaveBeenCalledWith(error);
      expect(mockRes.json).not.toHaveBeenCalled();
    });
  });

  describe('assert', () => {
    test('should assert new facts and return added facts count', async () => {
      mockReq.params = { sessionId: 'assert-id' };
      mockReq.body = { text: 'The cat is on the mat.' };
      const mockSession = { sessionId: 'assert-id', facts: ['initial_fact.'] };
      const newFacts = ['on(cat,mat).'];

      SessionManager.get.mockReturnValue(mockSession);
      SessionManager.getNonSessionOntologyFacts.mockReturnValue([
        'ontology_fact.',
      ]);
      LlmService.nlToRules.mockResolvedValue(newFacts);
      SessionManager.addFacts.mockReturnValue(undefined);
      SessionManager.get.mockReturnValueOnce({
        ...mockSession,
        facts: [...mockSession.facts, ...newFacts],
        factCount: 2,
      });

      await ApiHandlers.assert(mockReq, mockRes, mockNext);

      expect(SessionManager.get).toHaveBeenCalledWith('assert-id');
      expect(LlmService.nlToRules).toHaveBeenCalledWith(
        mockReq.body.text,
        mockSession.facts.join('\n'),
        SessionManager.getNonSessionOntologyFacts().join('\n')
      );
      expect(SessionManager.addFacts).toHaveBeenCalledWith(
        'assert-id',
        newFacts
      );
      expect(mockRes.json).toHaveBeenCalledWith({
        addedFacts: newFacts,
        totalFactsInSession: 2,
        metadata: { success: true },
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    test('should throw ApiError if text is missing or invalid', async () => {
      mockReq.params = { sessionId: 'assert-id' };
      mockReq.body = { text: '' };

      await ApiHandlers.assert(mockReq, mockRes, mockNext);

      expect(ApiError).toHaveBeenCalledWith(
        400,
        "Missing or invalid required field 'text'. Must be a non-empty string."
      );
      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({ status: 400 })
      );
    });

    test('should call next with error if LLM service fails', async () => {
      const error = new Error('LLM error');
      mockReq.params = { sessionId: 'assert-id' };
      mockReq.body = { text: 'some text' };
      SessionManager.get.mockReturnValue({ sessionId: 'assert-id', facts: [] });
      LlmService.nlToRules.mockRejectedValue(error);

      await ApiHandlers.assert(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });

  describe('query', () => {
    test('should query facts and return natural language answer', async () => {
      mockReq.params = { sessionId: 'query-id' };
      mockReq.body = {
        query: 'Is John a parent of Mary?',
        options: { style: 'conversational' },
      };
      const prologQuery = 'parent(john,mary)?';
      const facts = ['parent(john,mary).'];
      const rawResults = ['true.'];
      const finalAnswer = 'Yes, John is a parent of Mary.';

      LlmService.queryToProlog.mockResolvedValue(prologQuery);
      SessionManager.getFactsWithOntology.mockReturnValue(facts);
      ReasonerService.runQuery.mockResolvedValue(rawResults);
      LlmService.resultToNl.mockResolvedValue(finalAnswer);

      await ApiHandlers.query(mockReq, mockRes, mockNext);

      expect(LlmService.queryToProlog).toHaveBeenCalledWith(mockReq.body.query);
      expect(SessionManager.getFactsWithOntology).toHaveBeenCalledWith(
        'query-id',
        undefined
      );
      expect(ReasonerService.runQuery).toHaveBeenCalledWith(facts, prologQuery);
      expect(LlmService.resultToNl).toHaveBeenCalledWith(
        mockReq.body.query,
        JSON.stringify('Yes.'),
        'conversational'
      );
      expect(mockRes.json).toHaveBeenCalledWith({
        queryProlog: prologQuery,
        result: 'Yes.',
        answer: finalAnswer,
        metadata: { success: true, steps: 1 },
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    test('should handle no solution found', async () => {
      mockReq.params = { sessionId: 'query-id' };
      mockReq.body = { query: 'Is John a parent of Mary?' };
      const prologQuery = 'parent(john,mary)?';
      const facts = [];
      const rawResults = [];
      const finalAnswer = 'No solution found.';

      LlmService.queryToProlog.mockResolvedValue(prologQuery);
      SessionManager.getFactsWithOntology.mockReturnValue(facts);
      ReasonerService.runQuery.mockResolvedValue(rawResults);
      LlmService.resultToNl.mockResolvedValue(finalAnswer);

      await ApiHandlers.query(mockReq, mockRes, mockNext);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          result: 'No solution found.',
          answer: finalAnswer,
        })
      );
    });

    test('should handle Prolog syntax error from reasoner', async () => {
      mockReq.params = { sessionId: 'query-id' };
      mockReq.body = { query: 'Invalid query.' };
      const prologQuery = 'invalid_syntax.';
      const reasonerError = new Error('Prolog syntax error: unexpected token');

      LlmService.queryToProlog.mockResolvedValue(prologQuery);
      SessionManager.getFactsWithOntology.mockReturnValue([]);
      ReasonerService.runQuery.mockRejectedValue(reasonerError);

      await ApiHandlers.query(mockReq, mockRes, mockNext);

      expect(ApiError).toHaveBeenCalledWith(
        400,
        expect.stringContaining('The LLM generated an invalid Prolog query.')
      );
      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({ status: 400 })
      );
    });

    test('should include debug info if options.debug is true', async () => {
      mockReq.params = { sessionId: 'query-id' };
      mockReq.body = {
        query: 'Is John a parent of Mary?',
        options: { debug: true },
      };
      const prologQuery = 'parent(john,mary)?';
      const facts = ['parent(john,mary).'];
      const rawResults = ['true.'];
      const finalAnswer = 'Yes, John is a parent of Mary.';
      const debugSession = {
        sessionId: 'query-id',
        facts: ['parent(john,mary).'],
      };
      const debugOntology = ['child(Y,X):-parent(X,Y).'];

      LlmService.queryToProlog.mockResolvedValue(prologQuery);
      SessionManager.getFactsWithOntology.mockReturnValue(facts);
      ReasonerService.runQuery.mockResolvedValue(rawResults);
      LlmService.resultToNl.mockResolvedValue(finalAnswer);
      SessionManager.get.mockReturnValue(debugSession);
      SessionManager.getNonSessionOntologyFacts.mockReturnValue(debugOntology);

      await ApiHandlers.query(mockReq, mockRes, mockNext);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          debug: {
            factsInSession: debugSession.facts,
            ontologyContext: debugOntology,
          },
        })
      );
    });
  });

  describe('translateNlToRules', () => {
    test('should translate natural language to rules', async () => {
      mockReq.body = {
        text: 'Birds can fly.',
        existing_facts: '',
        ontology_context: '',
      };
      const rules = ['can_fly(X):-bird(X).'];
      LlmService.nlToRules.mockResolvedValue(rules);

      await ApiHandlers.translateNlToRules(mockReq, mockRes, mockNext);

      expect(LlmService.nlToRules).toHaveBeenCalledWith(
        mockReq.body.text,
        mockReq.body.existing_facts,
        mockReq.body.ontology_context
      );
      expect(mockRes.json).toHaveBeenCalledWith({ rules });
    });

    test('should throw ApiError if text is missing or invalid', async () => {
      mockReq.body = { text: '' };
      await ApiHandlers.translateNlToRules(mockReq, mockRes, mockNext);
      expect(ApiError).toHaveBeenCalledWith(
        400,
        "Missing or invalid required field 'text'. Must be a non-empty string."
      );
      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({ status: 400 })
      );
    });
  });

  describe('translateRulesToNl', () => {
    test('should translate rules to natural language', async () => {
      mockReq.body = { rules: ['parent(X,Y).'], style: 'formal' };
      const text = 'A parent is defined.';
      LlmService.rulesToNl.mockResolvedValue(text);

      await ApiHandlers.translateRulesToNl(mockReq, mockRes, mockNext);

      expect(LlmService.rulesToNl).toHaveBeenCalledWith(
        mockReq.body.rules,
        mockReq.body.style
      );
      expect(mockRes.json).toHaveBeenCalledWith({ text });
    });

    test('should throw ApiError if rules are missing or invalid', async () => {
      mockReq.body = { rules: 'not an array' };
      await ApiHandlers.translateRulesToNl(mockReq, mockRes, mockNext);
      expect(ApiError).toHaveBeenCalledWith(
        400,
        "Missing or invalid 'rules' field; must be an array of strings."
      );
      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({ status: 400 })
      );
    });
  });

  describe('addOntology', () => {
    test('should add a new ontology and return 201 status', () => {
      mockReq.body = { name: 'new_onto', rules: 'rule1.' };
      const newOntology = { name: 'new_onto', rules: 'rule1.' };
      SessionManager.addOntology.mockReturnValue(newOntology);

      ApiHandlers.addOntology(mockReq, mockRes, mockNext);

      expect(SessionManager.addOntology).toHaveBeenCalledWith(
        mockReq.body.name,
        mockReq.body.rules
      );
      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith(newOntology);
    });

    test('should throw ApiError if name is missing or invalid', () => {
      mockReq.body = { name: '', rules: 'rule1.' };
      ApiHandlers.addOntology(mockReq, mockRes, mockNext);
      expect(ApiError).toHaveBeenCalledWith(
        400,
        "Missing or invalid required field 'name'. Must be a non-empty string."
      );
      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({ status: 400 })
      );
    });

    test('should throw ApiError if rules are missing or invalid', () => {
      mockReq.body = { name: 'new_onto', rules: '' };
      ApiHandlers.addOntology(mockReq, mockRes, mockNext);
      expect(ApiError).toHaveBeenCalledWith(
        400,
        "Missing or invalid required field 'rules'. Must be a non-empty string."
      );
      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({ status: 400 })
      );
    });
  });

  describe('updateOntology', () => {
    test('should update an existing ontology', () => {
      mockReq.params = { name: 'update_onto' };
      mockReq.body = { rules: 'updated_rule.' };
      const updatedOntology = { name: 'update_onto', rules: 'updated_rule.' };
      SessionManager.updateOntology.mockReturnValue(updatedOntology);

      ApiHandlers.updateOntology(mockReq, mockRes, mockNext);

      expect(SessionManager.updateOntology).toHaveBeenCalledWith(
        mockReq.params.name,
        mockReq.body.rules
      );
      expect(mockRes.json).toHaveBeenCalledWith(updatedOntology);
    });

    test('should throw ApiError if rules are missing or invalid', () => {
      mockReq.params = { name: 'update_onto' };
      mockReq.body = { rules: '' };
      ApiHandlers.updateOntology(mockReq, mockRes, mockNext);
      expect(ApiError).toHaveBeenCalledWith(
        400,
        "Missing or invalid required field 'rules'. Must be a non-empty string."
      );
      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({ status: 400 })
      );
    });
  });

  describe('getOntologies', () => {
    test('should return all ontologies', () => {
      const ontologies = [{ name: 'onto1', rules: 'r1.' }];
      SessionManager.getOntologies.mockReturnValue(ontologies);

      ApiHandlers.getOntologies(mockReq, mockRes, mockNext);

      expect(SessionManager.getOntologies).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith(ontologies);
    });
  });

  describe('getOntology', () => {
    test('should return a specific ontology', () => {
      mockReq.params = { name: 'specific_onto' };
      const ontology = { name: 'specific_onto', rules: 'specific_r.' };
      SessionManager.getOntology.mockReturnValue(ontology);

      ApiHandlers.getOntology(mockReq, mockRes, mockNext);

      expect(SessionManager.getOntology).toHaveBeenCalledWith(
        mockReq.params.name
      );
      expect(mockRes.json).toHaveBeenCalledWith(ontology);
    });

    test('should call next with ApiError if ontology not found', () => {
      const error = new ApiError(404, 'Ontology not found');
      mockReq.params = { name: 'non_existent_onto' };
      SessionManager.getOntology.mockImplementation(() => {
        throw error;
      });

      ApiHandlers.getOntology(mockReq, mockRes, mockNext);

      expect(SessionManager.getOntology).toHaveBeenCalledWith(
        'non_existent_onto'
      );
      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });

  describe('deleteOntology', () => {
    test('should delete an ontology', () => {
      mockReq.params = { name: 'delete_onto' };
      const deleteResult = { message: 'Ontology delete_onto deleted.' };
      SessionManager.deleteOntology.mockReturnValue(deleteResult);

      ApiHandlers.deleteOntology(mockReq, mockRes, mockNext);

      expect(SessionManager.deleteOntology).toHaveBeenCalledWith(
        mockReq.params.name
      );
      expect(mockRes.json).toHaveBeenCalledWith(deleteResult);
    });

    test('should call next with ApiError if ontology not found', () => {
      const error = new ApiError(404, 'Ontology not found');
      mockReq.params = { name: 'non_existent_onto' };
      SessionManager.deleteOntology.mockImplementation(() => {
        throw error;
      });

      ApiHandlers.deleteOntology(mockReq, mockRes, mockNext);

      expect(SessionManager.deleteOntology).toHaveBeenCalledWith(
        'non_existent_onto'
      );
      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });

  describe('explainQuery', () => {
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
      LlmService.explainQuery.mockResolvedValue(explanation);

      await ApiHandlers.explainQuery(mockReq, mockRes, mockNext);

      expect(SessionManager.get).toHaveBeenCalledWith('explain-id');
      expect(SessionManager.getNonSessionOntologyFacts).toHaveBeenCalledWith(
        'explain-id'
      );
      expect(LlmService.explainQuery).toHaveBeenCalledWith(
        mockReq.body.query,
        mockSession.facts,
        ontologyContext
      );
      expect(mockRes.json).toHaveBeenCalledWith({
        query: mockReq.body.query,
        explanation,
      });
    });

    test('should throw ApiError if query is missing or invalid', async () => {
      mockReq.params = { sessionId: 'explain-id' };
      mockReq.body = { query: '' };

      await ApiHandlers.explainQuery(mockReq, mockRes, mockNext);

      expect(ApiError).toHaveBeenCalledWith(
        400,
        "Missing or invalid required field 'query'. Must be a non-empty string."
      );
      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({ status: 400 })
      );
    });
  });

  describe('getPrompts', () => {
    test('should return prompt templates', () => {
      const mockPromptTemplates = { NL_TO_RULES: 'template1' };
      LlmService.getPromptTemplates.mockReturnValue(mockPromptTemplates);

      ApiHandlers.getPrompts(mockReq, mockRes);

      expect(LlmService.getPromptTemplates).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith(mockPromptTemplates);
    });
  });
});
