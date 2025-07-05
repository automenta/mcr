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
}));
jest.mock('../src/sessionManager', () => ({
  getSession: jest.fn(),
  getKnowledgeBase: jest.fn(),
  addFacts: jest.fn(),
  createSession: jest.fn(),
  deleteSession: jest.fn(),
}));
jest.mock('../src/ontologyService', () => ({
  listOntologies: jest.fn(),
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
      llmService.generate.mockResolvedValue(prologFact);
      sessionManager.addFacts.mockReturnValue(true);
      sessionManager.getKnowledgeBase.mockReturnValue('');
    });

    it('should successfully assert a natural language statement', async () => {
      // SIRR1Strategy expects JSON output from LLM
      const sirFactJsonString = JSON.stringify({
        statementType: 'fact',
        fact: { predicate: 'is_blue', arguments: ['sky'] },
      });
      // Adjusting the mock for llmService.generate to return SIR JSON
      // and to be specific about which prompt it's responding to if necessary.
      llmService.generate.mockImplementation(async (systemPrompt, userPrompt) => {
        if (systemPrompt === prompts.NL_TO_SIR_ASSERT.system) {
          return sirFactJsonString;
        }
        // Fallback for other generate calls if any in this test's scope
        return prologFact; // Should not be reached if strategy is SIR-R1 for assert
      });

      const result = await mcrService.assertNLToSession(sessionId, nlText);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Facts asserted successfully.');
      // The final prolog fact converted from SIR should still be the same
      expect(result.addedFacts).toEqual([prologFact]);
      expect(sessionManager.getSession).toHaveBeenCalledWith(sessionId);
      expect(llmService.generate).toHaveBeenCalledWith(
        prompts.NL_TO_SIR_ASSERT.system, // Check it was called with the SIR prompt
        expect.any(String) // User prompt for SIR
        // If your llmProvider.generate now takes an options object with jsonMode:
        // expect.objectContaining({ jsonMode: true }) // if SIR strategy passes this option
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

    it('should return conversion_to_fact_failed if LLM indicates text is a query', async () => {
      llmService.generate.mockResolvedValue('% Cannot convert query to fact.');
      const result = await mcrService.assertNLToSession(
        sessionId,
        'Is the sky blue?'
      );
      expect(result.success).toBe(false);
      expect(result.message).toBe(
        'Input text appears to be a query, not an assertable fact.'
      );
      expect(result.error).toBe('conversion_to_fact_failed');
      expect(sessionManager.addFacts).not.toHaveBeenCalled();
    });

    it('should return no_facts_extracted if LLM returns no valid Prolog facts', async () => {
      llmService.generate.mockResolvedValue('This is not a prolog fact');
      const result = await mcrService.assertNLToSession(sessionId, nlText);
      expect(result.success).toBe(false);
      expect(result.message).toBe('Could not translate text into valid facts.');
      expect(result.error).toBe('no_facts_extracted');
      expect(sessionManager.addFacts).not.toHaveBeenCalled();
    });

    it('should return session_add_failed if sessionManager.addFacts returns false', async () => {
      sessionManager.addFacts.mockReturnValue(false);
      const result = await mcrService.assertNLToSession(sessionId, nlText);
      expect(result.success).toBe(false);
      expect(result.message).toBe('Failed to add facts to session.');
      expect(result.error).toBe('session_add_failed');
    });

    it('should handle errors from ontologyService.listOntologies gracefully', async () => {
      ontologyService.listOntologies.mockRejectedValue(
        new Error('Ontology service error')
      );
      // Should still proceed and attempt to assert
      const result = await mcrService.assertNLToSession(sessionId, nlText);
      expect(result.success).toBe(true); // Assuming it can proceed without ontology context
      expect(llmService.generate).toHaveBeenCalled(); // Check that LLM was still called
      expect(sessionManager.addFacts).toHaveBeenCalledWith(sessionId, [
        prologFact,
      ]);
    });

    it('should handle errors from llmService.generate', async () => {
      llmService.generate.mockRejectedValue(new Error('LLM generation failed'));
      const result = await mcrService.assertNLToSession(sessionId, nlText);
      expect(result.success).toBe(false);
      expect(result.message).toContain(
        'Error during assertion: LLM generation failed'
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
      sessionManager.getSession.mockReturnValue({
        id: sessionId,
        facts: ['is_blue(sky).'],
      });
      sessionManager.getKnowledgeBase.mockReturnValue('is_blue(sky).');
      ontologyService.listOntologies.mockResolvedValue([
        { name: 'global', rules: 'universal_rule.' },
      ]);

      // LLM generates query, then answer
      llmService.generate.mockImplementation((systemPrompt, userPrompt) => {
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
      });
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
      llmService.generate.mockImplementationOnce(() =>
        Promise.resolve('not-a-valid-query')
      ); // NL to Query fails
      const result = await mcrService.querySessionWithNL(sessionId, nlQuestion);
      expect(result.success).toBe(false);
      expect(result.message).toBe(
        'Failed to translate question to a valid query.'
      );
      expect(result.error).toBe('invalid_prolog_query');
      expect(reasonerService.executeQuery).not.toHaveBeenCalled();
    });

    it('should return error if LLM generates null for Prolog query', async () => {
      llmService.generate.mockImplementationOnce(() => Promise.resolve(null)); // NL to Query returns null
      const result = await mcrService.querySessionWithNL(sessionId, nlQuestion);
      expect(result.success).toBe(false);
      expect(result.message).toBe(
        'Failed to translate question to a valid query.'
      );
      expect(result.error).toBe('invalid_prolog_query');
    });

    it('should handle error from reasonerService.executeQuery', async () => {
      reasonerService.executeQuery.mockRejectedValue(
        new Error('Reasoner boom!')
      );
      const result = await mcrService.querySessionWithNL(sessionId, nlQuestion);
      expect(result.success).toBe(false);
      expect(result.message).toContain('Error during query: Reasoner boom!');
      expect(result.error).toContain('Reasoner boom!');
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
      expect(result.message).toContain('Error during query: LLM L2NL failed');
      expect(result.error).toContain('LLM L2NL failed');
    });
  });

  describe('translateNLToRulesDirect', () => {
    const nlText = 'All birds can fly.';
    const prologRule = 'can_fly(X) :- bird(X).';

    beforeEach(() => {
      // Reset the specific mock for this suite to avoid interference from other suites.
      llmService.generate.mockReset();
      llmService.generate.mockResolvedValue(prologRule); // Default for this suite
    });

    it('should successfully translate NL to Prolog rules directly', async () => {
      const result = await mcrService.translateNLToRulesDirect(nlText);
      expect(result.success).toBe(true);
      expect(result.rules).toEqual([prologRule]);
      expect(result.rawOutput).toEqual(prologRule);
      expect(llmService.generate).toHaveBeenCalledWith(
        prompts.NL_TO_RULES_DIRECT.system,
        expect.stringContaining(nlText)
      );
    });

    it('should return no_rules_extracted if LLM returns no valid Prolog rules', async () => {
      llmService.generate.mockResolvedValue('This is not a rule.');
      const result = await mcrService.translateNLToRulesDirect(nlText);
      expect(result.success).toBe(false);
      expect(result.message).toBe('Could not translate text into valid rules.');
      expect(result.error).toBe('no_rules_extracted');
      expect(result.rawOutput).toBeUndefined(); // rawOutput is not returned on this error path
    });

    it('should not return no_rules_extracted if LLM returns only comments but they end with a period (treated as valid)', async () => {
      // This tests an edge case: if a comment is formatted like a Prolog statement (ends with '.'),
      // it will currently be considered a "rule" by the filter.
      const llmOutput = '% This is a comment only.'; // No period, so it's not a rule
      llmService.generate.mockResolvedValue(llmOutput);
      let result = await mcrService.translateNLToRulesDirect(nlText);
      expect(result.success).toBe(false); // Fails because no rules ending with '.'
      expect(result.message).toBe('Could not translate text into valid rules.');
      expect(result.error).toBe('no_rules_extracted');
      expect(result.rawOutput).toBeUndefined(); // rawOutput is not returned on this error path by current code

      const llmOutputWithPeriod = '% This is a comment only.'; // Period makes it a "rule"
      llmService.generate.mockResolvedValue(llmOutputWithPeriod);
      result = await mcrService.translateNLToRulesDirect(nlText);
      // The current logic will extract this as a rule because it ends with a period.
      // This might be desired or not, but it's the current behavior.
      expect(result.success).toBe(true);
      expect(result.rules).toEqual([llmOutputWithPeriod]);
      expect(result.rawOutput).toBe(llmOutputWithPeriod);
    });

    it('should handle LLM indicating text might be a query if NL_TO_LOGIC prompt is used', async () => {
      // This test is relevant if NL_TO_RULES_DIRECT.system is the same as NL_TO_LOGIC.system
      // For this test, we'll assume they are the same to test that specific branch.
      const originalSystemPrompt = prompts.NL_TO_RULES_DIRECT.system;
      prompts.NL_TO_RULES_DIRECT.system = prompts.NL_TO_LOGIC.system; // Temporarily align for test

      llmService.generate.mockResolvedValue('% Cannot convert query to fact.');
      const result =
        await mcrService.translateNLToRulesDirect('Is the sky blue?');

      // In the current implementation of translateNLToRulesDirect, this specific LLM message
      // does NOT result in an error. It returns success: true, and the raw message.
      expect(result.success).toBe(true);
      expect(result.rules).toEqual(['% Cannot convert query to fact.']); // The message itself becomes a "rule"
      expect(result.rawOutput).toBe('% Cannot convert query to fact.');

      prompts.NL_TO_RULES_DIRECT.system = originalSystemPrompt; // Restore
    });

    it('should handle errors from llmService.generate', async () => {
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
      expect(result.error).toBe('empty_rules_input');
      expect(llmService.generate).not.toHaveBeenCalled();
    });

    it('should return error for null input Prolog rules', async () => {
      const result = await mcrService.translateRulesToNLDirect(null);
      expect(result.success).toBe(false);
      expect(result.message).toBe(
        'Input Prolog rules must be a non-empty string.'
      );
      expect(result.error).toBe('empty_rules_input');
    });

    it('should return error if LLM fails to generate an explanation (empty string)', async () => {
      llmService.generate.mockResolvedValue('');
      const result = await mcrService.translateRulesToNLDirect(prologRules);
      expect(result.success).toBe(false);
      expect(result.message).toBe(
        'Failed to generate a natural language explanation.'
      );
      expect(result.error).toBe('empty_explanation_generated');
    });

    it('should return error if LLM fails to generate an explanation (null)', async () => {
      llmService.generate.mockResolvedValue(null);
      const result = await mcrService.translateRulesToNLDirect(prologRules);
      expect(result.success).toBe(false);
      expect(result.message).toBe(
        'Failed to generate a natural language explanation.'
      );
      expect(result.error).toBe('empty_explanation_generated');
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
      expect(result.error).toBe('session_not_found');
      expect(llmService.generate).not.toHaveBeenCalled();
    });

    it('should return error if LLM fails to translate NL to Prolog query for explanation', async () => {
      llmService.generate.mockImplementationOnce(() =>
        Promise.resolve('not-a-valid-query-for-explain')
      ); // NL to Query fails
      const result = await mcrService.explainQuery(sessionId, nlQuestion);
      expect(result.success).toBe(false);
      expect(result.message).toBe(
        'Failed to translate question to a valid query for explanation.'
      );
      expect(result.error).toBe('invalid_prolog_query_explain');
    });

    it('should return error if LLM generates null for Prolog query for explanation', async () => {
      llmService.generate.mockImplementationOnce(() => Promise.resolve(null)); // NL to Query returns null
      const result = await mcrService.explainQuery(sessionId, nlQuestion);
      expect(result.success).toBe(false);
      expect(result.message).toBe(
        'Failed to translate question to a valid query for explanation.'
      );
      expect(result.error).toBe('invalid_prolog_query_explain');
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
      expect(result.error).toBe('empty_explanation_generated');
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
      expect(result.error).toBe('empty_explanation_generated');
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
      ontologyService.listOntologies.mockImplementation((includeRules) => {
        // Fail for the first call (NL_TO_QUERY prompt context), succeed for the second (EXPLAIN_PROLOG_QUERY context)
        if (llmService.generate.mock.calls.length < 1) {
          // Heuristic: if LLM hasn't been called for NL_TO_QUERY yet
          return Promise.reject(
            new Error('Ontology N2Q prompt error for explain')
          );
        }
        return Promise.resolve([{ name: 'global', rules: 'universal_rule.' }]);
      });

      const result = await mcrService.explainQuery(sessionId, nlQuestion);
      expect(result.success).toBe(true); // Explanation should still succeed
      expect(result.explanation).toBe(explanation);
      expect(llmService.generate).toHaveBeenCalledTimes(2);
      expect(result.debugInfo.ontologyError).toBe(
        'Failed to load global ontologies: Ontology N2Q prompt error for explain'
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
      // The service logs a warning and proceeds, so an error here isn't explicitly in debugInfo unless we tailor the mock.
      // The error is logged, but the operation continues.
      expect(result.debugInfo.ontologyError).toBe(
        'Failed to load global ontologies: Ontology EXPLAIN prompt error'
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

    // Store original prompts and restore after tests for this describe block
    let originalPrompts;
    beforeAll(() => {
      originalPrompts = { ...require('../src/prompts').prompts }; // Shallow copy
      // Replace the prompts module's export for the duration of these tests
      require('../src/prompts').prompts = mockPrompts;
    });

    afterAll(() => {
      // Restore original prompts
      require('../src/prompts').prompts = originalPrompts;
    });

    let mcrServiceInstance; // To be used by tests in this suite

    beforeEach(() => {
      // Ensure prompts are the mocked version for each test
      // AND that mcrService is re-loaded to pick up these mocks.
      // require('../src/prompts').prompts = mockPrompts; // This was ineffective due to resetModules
      jest.resetModules(); // Reset modules so mcrService re-imports the modified prompts

      // Re-mock other dependencies of mcrService as they would be cleared by resetModules
      // Crucially, mock the prompts module here so mcrServiceInstance gets the mockPrompts
      const actualFillTemplate = require('../src/prompts').fillTemplate; // Get real fillTemplate before it's mocked
      jest.doMock('../src/prompts', () => ({
        prompts: mockPrompts, // Use the mockPrompts object defined in this suite
        fillTemplate: actualFillTemplate,
      }));
      // Use jest.doMock for mocks needed before the next require()
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
        llm: { provider: 'test-llm-provider' },
        reasoner: { provider: 'test-reasoner-provider' },
        logLevel: 'info',
        server: {},
        session: {},
        ontology: {},
      }));
      // Also mock the specific provider that causes issues if the reasonerService mock isn't enough
      // This helps if reasonerService.js itself tries to load its providers at module level
      jest.doMock('../src/reasonerProviders/prologReasoner', () => ({
        executeQuery: jest.fn(),
        isSupported: jest.fn(() => true),
      }));
      jest.doMock('../src/llmProviders/ollamaProvider', () => ({
        generateStructured: jest.fn(),
        isSupported: jest.fn(() => true),
      }));
      jest.doMock('../src/llmProviders/geminiProvider', () => ({
        generateStructured: jest.fn(),
        isSupported: jest.fn(() => true),
      }));

      mcrServiceInstance = require('../src/mcrService');
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
      expect(result.error).toBe('template_not_found');
    });

    it('should return error for invalid templateName input (null)', async () => {
      const result = await mcrServiceInstance.debugFormatPrompt(
        null,
        inputVariables
      );
      expect(result.success).toBe(false);
      expect(result.message).toBe('Template name must be a non-empty string.');
      expect(result.error).toBe('invalid_template_name');
    });

    it('should return error for invalid inputVariables (null)', async () => {
      const result = await mcrServiceInstance.debugFormatPrompt(
        templateName,
        null
      );
      expect(result.success).toBe(false);
      expect(result.message).toBe('Input variables must be an object.');
      expect(result.error).toBe('invalid_input_variables');
    });

    it('should return error for invalid inputVariables (not an object)', async () => {
      const result = await mcrServiceInstance.debugFormatPrompt(
        templateName,
        'not-an-object'
      );
      expect(result.success).toBe(false);
      expect(result.message).toBe('Input variables must be an object.');
      expect(result.error).toBe('invalid_input_variables');
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
      expect(result.error).toBe('template_user_field_missing');
    });

    it('should handle errors during fillTemplate (e.g. missing variable)', async () => {
      // fillTemplate itself throws an error if a variable is missing.
      // This test ensures that mcrService.debugFormatPrompt catches it.
      const result = await mcrServiceInstance.debugFormatPrompt(
        'BASIC_TEMPLATE',
        { wrong_name: 'Test' }
      );
      expect(result.success).toBe(false);
      expect(result.message).toMatch(
        /Error formatting prompt:.*Placeholder 'name' not found in input variables/i
      );
      // The error message comes from the fillTemplate utility, so we check for part of it.
    });
  });

  // --- Tests for assertNLToSessionWithSIR ---
  // These tests are now obsolete as assertNLToSessionWithSIR has been removed.
  // The functionality is covered by testing assertNLToSession with the 'SIR-R1' strategy.
});
