// Mock dependencies FIRST
jest.mock('../src/llmService', () => ({
  generate: jest.fn(),
  // Add any other functions from llmService that mcrService directly calls
}));
jest.mock('../src/config', () => ({
  llm: {
    provider: 'test-provider',
    anthropic: { apiKey: 'test-key', defaultModel: 'test-model' },
    openai: { apiKey: 'test-key', defaultModel: 'test-model' },
    gemini: { apiKey: 'test-key', defaultModel: 'test-model' },
    ollama: { host: 'test-host', defaultModel: 'test-model' },
  },
  reasoner: {
    provider: 'test-reasoner-provider',
    prolog: { implementation: 'test-prolog-impl' },
  },
  logLevel: 'info',
  server: { port: 3000, host: 'localhost' },
  session: { storagePath: './test-sessions', defaultTimeoutMinutes: 60 },
  ontology: { storagePath: './test-ontologies', autoLoad: true },
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

    beforeEach(() => {
      // Setup default successful mock behaviors
      sessionManager.getSession.mockReturnValue({ id: sessionId, facts: [] });
      ontologyService.listOntologies.mockResolvedValue([
        { name: 'global', rules: 'universal_rule.' },
      ]);
      // Default LLM mock for assert: SIR-R1 strategy expects JSON
      llmService.generate.mockImplementation(async (systemPrompt) => {
        if (systemPrompt === prompts.NL_TO_SIR_ASSERT.system) {
          return JSON.stringify({
            statementType: 'fact',
            fact: { predicate: 'is_blue', arguments: ['sky'] },
          });
        }
        return prologFact; // Fallback for other prompts if not SIR
      });
      sessionManager.addFacts.mockReturnValue(true);
      sessionManager.getKnowledgeBase.mockReturnValue('');
    });

    it('should successfully assert a natural language statement using SIR-R1 strategy', async () => {
      const result = await mcrService.assertNLToSession(sessionId, nlText);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Facts asserted successfully.');
      expect(result.addedFacts).toEqual([prologFact]); // SIR converted to Prolog
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
      expect(llmService.generate).not.toHaveBeenCalled();
    });

    it('should return error from strategy if LLM returns invalid SIR JSON', async () => {
      llmService.generate.mockImplementation(async (systemPrompt) => {
        if (systemPrompt === prompts.NL_TO_SIR_ASSERT.system) {
          return 'This is not valid JSON'; // Invalid JSON for SIR
        }
        return prologFact;
      });
      const result = await mcrService.assertNLToSession(
        sessionId,
        'Is the sky blue?'
      );
      expect(result.success).toBe(false);
      expect(result.message).toMatch(/Error during assertion:/i);
      expect(result.details).toMatch(/No valid JSON object or array found/i);
      expect(result.error).toBe('STRATEGY_ASSERT_FAILED');
      expect(sessionManager.addFacts).not.toHaveBeenCalled();
    });

    it('should return no_facts_extracted_by_strategy if SIR strategy returns non-assertable SIR', async () => {
      llmService.generate.mockImplementation(async (systemPrompt) => {
        if (systemPrompt === prompts.NL_TO_SIR_ASSERT.system) {
          // Simulate SIR that results in no assertable facts (e.g., comment)
          return JSON.stringify({
            statementType: 'comment',
            text: 'ignore this',
          });
        }
        return prologFact;
      });
      const result = await mcrService.assertNLToSession(sessionId, nlText);
      expect(result.success).toBe(false);
      expect(result.message).toMatch(/Error during assertion:/i);
      // SIRR1Strategy specific error for invalid structure
      expect(result.details).toMatch(/Invalid SIR JSON structure/i);
      expect(result.error).toBe('STRATEGY_ASSERT_FAILED');
      expect(sessionManager.addFacts).not.toHaveBeenCalled();
    });

    it('should return session_add_failed if sessionManager.addFacts returns false', async () => {
      // LLM generates valid SIR -> Prolog
      llmService.generate.mockImplementation(async (systemPrompt) => {
        if (systemPrompt === prompts.NL_TO_SIR_ASSERT.system) {
          return JSON.stringify({
            statementType: 'fact',
            fact: { predicate: 'is_blue', arguments: ['sky'] },
          });
        }
        return prologFact;
      });
      sessionManager.addFacts.mockReturnValue(false); // But adding to session fails
      reasonerService.validateKnowledgeBase.mockResolvedValue({ isValid: true }); // Ensure validation passes

      const result = await mcrService.assertNLToSession(sessionId, nlText);
      expect(result.success).toBe(false);
      expect(result.message).toBe(
        'Failed to add facts to session manager after validation.'
      );
      expect(result.error).toBe('SESSION_ADD_FACTS_FAILED');
    });

    it('should handle errors from ontologyService.listOntologies gracefully and still assert', async () => {
      ontologyService.listOntologies.mockRejectedValue(
        new Error('Ontology service error')
      );
      // LLM mock for SIR-R1 needs to be in place
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
      expect(llmService.generate).toHaveBeenCalled();
      expect(sessionManager.addFacts).toHaveBeenCalledWith(sessionId, [
        prologFact,
      ]);
    });

    it('should handle errors from llmService.generate (network error, etc.)', async () => {
      llmService.generate.mockRejectedValue(new Error('LLM generation failed'));
      const result = await mcrService.assertNLToSession(sessionId, nlText);
      expect(result.success).toBe(false);
      // The message will be from the strategy or mcrService's catch block
      expect(result.message).toContain(
        'Error during assertion: LLM generation failed'
      );
      expect(sessionManager.addFacts).not.toHaveBeenCalled();
    });

    it('should return validation error if reasonerService.validateKnowledgeBase returns isValid: false', async () => {
      // Setup mocks for this specific test
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
      // Crucially, mock validateKnowledgeBase to return a validation failure
      const validationErrorMsg = 'Syntax error in asserted fact';
      reasonerService.validateKnowledgeBase.mockResolvedValue({
        isValid: false,
        error: validationErrorMsg,
      });

      const result = await mcrService.assertNLToSession(
        sessionId,
        'A test statement.'
      );

      expect(result.success).toBe(false);
      expect(result.message).toBe(
        'Failed to assert facts: Generated Prolog is invalid.'
      );
      expect(result.error).toBe('INVALID_GENERATED_PROLOG');
      expect(result.details).toContain(
        'Generated Prolog is invalid: "is_valid(test)."'
      );
      expect(result.details).toContain(validationErrorMsg);
      expect(reasonerService.validateKnowledgeBase).toHaveBeenCalledWith(
        'is_valid(test).'
      );
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

    beforeEach(() => {
      // Access the mocked config directly to set debugLevel for this suite
      const currentConfig = require('../src/config');
      currentConfig.debugLevel = 'verbose'; // Ensure verbose debugging for these tests

      sessionManager.getSession.mockReturnValue({
        id: sessionId,
        facts: ['is_blue(sky).'],
      });
      sessionManager.getKnowledgeBase.mockReturnValue('is_blue(sky).');
      ontologyService.listOntologies.mockResolvedValue([
        { name: 'global', rules: 'universal_rule.' },
      ]);

      // LLM generates query, then answer
      llmService.generate.mockImplementation(
        async (systemPrompt, userPrompt) => {
          // Restored userPrompt
          // Check system prompt to differentiate calls
          if (systemPrompt === prompts.NL_TO_QUERY.system) {
            return Promise.resolve(prologQuery); // NL to Query
          }
          if (systemPrompt === prompts.LOGIC_TO_NL_ANSWER.system) {
            // Ensure the results are part of the prompt for this specific call
            if (userPrompt.includes(JSON.stringify(reasonerResults))) {
              return Promise.resolve(nlAnswer); // Logic to NL Answer
            }
          }
          // Fallback for unexpected calls during these tests
          // console.warn('Unexpected LLM generate call in querySessionWithNL test:', { systemPrompt, userPrompt });
          return Promise.reject(
            new Error(
              `Unexpected LLM generate call in querySessionWithNL test. System: ${systemPrompt}`
            )
          );
        }
      );
      reasonerService.executeQuery.mockResolvedValue(reasonerResults);
    });

    it('should successfully query a session with NL', async () => {
      const result = await mcrService.querySessionWithNL(sessionId, nlQuestion);

      expect(result.success).toBe(true);
      expect(result.answer).toBe(nlAnswer);
      expect(sessionManager.getSession).toHaveBeenCalledWith(sessionId);
      expect(llmService.generate).toHaveBeenCalledTimes(2); // NL_TO_QUERY and LOGIC_TO_NL_ANSWER
      expect(reasonerService.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining(
          'is_blue(sky).\n% --- Global Ontologies ---\nuniversal_rule.'
        ),
        prologQuery
      );
      expect(result.debugInfo.prologQuery).toBe(prologQuery);
      expect(result.debugInfo.prologResults).toEqual(reasonerResults);
    });

    it('should successfully query with dynamic ontology', async () => {
      const result = await mcrService.querySessionWithNL(
        sessionId,
        nlQuestion,
        { dynamicOntology: dynamicOntologyText }
      );
      expect(result.success).toBe(true);
      expect(result.answer).toBe(nlAnswer);
      expect(reasonerService.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining(dynamicOntologyText),
        prologQuery
      );
      expect(result.debugInfo.dynamicOntologyProvided).toBe(true);
    });

    it('should return session not found if sessionManager.getSession returns null', async () => {
      sessionManager.getSession.mockReturnValue(null);
      const result = await mcrService.querySessionWithNL(sessionId, nlQuestion);
      expect(result.success).toBe(false);
      expect(result.message).toBe('Session not found.');
      expect(llmService.generate).not.toHaveBeenCalled();
    });

    it('should return error if LLM fails to translate NL to Prolog query', async () => {
      llmService.generate.mockImplementation(
        async (systemPrompt, userPrompt) => {
          if (
            systemPrompt === prompts.NL_TO_QUERY.system &&
            userPrompt.includes(nlQuestion)
          ) {
            // Ensure this mock is specific enough if nlQuestion is key.
            return Promise.resolve('not_a_valid_query_format'); // Malformed query (missing period for Prolog)
          }
          if (systemPrompt === prompts.LOGIC_TO_NL_ANSWER.system) {
            return Promise.resolve(nlAnswer); // This part is for the successful generation of the NL answer later
          }
          // Fallback or error for unexpected calls
          return Promise.reject(
            new Error(
              `Unexpected LLM call in query test (translate fail): System: ${systemPrompt}`
            )
          );
        }
      );

      const result = await mcrService.querySessionWithNL(sessionId, nlQuestion);

      expect(result.success).toBe(false);
      expect(result.message).toMatch(/Error during query:/i);
      expect(result.details).toMatch(
        /Failed to translate question to a valid Prolog query/i
      );
      expect(result.error).toBe('STRATEGY_QUERY_FAILED');
      expect(reasonerService.executeQuery).not.toHaveBeenCalled();
    });

    it('should return error if LLM generates null for Prolog query', async () => {
      llmService.generate.mockImplementation(
        async (systemPrompt /*, userPrompt */) => {
          // userPrompt unused here
          if (systemPrompt === prompts.NL_TO_QUERY.system) {
            return Promise.resolve(null); // LLM returns null
          }
          if (systemPrompt === prompts.LOGIC_TO_NL_ANSWER.system) {
            return Promise.resolve(nlAnswer); // Should not be reached
          }
          return Promise.reject(
            new Error('Unexpected LLM call in query test (null query)')
          );
        }
      );
      const result = await mcrService.querySessionWithNL(sessionId, nlQuestion);
      expect(result.success).toBe(false);
      expect(result.message).toMatch(/Error during query:/i);
      expect(result.details).toMatch(/Cannot read properties of null/i); // Error from strategy
      expect(result.error).toBe('STRATEGY_QUERY_FAILED');
    });

    it('should handle error from reasonerService.executeQuery', async () => {
      reasonerService.executeQuery.mockRejectedValue(
        new Error('Reasoner boom!')
      );
      const result = await mcrService.querySessionWithNL(sessionId, nlQuestion);
      expect(result.success).toBe(false);
      expect(result.message).toMatch(/Error during query: Reasoner boom!/i);
      expect(result.details).toMatch(/Reasoner boom!/i);
      expect(result.error).toBe('STRATEGY_QUERY_FAILED');
    });

    it('should handle error from ontologyService.listOntologies gracefully during NL_TO_QUERY prompt building', async () => {
      ontologyService.listOntologies.mockImplementationOnce(() =>
        Promise.reject(new Error('Ontology N2Q prompt error'))
      );
      // Should still proceed, just without ontology context for the NL_TO_QUERY prompt
      // The second call to listOntologies (for augmenting KB) will use the default mock (success)

      const result = await mcrService.querySessionWithNL(sessionId, nlQuestion);
      expect(result.success).toBe(true); // Query should still succeed
      expect(result.answer).toBe(nlAnswer);
      // Check that LLM for NL_TO_QUERY was called (it would be, but with potentially less context)
      // And LLM for LOGIC_TO_NL
      expect(llmService.generate).toHaveBeenCalledTimes(2);
      // Check that reasoner was called
      expect(reasonerService.executeQuery).toHaveBeenCalled();
      expect(result.debugInfo.ontologyError).toBeUndefined(); // Error is for prompt, not KB augmentation here
    });

    it('should handle error from ontologyService.listOntologies gracefully during KB augmentation', async () => {
      // First call for NL_TO_QUERY prompt is fine
      ontologyService.listOntologies.mockImplementationOnce(() =>
        Promise.resolve([{ name: 'global', rules: 'universal_rule.' }])
      );
      // Second call for KB augmentation fails
      ontologyService.listOntologies.mockImplementationOnce(() =>
        Promise.reject(new Error('Ontology KB augment error'))
      );

      const result = await mcrService.querySessionWithNL(sessionId, nlQuestion);
      expect(result.success).toBe(true); // Query should still succeed
      expect(result.answer).toBe(nlAnswer);
      expect(llmService.generate).toHaveBeenCalledTimes(2);
      expect(reasonerService.executeQuery).toHaveBeenCalledWith(
        // Knowledge base should not contain global ontologies due to the error
        expect.not.stringContaining('universal_rule.'),
        prologQuery
      );
      expect(result.debugInfo.ontologyError).toBe(
        'Failed to load global ontologies: Ontology KB augment error'
      );
    });

    it('should handle error from the second llmService.generate (LOGIC_TO_NL)', async () => {
      llmService.generate
        .mockImplementationOnce(() => Promise.resolve(prologQuery)) // NL_TO_QUERY (success)
        .mockImplementationOnce(() =>
          Promise.reject(new Error('LLM L2NL failed'))
        ); // LOGIC_TO_NL (fails)

      const result = await mcrService.querySessionWithNL(sessionId, nlQuestion);
      expect(result.success).toBe(false);
      expect(result.message).toMatch(/Error during query: LLM L2NL failed/i);
      expect(result.details).toMatch(/LLM L2NL failed/i);
      expect(result.error).toBe('STRATEGY_QUERY_FAILED');
    });
  });

  describe('translateNLToRulesDirect', () => {
    const nlText = 'All birds can fly.';
    const prologRule = 'can_fly(X) :- bird(X).';

    beforeEach(() => {
      llmService.generate.mockReset();
      // Default mock for translateNLToRulesDirect: SIR-R1 strategy expects JSON
      llmService.generate.mockImplementation(async (systemPrompt) => {
        if (systemPrompt === prompts.NL_TO_SIR_ASSERT.system) {
          return JSON.stringify({
            statementType: 'rule',
            rule: {
              head: { predicate: 'can_fly', arguments: ['X'] },
              body: [{ type: 'fact', predicate: 'bird', arguments: ['X'] }],
            },
          });
        }
        return prologRule; // Fallback for other prompts
      });
    });

    it('should successfully translate NL to Prolog rules directly using SIR-R1 strategy', async () => {
      const result = await mcrService.translateNLToRulesDirect(nlText);
      expect(result.success).toBe(true);
      expect(result.rules).toEqual([prologRule]); // SIR converted to Prolog rule
      // expect(result.rawOutput).toEqual(prologRule); // rawOutput is not part of success from SIR-R1
      expect(llmService.generate).toHaveBeenCalledWith(
        prompts.NL_TO_SIR_ASSERT.system, // SIR-R1 uses assert prompt for direct rule translation
        expect.stringContaining(nlText)
      );
    });

    it('should return no_rules_extracted_by_strategy if SIR strategy returns no valid rules', async () => {
      llmService.generate.mockImplementation(async (systemPrompt) => {
        if (systemPrompt === prompts.NL_TO_SIR_ASSERT.system) {
          return JSON.stringify({ statementType: 'comment', text: 'ignore' }); // Not a rule
        }
        return 'This is not a rule.';
      });
      const result = await mcrService.translateNLToRulesDirect(nlText);
      expect(result.success).toBe(false);
      expect(result.message).toMatch(/Error during NL to Rules translation:/i);
      expect(result.details).toMatch(/Invalid SIR JSON structure/i); // Strategy's specific error
      expect(result.error).toBe('NL_TO_RULES_TRANSLATION_FAILED');
    });

    it('should handle LLM returning invalid SIR JSON for direct rule translation', async () => {
      llmService.generate.mockImplementation(async (systemPrompt) => {
        if (systemPrompt === prompts.NL_TO_SIR_ASSERT.system) {
          return 'Invalid JSON'; // Not a valid JSON string
        }
        return prologRule;
      });
      const result =
        await mcrService.translateNLToRulesDirect('Is the sky blue?');
      expect(result.success).toBe(false);
      expect(result.message).toMatch(/Error during NL to Rules translation:/i);
      expect(result.details).toMatch(/No valid JSON object or array found/i); // Strategy's specific error
      expect(result.error).toBe('NL_TO_RULES_TRANSLATION_FAILED');
    });

    it('should handle errors from llmService.generate during direct rule translation', async () => {
      llmService.generate.mockRejectedValue(
        new Error('LLM direct translation failed')
      );
      const result = await mcrService.translateNLToRulesDirect(nlText);
      expect(result.success).toBe(false);
      expect(result.message).toContain(
        'Error during NL to Rules translation: LLM direct translation failed'
      );
    });
  });

  describe('translateRulesToNLDirect', () => {
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
    const prologQueryForExplain = 'explain(color(sky,blue)).'; // Example, actual might differ
    const explanation = 'The sky is blue due to Rayleigh scattering.';

    beforeEach(() => {
      sessionManager.getSession.mockReturnValue({
        id: sessionId,
        facts: ['is_blue(sky).'],
      });
      sessionManager.getKnowledgeBase.mockReturnValue('is_blue(sky).');
      ontologyService.listOntologies.mockResolvedValue([
        { name: 'global', rules: 'universal_rule.' },
      ]);
      // LLM generates query, then explanation
      llmService.generate.mockImplementation((systemPrompt, userPrompt) => {
        if (
          userPrompt.includes(nlQuestion) &&
          systemPrompt === prompts.NL_TO_QUERY.system
        ) {
          return Promise.resolve(prologQueryForExplain); // NL to Query
        }
        if (
          userPrompt.includes(prologQueryForExplain) &&
          systemPrompt === prompts.EXPLAIN_PROLOG_QUERY.system
        ) {
          return Promise.resolve(explanation); // Prolog Query to Explanation
        }
        return Promise.reject(
          new Error('Unexpected LLM generate call in explainQuery test')
        );
      });
    });

    it('should successfully generate a query explanation', async () => {
      const result = await mcrService.explainQuery(sessionId, nlQuestion);
      expect(result.success).toBe(true);
      expect(result.explanation).toBe(explanation);
      expect(sessionManager.getSession).toHaveBeenCalledWith(sessionId);
      expect(llmService.generate).toHaveBeenCalledTimes(2); // NL_TO_QUERY and EXPLAIN_PROLOG_QUERY
      expect(result.debugInfo.prologQuery).toBe(prologQueryForExplain);
    });

    it('should return session not found if sessionManager.getSession returns null', async () => {
      sessionManager.getSession.mockReturnValue(null);
      const result = await mcrService.explainQuery(sessionId, nlQuestion);
      expect(result.success).toBe(false);
      expect(result.message).toBe('Session not found.');
      expect(result.error).toBe('SESSION_NOT_FOUND');
      expect(llmService.generate).not.toHaveBeenCalled();
    });

    it('should return error if LLM fails to translate NL to Prolog query for explanation', async () => {
      llmService.generate.mockImplementation(
        async (systemPrompt, userPrompt) => {
          if (
            systemPrompt === prompts.NL_TO_QUERY.system &&
            userPrompt.includes(nlQuestion)
          ) {
            // This setup will cause SIRR1Strategy.query to throw an error
            // because 'not_a_valid_query_for_explain' is not valid Prolog.
            // The strategy itself should throw, and mcrService will catch it.
            throw new Error(
              'Failed to translate question to a valid Prolog query'
            );
          }
          // This part should not be reached if the above throws
          if (systemPrompt === prompts.EXPLAIN_PROLOG_QUERY.system) {
            return Promise.resolve(explanation);
          }
          return Promise.reject(
            new Error(
              `Unexpected LLM call in explainQuery (translate fail): ${systemPrompt}`
            )
          );
        }
      );
      const result = await mcrService.explainQuery(sessionId, nlQuestion);
      expect(result.success).toBe(false);
      expect(result.message).toMatch(/Error during query explanation:/i);
      expect(result.details).toMatch(
        /Failed to translate question to a valid Prolog query/i
      );
      expect(result.error).toBe('EXPLAIN_QUERY_FAILED');
    });

    it('should return error if LLM generates null for Prolog query for explanation', async () => {
      llmService.generate.mockImplementation(
        async (systemPrompt, userPrompt) => {
          if (
            systemPrompt === prompts.NL_TO_QUERY.system &&
            userPrompt.includes(nlQuestion)
          ) {
            // SIRR1Strategy.query will throw if it receives null and cannot process it.
            throw new Error('Cannot read properties of null');
          }
          // Should not be reached
          if (systemPrompt === prompts.EXPLAIN_PROLOG_QUERY.system) {
            return Promise.resolve(explanation);
          }
          return Promise.reject(
            new Error('Unexpected LLM call in explainQuery (null query)')
          );
        }
      );
      const result = await mcrService.explainQuery(sessionId, nlQuestion);
      expect(result.success).toBe(false);
      expect(result.message).toMatch(/Error during query explanation:/i);
      expect(result.details).toMatch(/Cannot read properties of null/i); // Strategy's error
      expect(result.error).toBe('EXPLAIN_QUERY_FAILED');
    });

    it('should return error if LLM fails to generate an explanation (empty string)', async () => {
      llmService.generate
        .mockImplementationOnce(() => Promise.resolve(prologQueryForExplain)) // NL_TO_QUERY (success)
        .mockImplementationOnce(() => Promise.resolve('')); // EXPLAIN_PROLOG_QUERY (returns empty)
      const result = await mcrService.explainQuery(sessionId, nlQuestion);
      expect(result.success).toBe(false);
      expect(result.message).toBe(
        'Failed to generate an explanation for the query.'
      );
      expect(result.error).toBe('EMPTY_EXPLANATION_GENERATED');
    });

    it('should return error if LLM fails to generate an explanation (null)', async () => {
      llmService.generate
        .mockImplementationOnce(() => Promise.resolve(prologQueryForExplain)) // NL_TO_QUERY (success)
        .mockImplementationOnce(() => Promise.resolve(null)); // EXPLAIN_PROLOG_QUERY (returns null)
      const result = await mcrService.explainQuery(sessionId, nlQuestion);
      expect(result.success).toBe(false);
      expect(result.message).toBe(
        'Failed to generate an explanation for the query.'
      );
      expect(result.error).toBe('EMPTY_EXPLANATION_GENERATED');
    });

    it('should handle errors from llmService.generate (for EXPLAIN_PROLOG_QUERY)', async () => {
      llmService.generate
        .mockImplementationOnce(() => Promise.resolve(prologQueryForExplain)) // NL_TO_QUERY (success)
        .mockImplementationOnce(() =>
          Promise.reject(new Error('LLM explain failed'))
        ); // EXPLAIN_PROLOG_QUERY (rejects)
      const result = await mcrService.explainQuery(sessionId, nlQuestion);
      expect(result.success).toBe(false);
      expect(result.message).toContain(
        'Error during query explanation: LLM explain failed'
      );
    });

    it('should handle ontologyService error gracefully for NL_TO_QUERY prompt context', async () => {
      ontologyService.listOntologies.mockImplementation(
        (/* includeRules */) => {
          // includeRules is unused in this mock
          // Fail for the first call (NL_TO_QUERY prompt context), succeed for the second (EXPLAIN_PROLOG_QUERY context)
          if (llmService.generate.mock.calls.length < 1) {
            // Heuristic: if LLM hasn't been called for NL_TO_QUERY yet
            return Promise.reject(
              new Error('Ontology N2Q prompt error for explain')
            );
          }
          return Promise.resolve([
            { name: 'global', rules: 'universal_rule.' },
          ]);
        }
      );

      const result = await mcrService.explainQuery(sessionId, nlQuestion);
      expect(result.success).toBe(true); // Explanation should still succeed
      expect(result.explanation).toBe(explanation);
      expect(llmService.generate).toHaveBeenCalledTimes(2);
      expect(result.debugInfo.ontologyErrorForStrategy).toBe(
        'Failed to load global ontologies for query translation context: Ontology N2Q prompt error for explain'
      );
    });

    it('should handle ontologyService error gracefully for EXPLAIN_PROLOG_QUERY prompt context', async () => {
      ontologyService.listOntologies
        .mockResolvedValueOnce([{ name: 'global', rules: 'universal_rule.' }]) // For NL_TO_QUERY context
        .mockRejectedValueOnce(new Error('Ontology EXPLAIN prompt error')); // For EXPLAIN_PROLOG_QUERY context

      const result = await mcrService.explainQuery(sessionId, nlQuestion);
      expect(result.success).toBe(true); // Explanation should still succeed
      expect(result.explanation).toBe(explanation);
      expect(llmService.generate).toHaveBeenCalledTimes(2);
      // The debugInfo.ontologyError would be set by the second failing call in the real service
      // The current mock setup for listOntologies might need refinement if we want to precisely track which call failed within debugInfo.
      // For this test, we verify it proceeds and succeeds.
      // The service logs a warning and proceeds. If the strategy handles the missing ontology context gracefully
      // for the NL_TO_QUERY part, and the EXPLAIN_PROLOG_QUERY part gets its context (or also handles missing),
      // the overall operation can succeed. The debugInfo.ontologyError should reflect the last error encountered
      // related to ontologies if mcrService sets it.
      // In this mock, the second call to listOntologies (for EXPLAIN_PROLOG_QUERY context) is the one failing.
      expect(result.debugInfo.ontologyErrorForPrompt).toEqual(
        'Failed to load global ontologies for explanation prompt: Ontology EXPLAIN prompt error'
      );
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
