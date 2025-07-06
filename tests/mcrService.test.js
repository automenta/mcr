// Mock dependencies FIRST
jest.mock('../src/llmService', () => ({
  generate: jest.fn(),
  // Add any other functions from llmService that mcrService directly calls
}));
jest.mock('../src/config', () => ({
  llmProvider: { // Corrected from llm to llmProvider
    provider: 'ollama', // Example provider
    model: 'test-model', // Default model for the provider
    anthropic: { apiKey: 'test-key', defaultModel: 'test-model-anthropic' },
    openai: { apiKey: 'test-key', defaultModel: 'test-model-openai' },
    gemini: { apiKey: 'test-key', defaultModel: 'test-model-gemini' },
    ollama: { host: 'test-host', defaultModel: 'test-model-ollama' }, // Specific model for ollama if needed
  },
  reasoner: {
    provider: 'test-reasoner-provider',
    prolog: { implementation: 'test-prolog-impl' },
  },
  logLevel: 'info',
  server: { port: 3000, host: 'localhost' },
  session: { storagePath: './test-sessions', defaultTimeoutMinutes: 60 },
  ontology: { storagePath: './test-ontologies', autoLoad: true },
  translationStrategy: 'SIR-R1', // Ensure this is present as per previous fixes
}));

// jest.mock('../src/llmService'); // Redundant: already mocked with factory above
jest.mock('../src/reasonerService', () => ({
  executeQuery: jest.fn(),
  validateKnowledgeBase: jest.fn().mockResolvedValue({ isValid: true }), // Default mock for successful validation
}));
jest.mock('../src/sessionManager', () => ({
  getSession: jest.fn(),
  getKnowledgeBase: jest.fn(),
  addFacts: jest.fn(),
  createSession: jest.fn(),
  deleteSession: jest.fn(),
  getLexiconSummary: jest.fn().mockReturnValue('lexicon_entry/1'), // Added mock for getLexiconSummary
}));
jest.mock('../src/ontologyService', () => ({
  listOntologies: jest.fn(),
  // Adding a mock for getGlobalOntologyRulesAsString as it's used in mcrService
  getGlobalOntologyRulesAsString: jest
    .fn()
    .mockResolvedValue('global_ontology_rule_from_mock.'),
}));
jest.mock('../src/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

// Now require the modules under test and other non-mocked dependencies
const mcrService = require('../src/mcrService');
const llmService = require('../src/llmService'); // Will be the mock from the jest.mock call above
const reasonerService = require('../src/reasonerService'); // Will be an auto-mock or specific mock if defined
const sessionManager = require('../src/sessionManager'); // Will be an auto-mock or specific mock if defined
const ontologyService = require('../src/ontologyService'); // Will be an auto-mock or specific mock if defined
const { prompts } = require('../src/prompts'); // Assuming prompts are real or mocked elsewhere if needed

describe('MCR Service (mcrService.js)', () => {
  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();
  });

  // Placeholder for tests
  it('should have tests added', () => {
    expect(true).toBe(true);
  });

  describe('assertNLToSession', () => {
    const sessionId = 'test-session';
    const nlText = 'The sky is blue.';
    const prologFact = 'is_blue(sky).';

    beforeEach(async () => {
      // Setup default successful mock behaviors
      // Set base strategy ID. Actual strategy used will be baseStrategyId + "-Assert"
      await mcrService.setTranslationStrategy('SIR-R1');
      sessionManager.getSession.mockReturnValue({ id: sessionId, facts: [] });
      ontologyService.listOntologies.mockResolvedValue([
        { name: 'global', rules: 'universal_rule.' },
      ]);
      llmService.generate.mockImplementation(async (systemPrompt) => {
        if (systemPrompt === prompts.NL_TO_SIR_ASSERT.system) {
          return JSON.stringify({
            statementType: 'fact',
            fact: { predicate: 'is_blue', arguments: ['sky'] },
          });
        }
        return `mock_fallback_for_system_prompt: ${systemPrompt}`;
      });
      sessionManager.addFacts.mockReturnValue(true);
      sessionManager.getKnowledgeBase.mockReturnValue('');
      sessionManager.getLexiconSummary.mockReturnValue('lexicon_entry/1');
    });

    it('should successfully assert a natural language statement using SIR-R1-Assert strategy', async () => {
      const result = await mcrService.assertNLToSession(sessionId, nlText);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Facts asserted successfully.');
      expect(result.addedFacts).toEqual([prologFact]);
      expect(result.strategyId).toBe('SIR-R1-Assert'); // Check operational strategy ID
      expect(sessionManager.getSession).toHaveBeenCalledWith(sessionId);
      expect(llmService.generate).toHaveBeenCalledWith(
        prompts.NL_TO_SIR_ASSERT.system,
        expect.any(String)
      );
      expect(sessionManager.addFacts).toHaveBeenCalledWith(sessionId, [
        prologFact,
      ]);
    });

    it('should return session not found if sessionManager.getSession returns null', async () => {
      sessionManager.getSession.mockReturnValue(null);
      const result = await mcrService.assertNLToSession(sessionId, 'Some text');
      expect(result.success).toBe(false);
      expect(result.message).toBe('Session not found.');
      expect(result.error).toBe('SESSION_NOT_FOUND');
      expect(result.strategyId).toBe('SIR-R1-Assert'); // Still reports the strategy it would have used
      expect(llmService.generate).not.toHaveBeenCalled();
    });

    it('should return error from strategy if LLM returns invalid SIR JSON', async () => {
      llmService.generate.mockImplementation(async (systemPrompt) => {
        if (systemPrompt === prompts.NL_TO_SIR_ASSERT.system) {
          return 'This is not valid JSON';
        }
        return prologFact;
      });
      const result = await mcrService.assertNLToSession(sessionId,'Is the sky blue?');
      expect(result.success).toBe(false);
      expect(result.message).toMatch(/Error during assertion:/i);
      expect(result.details).toMatch(/Execution failed at node 'step2_parse_sir_json' \(Type: Parse_JSON\) in strategy 'SIR-R1-Assert': Failed to parse JSON for node step2_parse_sir_json: Unexpected token 'T', "This is no"... is not valid JSON/i);
      expect(result.error).toBe('JSON_PARSING_FAILED'); // Corrected expected error code
      expect(result.strategyId).toBe('SIR-R1-Assert');
      expect(sessionManager.addFacts).not.toHaveBeenCalled();
    });

    it('should return STRATEGY_INVALID_OUTPUT if SIR strategy returns non-assertable SIR structure', async () => {
      llmService.generate.mockImplementation(async (systemPrompt) => {
        if (systemPrompt === prompts.NL_TO_SIR_ASSERT.system) {
          return JSON.stringify({
            statementType: 'comment', // This will fail in convertSirToProlog
            text: 'ignore this',
          });
        }
        return prologFact;
      });
      const result = await mcrService.assertNLToSession(sessionId, nlText);
      expect(result.success).toBe(false);
      // This specific case is where the strategy runs, produces an empty array,
      // and mcrService then determines no facts were extracted.
      expect(result.message).toBe('Could not translate text into valid facts using the current strategy.');
      expect(result.error).toBe('NO_FACTS_EXTRACTED');
      expect(result.strategyId).toBe('SIR-R1-Assert');
      expect(sessionManager.addFacts).not.toHaveBeenCalled();
    });

    it('should return SESSION_ADD_FACTS_FAILED if sessionManager.addFacts returns false', async () => {
      llmService.generate.mockImplementation(async (systemPrompt) => {
        if (systemPrompt === prompts.NL_TO_SIR_ASSERT.system) {
          return JSON.stringify({
            statementType: 'fact',
            fact: { predicate: 'is_blue', arguments: ['sky'] },
          });
        }
        return prologFact;
      });
      sessionManager.addFacts.mockReturnValue(false);
      reasonerService.validateKnowledgeBase.mockResolvedValue({ isValid: true });

      const result = await mcrService.assertNLToSession(sessionId, nlText);
      expect(result.success).toBe(false);
      expect(result.message).toBe('Failed to add facts to session manager after validation.');
      expect(result.error).toBe('SESSION_ADD_FACTS_FAILED');
      expect(result.strategyId).toBe('SIR-R1-Assert');
    });

    it('should handle errors from ontologyService.listOntologies gracefully and still assert', async () => {
      ontologyService.listOntologies.mockRejectedValue(new Error('Ontology service error'));
      llmService.generate.mockImplementation(async (systemPrompt) => {
        if (systemPrompt === prompts.NL_TO_SIR_ASSERT.system) {
          return JSON.stringify({
            statementType: 'fact',
            fact: { predicate: 'is_blue', arguments: ['sky'] },
          });
        }
        return prologFact;
      });

      const result = await mcrService.assertNLToSession(sessionId, nlText);
      expect(result.success).toBe(true);
      expect(result.message).toBe('Facts asserted successfully.');
      expect(result.strategyId).toBe('SIR-R1-Assert');
      expect(llmService.generate).toHaveBeenCalled();
      expect(sessionManager.addFacts).toHaveBeenCalledWith(sessionId, [prologFact]);
    });

    it('should handle errors from llmService.generate (network error, etc.)', async () => {
      llmService.generate.mockRejectedValue(new Error('LLM generation failed'));
      const result = await mcrService.assertNLToSession(sessionId, nlText);
      expect(result.success).toBe(false);
      expect(result.message).toContain('Error during assertion: Execution failed at node \'step1_nl_to_sir_llm\' (Type: LLM_Call) in strategy \'SIR-R1-Assert\': LLM generation failed');
      expect(result.error).toBe('STRATEGY_EXECUTION_ERROR');
      expect(result.strategyId).toBe('SIR-R1-Assert');
      expect(sessionManager.addFacts).not.toHaveBeenCalled();
    });

    it('should return validation error if reasonerService.validateKnowledgeBase returns isValid: false', async () => {
      sessionManager.getSession.mockReturnValue({ id: sessionId, facts: [] });
      llmService.generate.mockImplementation(async (systemPrompt) => {
        if (systemPrompt === prompts.NL_TO_SIR_ASSERT.system) {
          return JSON.stringify({
            statementType: 'fact',
            fact: { predicate: 'is_valid', arguments: ['test'] },
          });
        }
        return 'is_valid(test).';
      });
      const validationErrorMsg = 'Syntax error in asserted fact';
      reasonerService.validateKnowledgeBase.mockResolvedValue({
        isValid: false,
        error: validationErrorMsg,
      });

      const result = await mcrService.assertNLToSession(sessionId,'A test statement.');
      expect(result.success).toBe(false);
      expect(result.message).toBe('Failed to assert facts: Generated Prolog is invalid.');
      expect(result.error).toBe('INVALID_GENERATED_PROLOG');
      expect(result.strategyId).toBe('SIR-R1-Assert');
      expect(result.details).toContain('Generated Prolog is invalid: "is_valid(test)."');
      expect(result.details).toContain(validationErrorMsg);
      expect(reasonerService.validateKnowledgeBase).toHaveBeenCalledWith('is_valid(test).');
      expect(sessionManager.addFacts).not.toHaveBeenCalled();
    });
  });

  describe('querySessionWithNL', () => {
    const sessionId = 'test-session-query';
    const nlQuestion = 'What color is the sky?';
    const prologQuery = 'color(sky, Color).';
    const reasonerResults = [{ Color: 'blue' }];
    const nlAnswer = 'The sky is blue.';
    const dynamicOntologyText = 'dynamic_rule(a).';

    beforeEach(async () => {
      await mcrService.setTranslationStrategy('SIR-R1'); // Base strategy ID
      const currentConfig = require('../src/config');
      currentConfig.debugLevel = 'verbose';

      sessionManager.getSession.mockReturnValue({ id: sessionId, facts: ['is_blue(sky).'] });
      sessionManager.getKnowledgeBase.mockReturnValue('is_blue(sky).');
      ontologyService.listOntologies.mockResolvedValue([{ name: 'global', rules: 'universal_rule.' }]);
      llmService.generate.mockImplementation(async (systemPrompt, userPrompt) => {
        if (systemPrompt === prompts.NL_TO_QUERY.system) { // SIR-R1-Query uses NL_TO_QUERY
          return Promise.resolve(prologQuery);
        }
        if (systemPrompt === prompts.LOGIC_TO_NL_ANSWER.system) {
          if (userPrompt.includes(JSON.stringify(reasonerResults))) {
            return Promise.resolve(nlAnswer);
          }
        }
        return Promise.reject(new Error(`Unexpected LLM generate call in querySessionWithNL test. System: ${systemPrompt}`));
      });
      reasonerService.executeQuery.mockResolvedValue(reasonerResults);
    });

    it('should successfully query a session with NL using SIR-R1-Query strategy', async () => {
      const result = await mcrService.querySessionWithNL(sessionId, nlQuestion);
      expect(result.success).toBe(true);
      expect(result.answer).toBe(nlAnswer);
      expect(result.debugInfo.strategyId).toBe('SIR-R1-Query');
      expect(sessionManager.getSession).toHaveBeenCalledWith(sessionId);
      expect(llmService.generate).toHaveBeenCalledTimes(2);
      expect(reasonerService.executeQuery).toHaveBeenCalledWith(expect.stringContaining('is_blue(sky).\n% --- Global Ontologies ---\nuniversal_rule.'), prologQuery);
      expect(result.debugInfo.prologQuery).toBe(prologQuery);
      expect(result.debugInfo.prologResultsJSON).toEqual(JSON.stringify(reasonerResults));
    });

    it('should successfully query with dynamic ontology', async () => {
      const result = await mcrService.querySessionWithNL(sessionId,nlQuestion, { dynamicOntology: dynamicOntologyText });
      expect(result.success).toBe(true);
      expect(result.answer).toBe(nlAnswer);
      expect(result.debugInfo.strategyId).toBe('SIR-R1-Query');
      expect(reasonerService.executeQuery).toHaveBeenCalledWith(expect.stringContaining(dynamicOntologyText), prologQuery);
      expect(result.debugInfo.dynamicOntologyProvided).toBe(true);
    });

    it('should return session not found if sessionManager.getSession returns null', async () => {
      sessionManager.getSession.mockReturnValue(null);
      const result = await mcrService.querySessionWithNL(sessionId, nlQuestion);
      expect(result.success).toBe(false);
      expect(result.message).toBe('Session not found.');
      expect(result.error).toBe('SESSION_NOT_FOUND');
      expect(result.strategyId).toBe('SIR-R1-Query');
      expect(llmService.generate).not.toHaveBeenCalled();
    });

    it('should return error if LLM fails to translate NL to Prolog query', async () => {
      llmService.generate.mockImplementation(async (systemPrompt, userPrompt) => {
        if (systemPrompt === prompts.NL_TO_QUERY.system && userPrompt.includes(nlQuestion)) {
          // This will cause Extract_Prolog_Query node to fail or produce empty.
          return Promise.resolve('');
        }
        if (systemPrompt === prompts.LOGIC_TO_NL_ANSWER.system) return Promise.resolve(nlAnswer);
        return Promise.reject(new Error(`Unexpected LLM call in query test (translate fail): System: ${systemPrompt}`));
      });

      const result = await mcrService.querySessionWithNL(sessionId, nlQuestion);
      expect(result.success).toBe(false);
      expect(result.message).toMatch(/Error during query:/i);
      // This error is now caught by mcrService's own validation after strategy execution
      expect(result.details).toMatch(/Strategy execution for query returned an unexpected output format. Expected Prolog query string ending with a period./i);
      expect(result.error).toBe('STRATEGY_INVALID_OUTPUT');
      expect(result.strategyId).toBe('SIR-R1-Query');
      expect(reasonerService.executeQuery).not.toHaveBeenCalled();
    });

    it('should return error if LLM generates null for Prolog query', async () => {
      llmService.generate.mockImplementation(async (systemPrompt) => {
        if (systemPrompt === prompts.NL_TO_QUERY.system) return Promise.resolve(null); // LLM returns null
        if (systemPrompt === prompts.LOGIC_TO_NL_ANSWER.system) return Promise.resolve(nlAnswer);
        return Promise.reject(new Error('Unexpected LLM call in query test (null query)'));
      });
      const result = await mcrService.querySessionWithNL(sessionId, nlQuestion);
      expect(result.success).toBe(false);
      expect(result.message).toMatch(/Error during query:/i);
      expect(result.details).toMatch(/Execution failed at node 'step2_extract_prolog_query' \(Type: Extract_Prolog_Query\) in strategy 'SIR-R1-Query': Input for Extract_Prolog_Query node step2_extract_prolog_query \(variable 'raw_llm_query_output'\) is not a string. Found: object/i);
      expect(result.error).toBe('INVALID_NODE_INPUT'); // Corrected expected error code
      expect(result.strategyId).toBe('SIR-R1-Query');
    });

    it('should handle error from reasonerService.executeQuery', async () => {
      reasonerService.executeQuery.mockRejectedValue(new Error('Reasoner boom!'));
      const result = await mcrService.querySessionWithNL(sessionId, nlQuestion);
      expect(result.success).toBe(false);
      expect(result.message).toMatch(/Error during query: Reasoner boom!/i);
      expect(result.details).toMatch(/Reasoner boom!/i);
      expect(result.error).toBe('STRATEGY_EXECUTION_ERROR'); // This is now caught by the main catch block in mcrService
      expect(result.strategyId).toBe('SIR-R1-Query');
    });

    it('should handle error from ontologyService.listOntologies gracefully during NL_TO_QUERY prompt building', async () => {
      ontologyService.listOntologies.mockImplementationOnce(() => Promise.reject(new Error('Ontology N2Q prompt error')));
      const result = await mcrService.querySessionWithNL(sessionId, nlQuestion);
      expect(result.success).toBe(true);
      expect(result.answer).toBe(nlAnswer);
      expect(result.debugInfo.strategyId).toBe('SIR-R1-Query');
      expect(llmService.generate).toHaveBeenCalledTimes(2);
      expect(reasonerService.executeQuery).toHaveBeenCalled();
      expect(result.debugInfo.ontologyErrorForStrategy).toBe('Failed to load global ontologies for query translation: Ontology N2Q prompt error');
    });

    it('should handle error from ontologyService.listOntologies gracefully during KB augmentation', async () => {
      ontologyService.listOntologies.mockImplementationOnce(() => Promise.resolve([{ name: 'global', rules: 'universal_rule.' }]));
      ontologyService.listOntologies.mockImplementationOnce(() => Promise.reject(new Error('Ontology KB augment error')));
      const result = await mcrService.querySessionWithNL(sessionId, nlQuestion);
      expect(result.success).toBe(true);
      expect(result.answer).toBe(nlAnswer);
      expect(result.debugInfo.strategyId).toBe('SIR-R1-Query');
      expect(llmService.generate).toHaveBeenCalledTimes(2);
      expect(reasonerService.executeQuery).toHaveBeenCalledWith(expect.not.stringContaining('universal_rule.'), prologQuery);
      expect(result.debugInfo.ontologyErrorForReasoner).toBe('Failed to load global ontologies for reasoner: Ontology KB augment error');
    });

    it('should handle error from the second llmService.generate (LOGIC_TO_NL)', async () => {
      llmService.generate
        .mockImplementationOnce(async (sysPrompt) => { // NL_TO_QUERY
          if (sysPrompt === prompts.NL_TO_QUERY.system) return Promise.resolve(prologQuery);
          throw new Error("Incorrect prompt for first call");
        })
        .mockImplementationOnce(async (sysPrompt) => { // LOGIC_TO_NL
          if (sysPrompt === prompts.LOGIC_TO_NL_ANSWER.system) return Promise.reject(new Error('LLM L2NL failed'));
           throw new Error("Incorrect prompt for second call");
        });

      const result = await mcrService.querySessionWithNL(sessionId, nlQuestion);
      expect(result.success).toBe(false);
      expect(result.message).toMatch(/Error during query: LLM L2NL failed/i);
      expect(result.details).toMatch(/LLM L2NL failed/i);
      expect(result.error).toBe('STRATEGY_EXECUTION_ERROR'); // This is now caught by the main catch block
      expect(result.strategyId).toBe('SIR-R1-Query');
    });
  });

  describe('translateNLToRulesDirect', () => {
    const prologRules = 'father(john, peter).';
    const nlExplanation = 'John is the father of Peter.';

    beforeEach(() => {
      llmService.generate.mockResolvedValue(nlExplanation);
    });

    it('should successfully translate Prolog rules to NL directly', async () => {
      const result = await mcrService.translateRulesToNLDirect(
        prologRules,
        'conversational'
      );
      expect(result.success).toBe(true);
      expect(result.explanation).toBe(nlExplanation);
      expect(llmService.generate).toHaveBeenCalledWith(
        prompts.RULES_TO_NL_DIRECT.system,
        expect.stringContaining(prologRules)
      );
    });

    it('should return error for empty input Prolog rules', async () => {
      const result = await mcrService.translateRulesToNLDirect('');
      expect(result.success).toBe(false);
      expect(result.message).toBe(
        'Input Prolog rules must be a non-empty string.'
      );
      expect(result.error).toBe('EMPTY_RULES_INPUT');
      expect(llmService.generate).not.toHaveBeenCalled();
    });

    it('should return error for null input Prolog rules', async () => {
      const result = await mcrService.translateRulesToNLDirect(null);
      expect(result.success).toBe(false);
      expect(result.message).toBe(
        'Input Prolog rules must be a non-empty string.'
      );
      expect(result.error).toBe('EMPTY_RULES_INPUT');
    });

    it('should return error if LLM fails to generate an explanation (empty string)', async () => {
      llmService.generate.mockResolvedValue('');
      const result = await mcrService.translateRulesToNLDirect(prologRules);
      expect(result.success).toBe(false);
      expect(result.message).toBe(
        'Failed to generate a natural language explanation.'
      );
      expect(result.error).toBe('EMPTY_EXPLANATION_GENERATED');
    });

    it('should return error if LLM fails to generate an explanation (null)', async () => {
      llmService.generate.mockResolvedValue(null);
      const result = await mcrService.translateRulesToNLDirect(prologRules);
      expect(result.success).toBe(false);
      expect(result.message).toBe(
        'Failed to generate a natural language explanation.'
      );
      expect(result.error).toBe('EMPTY_EXPLANATION_GENERATED');
    });

    it('should handle errors from llmService.generate', async () => {
      llmService.generate.mockRejectedValue(
        new Error('LLM direct R2NL failed')
      );
      const result = await mcrService.translateRulesToNLDirect(prologRules);
      expect(result.success).toBe(false);
      expect(result.message).toContain(
        'Error during Rules to NL translation: LLM direct R2NL failed'
      );
    });

    it('should default to "conversational" style if not provided', async () => {
      await mcrService.translateRulesToNLDirect(prologRules);
      expect(llmService.generate).toHaveBeenCalledWith(
        prompts.RULES_TO_NL_DIRECT.system,
        expect.stringMatching(/style:\s*conversational/i) // Check that 'conversational' is in the prompt
      );
    });

    it('should use "formal" style when provided', async () => {
      await mcrService.translateRulesToNLDirect(prologRules, 'formal');
      expect(llmService.generate).toHaveBeenCalledWith(
        prompts.RULES_TO_NL_DIRECT.system,
        expect.stringMatching(/style:\s*formal/i) // Check that 'formal' is in the prompt
      );
    });
  });

  describe('explainQuery', () => {
    const sessionId = 'test-session-explain';
    const nlQuestion = 'Why is the sky blue?';
    const prologQueryForExplain = 'explain(color(sky,blue)).';
    const explanation = 'The sky is blue due to Rayleigh scattering.';

    beforeEach(async () => {
      await mcrService.setTranslationStrategy('SIR-R1'); // Base strategy
      sessionManager.getSession.mockReturnValue({ id: sessionId, facts: ['is_blue(sky).']});
      sessionManager.getKnowledgeBase.mockReturnValue('is_blue(sky).');
      ontologyService.listOntologies.mockResolvedValue([{ name: 'global', rules: 'universal_rule.' }]);
      llmService.generate.mockImplementation((systemPrompt, userPrompt) => {
        if (systemPrompt === prompts.NL_TO_QUERY.system && userPrompt.includes(nlQuestion)) { // SIR-R1-Query uses NL_TO_QUERY
          return Promise.resolve(prologQueryForExplain);
        }
        if (systemPrompt === prompts.EXPLAIN_PROLOG_QUERY.system && userPrompt.includes(prologQueryForExplain)) {
          return Promise.resolve(explanation);
        }
        return Promise.reject(new Error(`Unexpected LLM generate call in explainQuery test: ${systemPrompt}`));
      });
    });

    it('should successfully generate a query explanation using SIR-R1-Query strategy', async () => {
      const result = await mcrService.explainQuery(sessionId, nlQuestion);
      expect(result.success).toBe(true);
      expect(result.explanation).toBe(explanation);
      expect(result.debugInfo.strategyId).toBe('SIR-R1-Query');
      expect(sessionManager.getSession).toHaveBeenCalledWith(sessionId);
      expect(llmService.generate).toHaveBeenCalledTimes(2);
      expect(result.debugInfo.prologQuery).toBe(prologQueryForExplain);
    });

    it('should return session not found if sessionManager.getSession returns null', async () => {
      sessionManager.getSession.mockReturnValue(null);
      const result = await mcrService.explainQuery(sessionId, nlQuestion);
      expect(result.success).toBe(false);
      expect(result.message).toBe('Session not found.');
      expect(result.error).toBe('SESSION_NOT_FOUND');
      expect(result.strategyId).toBe('SIR-R1-Query');
      expect(llmService.generate).not.toHaveBeenCalled();
    });

    it('should return error if LLM fails to translate NL to Prolog query for explanation', async () => {
      llmService.generate.mockImplementation(async (systemPrompt, userPrompt) => {
          if (systemPrompt === prompts.NL_TO_QUERY.system && userPrompt.includes(nlQuestion)) {
            // Simulate strategy execution failure during query generation
            throw new Error('Strategy query generation failed');
          }
          if (systemPrompt === prompts.EXPLAIN_PROLOG_QUERY.system) return Promise.resolve(explanation);
          return Promise.reject(new Error(`Unexpected LLM call in explainQuery (translate fail): ${systemPrompt}`));
        }
      );
      const result = await mcrService.explainQuery(sessionId, nlQuestion);
      expect(result.success).toBe(false);
      expect(result.message).toMatch(/Error during query explanation:/i);
      expect(result.details).toMatch(/Strategy query generation failed/i);
      expect(result.error).toBe('STRATEGY_EXECUTION_ERROR');
      expect(result.strategyId).toBe('SIR-R1-Query');
    });


    it('should return error if LLM generates null for Prolog query for explanation', async () => {
      llmService.generate.mockImplementation(async (systemPrompt, userPrompt) => {
          if (systemPrompt === prompts.NL_TO_QUERY.system && userPrompt.includes(nlQuestion)) {
            // Simulate strategy returning null, which then causes an error in StrategyExecutor
             return Promise.resolve(null); // This will cause the Extract_Prolog_Query node to fail
          }
          if (systemPrompt === prompts.EXPLAIN_PROLOG_QUERY.system) return Promise.resolve(explanation);
          return Promise.reject(new Error('Unexpected LLM call in explainQuery (null query)'));
        }
      );
      const result = await mcrService.explainQuery(sessionId, nlQuestion);
      expect(result.success).toBe(false);
      expect(result.message).toMatch(/Error during query explanation:/i);
      expect(result.details).toMatch(/Input for Extract_Prolog_Query node step2_extract_prolog_query \(variable 'raw_llm_query_output'\) is not a string/i);
      expect(result.error).toBe('INVALID_NODE_INPUT'); // Corrected expected error code
      expect(result.strategyId).toBe('SIR-R1-Query');
    });

    it('should return error if LLM fails to generate an explanation (empty string)', async () => {
      llmService.generate
        .mockImplementationOnce(async (sysPrompt) => { // NL_TO_QUERY
            if (sysPrompt === prompts.NL_TO_QUERY.system) return Promise.resolve(prologQueryForExplain);
            throw new Error("explainQuery - NL_TO_QUERY prompt error");
        })
        .mockImplementationOnce(async (sysPrompt) => { // EXPLAIN_PROLOG_QUERY
            if (sysPrompt === prompts.EXPLAIN_PROLOG_QUERY.system) return Promise.resolve(''); // Empty explanation
            throw new Error("explainQuery - EXPLAIN_PROLOG_QUERY prompt error for empty string test");
        });
      const result = await mcrService.explainQuery(sessionId, nlQuestion);
      expect(result.success).toBe(false);
      expect(result.message).toBe('Failed to generate an explanation for the query.');
      expect(result.error).toBe('LLM_EMPTY_RESPONSE');
      expect(result.strategyId).toBe('SIR-R1-Query');
    });

    it('should return error if LLM fails to generate an explanation (null)', async () => {
      llmService.generate
        .mockImplementationOnce(async (sysPrompt) => { // NL_TO_QUERY
            if (sysPrompt === prompts.NL_TO_QUERY.system) return Promise.resolve(prologQueryForExplain);
             throw new Error("explainQuery - NL_TO_QUERY prompt error for null explanation test");
        })
        .mockImplementationOnce(async (sysPrompt) => { // EXPLAIN_PROLOG_QUERY
            if (sysPrompt === prompts.EXPLAIN_PROLOG_QUERY.system) return Promise.resolve(null); // Null explanation
            throw new Error("explainQuery - EXPLAIN_PROLOG_QUERY prompt error for null explanation test");
        });
      const result = await mcrService.explainQuery(sessionId, nlQuestion);
      expect(result.success).toBe(false);
      expect(result.message).toBe('Failed to generate an explanation for the query.');
      expect(result.error).toBe('LLM_EMPTY_RESPONSE');
      expect(result.strategyId).toBe('SIR-R1-Query');
    });

    it('should handle errors from llmService.generate (for EXPLAIN_PROLOG_QUERY)', async () => {
      llmService.generate
        .mockImplementationOnce(async (sysPrompt) => { // NL_TO_QUERY
            if (sysPrompt === prompts.NL_TO_QUERY.system) return Promise.resolve(prologQueryForExplain);
            throw new Error("explainQuery - NL_TO_QUERY prompt error for EXPLAIN_PROLOG_QUERY failure test");
        })
        .mockImplementationOnce(async (sysPrompt) => { // EXPLAIN_PROLOG_QUERY
            if (sysPrompt === prompts.EXPLAIN_PROLOG_QUERY.system) return Promise.reject(new Error('LLM explain failed'));
            throw new Error("explainQuery - EXPLAIN_PROLOG_QUERY prompt error for EXPLAIN_PROLOG_QUERY failure test");
        });
      const result = await mcrService.explainQuery(sessionId, nlQuestion);
      expect(result.success).toBe(false);
      expect(result.message).toContain('Error during query explanation: LLM explain failed');
      // This error is now wrapped by the main catch block in mcrService
      expect(result.error).toBe('STRATEGY_EXECUTION_ERROR');
      expect(result.strategyId).toBe('SIR-R1-Query');
    });

    it('should handle ontologyService error gracefully for NL_TO_QUERY prompt context', async () => {
      ontologyService.listOntologies.mockImplementation(
        () => {
          // Fail for the first call (NL_TO_QUERY prompt context for strategy execution)
          if (llmService.generate.mock.calls.length < 1 ||
              (llmService.generate.mock.calls.length === 1 && llmService.generate.mock.calls[0][0] === prompts.NL_TO_QUERY.system)
          ) {
            return Promise.reject(new Error('Ontology N2Q prompt error for explain'));
          }
          // Succeed for the second call (EXPLAIN_PROLOG_QUERY context for LLM)
          return Promise.resolve([{ name: 'global', rules: 'universal_rule.' }]);
        }
      );

      const result = await mcrService.explainQuery(sessionId, nlQuestion);
      expect(result.success).toBe(true);
      expect(result.explanation).toBe(explanation);
      expect(result.debugInfo.strategyId).toBe('SIR-R1-Query');
      expect(llmService.generate).toHaveBeenCalledTimes(2);
      expect(result.debugInfo.ontologyErrorForStrategy).toBe('Failed to load global ontologies for query translation context: Ontology N2Q prompt error for explain');
    });

    it('should handle ontologyService error gracefully for EXPLAIN_PROLOG_QUERY prompt context', async () => {
      ontologyService.listOntologies
        .mockResolvedValueOnce([{ name: 'global', rules: 'universal_rule.' }])
        .mockRejectedValueOnce(new Error('Ontology EXPLAIN prompt error'));

      const result = await mcrService.explainQuery(sessionId, nlQuestion);
      expect(result.success).toBe(true);
      expect(result.explanation).toBe(explanation);
      expect(result.debugInfo.strategyId).toBe('SIR-R1-Query');
      expect(llmService.generate).toHaveBeenCalledTimes(2);
      expect(result.debugInfo.ontologyErrorForPrompt).toEqual('Failed to load global ontologies for explanation prompt: Ontology EXPLAIN prompt error');
    });
  });

  describe('getPrompts', () => {
    it('should successfully return the prompts object', async () => {
      // The mcrService.getPrompts directly returns the imported prompts object.
      // We need to ensure our test is aware of the actual prompts module.
      const actualPrompts = require('../src/prompts').prompts; // Get the actual object

      const result = await mcrService.getPrompts();
      expect(result.success).toBe(true);
      expect(result.prompts).toBe(actualPrompts); // Check for object identity
      expect(result.prompts).toEqual(
        expect.objectContaining({
          // Check for some known keys
          NL_TO_LOGIC: expect.any(Object),
          NL_TO_QUERY: expect.any(Object),
        })
      );
    });

    // It's hard to simulate an error for a direct import and return unless
    // we did something like try to mock the require itself, which is overly complex.
    // The function is simple enough that the success case largely covers it.
  });

  describe('debugFormatPrompt', () => {
    const templateName = 'NL_TO_QUERY'; // Using a real template name from prompts
    const inputVariables = {
      naturalLanguageQuestion: 'Test question?',
      existingFacts: 'fact1.',
      ontologyRules: 'rule1.',
    };

    // Mock the actual prompts structure for this test suite
    const mockPrompts = {
      NL_TO_QUERY: {
        system: 'System prompt for NL_TO_QUERY',
        user: 'User asks: {{naturalLanguageQuestion}}. Facts: {{existingFacts}}. Ontology: {{ontologyRules}}',
      },
      BASIC_TEMPLATE: {
        system: 'Basic system',
        user: 'Hello {{name}}!',
      },
      NO_USER_TEMPLATE: {
        system: 'System only',
      },
    };

    // Store original prompts and spy setup
    let originalPromptsImport;
    let fillTemplateSpy;

    beforeAll(() => {
      originalPromptsImport = jest.requireActual('../src/prompts');
      // It's important that mcrService, when loaded by tests, uses our mockPrompts object
      // and our spied fillTemplate. This is handled in beforeEach.
    });

    afterAll(() => {
      // Restore original prompts module if necessary, though jest.resetModules in beforeEach
      // largely handles isolation. If fillTemplateSpy was on the original module, restore it.
      if (fillTemplateSpy) {
        fillTemplateSpy.mockRestore();
      }
    });

    let mcrServiceInstance; // To be used by tests in this suite

    beforeEach(() => {
      jest.resetModules(); // Reset modules so mcrService re-imports the modified prompts

      // Mock dependencies of mcrService
      jest.doMock('../src/llmService', () => ({ generate: jest.fn() }));
      jest.doMock('../src/reasonerService', () => ({
        executeQuery: jest.fn(),
      }));
      jest.doMock('../src/sessionManager', () => ({
        getSession: jest.fn(),
        getKnowledgeBase: jest.fn(),
        addFacts: jest.fn(),
        createSession: jest.fn(),
        deleteSession: jest.fn(),
      }));
      jest.doMock('../src/ontologyService', () => ({
        listOntologies: jest.fn(),
      }));
      jest.doMock('../src/logger', () => ({
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
      }));
      jest.doMock('../src/config', () => ({
        translationStrategy: 'SIR-R1',
        llm: {},
        reasoner: {},
        ontology: {},
      })); // Ensure translationStrategy is defined for mcrService import

      // Spy on fillTemplate from the actual prompts module, then mock the module
      // to use this spy and the mockPrompts object.
      if (fillTemplateSpy) fillTemplateSpy.mockRestore(); // Clean up previous spy if any
      fillTemplateSpy = jest.spyOn(originalPromptsImport, 'fillTemplate');

      jest.doMock('../src/prompts', () => ({
        prompts: mockPrompts, // Use the mockPrompts object defined in this suite
        fillTemplate: fillTemplateSpy, // Use the spied version of fillTemplate
        // Also export other things if mcrService imports them directly, e.g., specific prompt objects
        // For this test, mcrService calls fillTemplate, and accesses prompts[templateName]
      }));

      mcrServiceInstance = require('../src/mcrService'); // mcrService will now use the mocked prompts module
    });

    it('should successfully format a prompt template', async () => {
      const result = await mcrServiceInstance.debugFormatPrompt(
        templateName,
        inputVariables
      );
      expect(result.success).toBe(true);
      expect(result.templateName).toBe(templateName);
      expect(result.rawTemplate).toEqual(mockPrompts[templateName]);
      expect(result.formattedUserPrompt).toBe(
        'User asks: Test question?. Facts: fact1.. Ontology: rule1.'
      );
      expect(result.inputVariables).toEqual(inputVariables);
    });

    it('should return template_not_found for an invalid template name', async () => {
      const result = await mcrServiceInstance.debugFormatPrompt(
        'INVALID_TEMPLATE',
        inputVariables
      );
      expect(result.success).toBe(false);
      expect(result.message).toBe(
        'Prompt template "INVALID_TEMPLATE" not found.'
      );
      expect(result.error).toBe('TEMPLATE_NOT_FOUND');
    });

    it('should return error for invalid templateName input (null)', async () => {
      const result = await mcrServiceInstance.debugFormatPrompt(
        null,
        inputVariables
      );
      expect(result.success).toBe(false);
      expect(result.message).toBe('Template name must be a non-empty string.');
      expect(result.error).toBe('INVALID_TEMPLATE_NAME');
    });

    it('should return error for invalid inputVariables (null)', async () => {
      const result = await mcrServiceInstance.debugFormatPrompt(
        templateName,
        null
      );
      expect(result.success).toBe(false);
      expect(result.message).toBe('Input variables must be an object.');
      expect(result.error).toBe('INVALID_INPUT_VARIABLES');
    });

    it('should return error for invalid inputVariables (not an object)', async () => {
      const result = await mcrServiceInstance.debugFormatPrompt(
        templateName,
        'not-an-object'
      );
      expect(result.success).toBe(false);
      expect(result.message).toBe('Input variables must be an object.');
      expect(result.error).toBe('INVALID_INPUT_VARIABLES');
    });

    it('should return template_user_field_missing if template has no user field', async () => {
      const result = await mcrServiceInstance.debugFormatPrompt(
        'NO_USER_TEMPLATE',
        {}
      );
      expect(result.success).toBe(false);
      expect(result.message).toBe(
        'Prompt template "NO_USER_TEMPLATE" does not have a \'user\' field to format.'
      );
      expect(result.error).toBe('TEMPLATE_USER_FIELD_MISSING');
    });

    it('should handle errors during fillTemplate (e.g. missing variable)', async () => {
      // fillTemplate itself throws an error if a variable is missing.
      // This test ensures that mcrService.debugFormatPrompt catches it.
      const templateToTest = 'BASIC_TEMPLATE';
      const vars = { wrong_name: 'Test' }; // 'name' is missing

      const result = await mcrServiceInstance.debugFormatPrompt(
        templateToTest,
        vars
      );

      const { fillTemplate: spiedFillTemplate } = require('../src/prompts');

      expect(spiedFillTemplate).toHaveBeenCalledWith(
        mockPrompts[templateToTest].user,
        vars
      );
      expect(result.success).toBe(false);
      expect(result.message).toMatch(/Error formatting prompt:/i);
      expect(result.details).toMatch(
        /Placeholder '\{\{name\}\}' not found in input variables/i
      );
      expect(result.error).toBe('PROMPT_FORMATTING_FAILED');
    });
  });

  // --- Tests for assertNLToSessionWithSIR ---
  // These tests are now obsolete as assertNLToSessionWithSIR has been removed.
  // The functionality is covered by testing assertNLToSession with the 'SIR-R1' strategy.
});
