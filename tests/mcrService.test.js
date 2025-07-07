// Mock dependencies FIRST
jest.mock('../src/llmService', () => ({
  generate: jest.fn(),
}));
jest.mock('../src/config', () => ({
  llmProvider: {
    provider: 'ollama',
    model: 'test-model',
    anthropic: { apiKey: 'test-key', defaultModel: 'test-model-anthropic' },
    openai: { apiKey: 'test-key', defaultModel: 'test-model-openai' },
    gemini: { apiKey: 'test-key', defaultModel: 'test-model-gemini' },
    ollama: { host: 'test-host', defaultModel: 'test-model-ollama' },
  },
  reasoner: {
    provider: 'test-reasoner-provider',
    prolog: { implementation: 'test-prolog-impl' },
  },
  logLevel: 'info',
  server: { port: 3000, host: 'localhost' },
  session: { storagePath: './test-sessions', defaultTimeoutMinutes: 60 },
  ontology: { storagePath: './test-ontologies', autoLoad: true },
  translationStrategy: 'SIR-R1',
}));

jest.mock('../src/reasonerService', () => ({
  executeQuery: jest.fn(),
  validateKnowledgeBase: jest.fn().mockResolvedValue({ isValid: true }),
}));
jest.mock('../src/sessionManager', () => ({
  getSession: jest.fn(),
  getKnowledgeBase: jest.fn(),
  addFacts: jest.fn(),
  createSession: jest.fn(),
  deleteSession: jest.fn(),
  getLexiconSummary: jest.fn().mockReturnValue('lexicon_entry/1'),
}));
jest.mock('../src/ontologyService', () => ({
  listOntologies: jest.fn(),
  getGlobalOntologyRulesAsString: jest.fn().mockResolvedValue('global_ontology_rule_from_mock.'),
}));
jest.mock('../src/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const mcrService = require('../src/mcrService');
const llmService = require('../src/llmService');
const reasonerService = require('../src/reasonerService');
const sessionManager = require('../src/sessionManager');
const ontologyService = require('../src/ontologyService');
const { prompts } = require('../src/prompts');

describe('MCR Service (mcrService.js)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default valid mock for validateKnowledgeBase, can be overridden in specific tests
    reasonerService.validateKnowledgeBase.mockResolvedValue({ isValid: true });
  });

  describe('assertNLToSession', () => {
    const sessionId = 'test-session';
    const nlText = 'The sky is blue.';
    const prologFact = 'is_blue(sky).';

    beforeEach(async () => {
      await mcrService.setTranslationStrategy('SIR-R1');
      sessionManager.getSession.mockReturnValue({ id: sessionId, facts: [] });
      ontologyService.listOntologies.mockResolvedValue([{ name: 'global', rules: 'universal_rule.' }]);
      // Default mock for this suite - successful translation to a single Prolog fact
      // This beforeEach is for the assertNLToSession suite
      llmService.generate.mockImplementation(async (systemPrompt) => {
        // This specific mock is for the happy path of assertion
        if (systemPrompt === prompts.NL_TO_SIR_ASSERT.system) {
          return { text: JSON.stringify({ statementType: 'fact', fact: { predicate: 'is_blue', arguments: ['sky'] } }), costData: null };
        }
        // Fallback for any other unexpected LLM calls within this suite's tests
        return { text: `unexpected_assert_prompt: ${systemPrompt}`, costData: null };
      });
      sessionManager.addFacts.mockReturnValue(true); // Default to successful fact addition
      sessionManager.getKnowledgeBase.mockReturnValue('');
      sessionManager.getLexiconSummary.mockReturnValue('lexicon_entry/1');
    });

    it('should successfully assert a natural language statement using SIR-R1-Assert strategy', async () => {
      const result = await mcrService.assertNLToSession(sessionId, nlText);
      expect(result.success).toBe(true);
      expect(result.message).toBe('Facts asserted successfully.');
      expect(result.addedFacts).toEqual([prologFact]);
      expect(result.strategyId).toBe('SIR-R1-Assert');
    });

    it('should return session not found if sessionManager.getSession returns null', async () => {
      sessionManager.getSession.mockReturnValue(null);
      const result = await mcrService.assertNLToSession(sessionId, 'Some text');
      expect(result.success).toBe(false);
      expect(result.message).toBe('Session not found.');
      expect(result.error).toBe('SESSION_NOT_FOUND');
    });

    it('should return error from strategy if LLM returns invalid SIR JSON', async () => {
      llmService.generate.mockResolvedValue({ text: 'This is not valid JSON', costData: null });
      const result = await mcrService.assertNLToSession(sessionId, 'Is the sky blue?');
      expect(result.success).toBe(false);
      expect(result.message).toMatch(/Error during assertion: Execution failed at node 'step2_parse_sir_json'/i);
      expect(result.details).toMatch(/Failed to parse JSON for node step2_parse_sir_json/i);
      expect(result.error).toBe('JSON_PARSING_FAILED');
    });

    it('should return NO_FACTS_EXTRACTED if SIR strategy returns non-assertable SIR structure', async () => {
      llmService.generate.mockResolvedValue({ text: JSON.stringify({ statementType: 'comment', text: 'ignore this' }), costData: null });
      const result = await mcrService.assertNLToSession(sessionId, nlText);
      expect(result.success).toBe(false);
      expect(result.message).toBe('Could not translate text into valid facts using the current strategy.');
      expect(result.error).toBe('NO_FACTS_EXTRACTED');
    });

    it('should return SESSION_ADD_FACTS_FAILED if sessionManager.addFacts returns false', async () => {
      sessionManager.addFacts.mockReturnValue(false);
      // llmService.generate will use the beforeEach mock, which produces valid facts
      const result = await mcrService.assertNLToSession(sessionId, nlText);
      expect(result.success).toBe(false);
      expect(result.message).toBe('Failed to add facts to session manager after validation.');
      expect(result.error).toBe('SESSION_ADD_FACTS_FAILED');
    });

    it('should handle errors from ontologyService.listOntologies gracefully and still assert', async () => {
      ontologyService.listOntologies.mockRejectedValue(new Error('Ontology service error'));
      // llmService.generate from beforeEach provides valid SIR
      const result = await mcrService.assertNLToSession(sessionId, nlText);
      expect(result.success).toBe(true);
      expect(result.message).toBe('Facts asserted successfully.');
    });

    it('should handle errors from llmService.generate (network error, etc.)', async () => {
      llmService.generate.mockRejectedValue(new Error('LLM generation failed'));
      const result = await mcrService.assertNLToSession(sessionId, nlText);
      expect(result.success).toBe(false);
      expect(result.message).toContain("Error during assertion: Execution failed at node 'step1_nl_to_sir_llm' (Type: LLM_Call) in strategy 'SIR-R1-Assert': LLM generation failed");
      expect(result.error).toBe('STRATEGY_EXECUTION_ERROR');
    });

    it('should return validation error if reasonerService.validateKnowledgeBase returns isValid: false', async () => {
      // llmService.generate from beforeEach produces 'is_blue(sky).'
      reasonerService.validateKnowledgeBase.mockResolvedValue({ isValid: false, error: 'Syntax error in asserted fact' });
      const result = await mcrService.assertNLToSession(sessionId, 'A test statement.');
      expect(result.success).toBe(false);
      expect(result.message).toBe('Failed to assert facts: Generated Prolog is invalid.');
      expect(result.error).toBe('INVALID_GENERATED_PROLOG');
      expect(result.details).toContain('Generated Prolog is invalid: "is_blue(sky)."');
      expect(result.details).toContain('Syntax error in asserted fact');
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
      await mcrService.setTranslationStrategy('SIR-R1');
      sessionManager.getSession.mockReturnValue({ id: sessionId, facts: ['is_blue(sky).'] });
      sessionManager.getKnowledgeBase.mockReturnValue('is_blue(sky).');
      ontologyService.listOntologies.mockResolvedValue([{ name: 'global', rules: 'universal_rule.' }]);
      llmService.generate.mockImplementation(async (systemPrompt, userPrompt) => {
        if (systemPrompt === prompts.NL_TO_QUERY.system) {
          return { text: prologQuery, costData: null };
        }
        if (systemPrompt === prompts.LOGIC_TO_NL_ANSWER.system) {
          if (userPrompt.includes(JSON.stringify(reasonerResults))) {
            return { text: nlAnswer, costData: null };
          }
        }
        return Promise.reject(new Error(`Unexpected LLM call in querySessionWithNL test. System: ${systemPrompt}`));
      });
      reasonerService.executeQuery.mockResolvedValue(reasonerResults);
    });

    it('should successfully query a session with NL using SIR-R1-Query strategy', async () => {
      const result = await mcrService.querySessionWithNL(sessionId, nlQuestion);
      expect(result.success).toBe(true);
      expect(result.answer).toBe(nlAnswer); // Asserting the string text
    });

    it('should successfully query with dynamic ontology', async () => {
      const result = await mcrService.querySessionWithNL(sessionId, nlQuestion, { dynamicOntology: dynamicOntologyText });
      expect(result.success).toBe(true);
      expect(result.answer).toBe(nlAnswer); // Asserting the string text
    });

    it('should return error if LLM generates null for Prolog query', async () => {
      llmService.generate.mockImplementation(async (systemPrompt) => {
        if (systemPrompt === prompts.NL_TO_QUERY.system) return { text: null, costData: null };
        if (systemPrompt === prompts.LOGIC_TO_NL_ANSWER.system) return { text: nlAnswer, costData: null };
        return Promise.reject(new Error('Unexpected LLM call'));
      });
      const result = await mcrService.querySessionWithNL(sessionId, nlQuestion);
      expect(result.success).toBe(false);
      expect(result.message).toMatch(/Error during query: Execution failed at node 'step2_extract_prolog_query'/i);
      expect(result.details).toMatch(/Input for Extract_Prolog_Query node step2_extract_prolog_query \(variable 'raw_llm_query_output'\) is not a string. Found: null/i);
      expect(result.error).toBe('INVALID_NODE_INPUT');
    });
  });

  describe('translateNLToRulesDirect', () => {
    const nlTextToTranslate = "If X is a man, X is mortal.";
    const expectedPrologRule = "mortal(X) :- man(X).";

    beforeEach(async () => {
        await mcrService.setTranslationStrategy('SIR-R1');
        llmService.generate.mockImplementation(async (systemPrompt) => {
            if (systemPrompt === prompts.NL_TO_SIR_ASSERT.system) {
                return { text: JSON.stringify({ statementType: 'rule', rule: { head: {predicate: 'mortal', arguments: ['X']}, body: [{predicate: 'man', arguments: ['X']}]} }), costData: null };
            }
            return { text: `mock_fallback_for_NL_TO_RULES_DIRECT: ${systemPrompt}`, costData: null };
        });
    });

    it('should successfully translate NL to Prolog rules directly', async () => {
        const result = await mcrService.translateNLToRulesDirect(nlTextToTranslate);
        expect(result.success).toBe(true);
        expect(result.rules).toEqual([expectedPrologRule]);
    });
  });

  describe('translateRulesToNLDirect', () => {
    const prologRules = 'father(john, peter).';
    const nlExplanation = 'John is the father of Peter.';

    beforeEach(() => {
      llmService.generate.mockResolvedValue({ text: nlExplanation, costData: null });
    });

    it('should successfully translate Prolog rules to NL directly', async () => {
      const result = await mcrService.translateRulesToNLDirect(prologRules, 'conversational');
      expect(result.success).toBe(true);
      expect(result.explanation).toBe(nlExplanation); // Asserting the string text
    });

    it('should return error if LLM fails to generate an explanation (null text)', async () => {
      llmService.generate.mockResolvedValue({ text: null, costData: null });
      const result = await mcrService.translateRulesToNLDirect(prologRules);
      expect(result.success).toBe(false);
      expect(result.message).toBe('Failed to generate a natural language explanation.');
      expect(result.error).toBe('EMPTY_EXPLANATION_GENERATED');
    });

    it('should return error if LLM fails to generate an explanation (LLM returns null object)', async () => {
      llmService.generate.mockResolvedValue(null); // Simulate LLM returning null object
      const result = await mcrService.translateRulesToNLDirect(prologRules);
      expect(result.success).toBe(false);
      expect(result.message).toBe('Failed to generate a natural language explanation.');
      expect(result.error).toBe('EMPTY_EXPLANATION_GENERATED');
    });
  });

  describe('explainQuery', () => {
    const sessionId = 'test-session-explain';
    const nlQuestion = 'Why is the sky blue?';
    const prologQueryForExplain = 'explain(color(sky,blue)).';
    const explanation = 'The sky is blue due to Rayleigh scattering.';

    beforeEach(async () => {
      await mcrService.setTranslationStrategy('SIR-R1');
      sessionManager.getSession.mockReturnValue({ id: sessionId, facts: ['is_blue(sky).'] });
      sessionManager.getKnowledgeBase.mockReturnValue('is_blue(sky).');
      ontologyService.listOntologies.mockResolvedValue([{ name: 'global', rules: 'universal_rule.' }]);
      llmService.generate.mockImplementation(async (systemPrompt, userPrompt) => {
        if (systemPrompt === prompts.NL_TO_QUERY.system && userPrompt.includes(nlQuestion)) {
          return { text: prologQueryForExplain, costData: null };
        }
        if (systemPrompt === prompts.EXPLAIN_PROLOG_QUERY.system && userPrompt.includes(prologQueryForExplain)) {
          return { text: explanation, costData: null };
        }
        return Promise.reject(new Error(`Unexpected LLM call in explainQuery test: ${systemPrompt}`));
      });
    });

    it('should successfully generate a query explanation using SIR-R1-Query strategy', async () => {
      const result = await mcrService.explainQuery(sessionId, nlQuestion);
      expect(result.success).toBe(true);
      expect(result.explanation).toBe(explanation); // Asserting the string text
    });

    it('should return error if LLM fails to translate NL to Prolog query for explanation', async () => {
        llmService.generate.mockImplementation(async (systemPrompt) => {
            if (systemPrompt === prompts.NL_TO_QUERY.system) {
                return Promise.reject(new Error('Strategy query generation failed'));
            }
            // This part of mock might not be reached if the first call fails as expected
            return { text: explanation, costData: null };
        });
        const result = await mcrService.explainQuery(sessionId, nlQuestion);
        expect(result.success).toBe(false);
        // Message now reflects the actual error from the LLM_Call node failing
        expect(result.message).toMatch(/Error during query explanation: Execution failed at node 'step1_nl_to_query_llm' \(Type: LLM_Call\) in strategy 'SIR-R1-Query': Strategy query generation failed/i);
        expect(result.details).toMatch(/Strategy query generation failed/i);
        expect(result.error).toBe('STRATEGY_EXECUTION_ERROR');
    });

    it('should return error if LLM generates null for Prolog query for explanation', async () => {
        llmService.generate.mockImplementation(async (systemPrompt) => {
            if (systemPrompt === prompts.NL_TO_QUERY.system) return { text: null, costData: null };
            if (systemPrompt === prompts.EXPLAIN_PROLOG_QUERY.system) return { text: explanation, costData: null };
            return Promise.reject(new Error('Unexpected LLM call'));
        });
        const result = await mcrService.explainQuery(sessionId, nlQuestion);
        expect(result.success).toBe(false);
        expect(result.message).toMatch(/Error during query explanation: Execution failed at node 'step2_extract_prolog_query'/i);
        expect(result.details).toMatch(/Input for Extract_Prolog_Query node step2_extract_prolog_query \(variable 'raw_llm_query_output'\) is not a string. Found: null/i);
        expect(result.error).toBe('INVALID_NODE_INPUT');
    });

    it('should handle ontologyService error gracefully for NL_TO_QUERY prompt context', async () => {
        ontologyService.listOntologies.mockImplementation(() => {
            // Fail for the first call (NL_TO_QUERY prompt context for strategy execution)
            if (llmService.generate.mock.calls.length < 1 || (llmService.generate.mock.calls.length > 0 && llmService.generate.mock.calls[0][0] === prompts.NL_TO_QUERY.system)) {
                 // This condition needs to be specific to the first call intended for query translation step
                if (!llmService.generate.mock.calls.find(call => call[0] === prompts.EXPLAIN_PROLOG_QUERY.system)) {
                    return Promise.reject(new Error('Ontology N2Q prompt error for explain'));
                }
            }
            // Succeed for the second call (EXPLAIN_PROLOG_QUERY context for LLM)
            return Promise.resolve([{ name: 'global', rules: 'universal_rule.' }]);
        });
        const result = await mcrService.explainQuery(sessionId, nlQuestion);
        expect(result.success).toBe(true);
        expect(result.explanation).toBe(explanation);
    });

    it('should handle ontologyService error gracefully for EXPLAIN_PROLOG_QUERY prompt context', async () => {
        ontologyService.listOntologies
            .mockResolvedValueOnce([{ name: 'global', rules: 'universal_rule.' }]) // For query translation
            .mockRejectedValueOnce(new Error('Ontology EXPLAIN prompt error')); // For explanation prompt
        const result = await mcrService.explainQuery(sessionId, nlQuestion);
        expect(result.success).toBe(true);
        expect(result.explanation).toBe(explanation);
    });
  });
});
