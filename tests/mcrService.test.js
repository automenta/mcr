jest.mock('@tensorflow/tfjs-node', () => ({}));
// Mock dependencies FIRST
jest.mock('../src/llmService', () => ({
  generate: jest.fn(),
}));
jest.mock('../src/config', () => ({
  llm: {
    // Corrected: llmProvider to llm
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

// Mock the actual session store that mcrService will use (InMemorySessionStore by default for tests)
// The mock needs to provide async methods now.
jest.mock('../src/store/InMemorySessionStore', () => {
  const mockInstance = {
    initialize: jest.fn().mockResolvedValue(undefined),
    createSession: jest.fn(),
    getSession: jest.fn(),
    addFacts: jest.fn(),
    getKnowledgeBase: jest.fn(),
    deleteSession: jest.fn(),
    getLexiconSummary: jest.fn().mockResolvedValue('lexicon_entry/1'), // Make it async
    close: jest.fn().mockResolvedValue(undefined),
  };
  return jest.fn(() => mockInstance); // Return a constructor that returns the mockInstance
});

jest.mock('../src/ontologyService', () => ({
  listOntologies: jest.fn(),
  getGlobalOntologyRulesAsString: jest
    .fn()
    .mockResolvedValue('global_ontology_rule_from_mock.'),
}));
jest.mock('../src/util/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const mcrService = require('../src/mcrService');
const llmService = require('../src/llmService');
const reasonerService = require('../src/reasonerService');
// const sessionManager = require('../src/sessionManager'); // Old import
const InMemorySessionStore = require('../src/store/InMemorySessionStore'); // Import the class
const { ErrorCodes } = require('../src/errors');
const ontologyService = require('../src/ontologyService');
const { prompts } = require('../src/prompts');

// Get the mock instance that mcrService will be using internally
// This relies on the fact that jest.mock hoists and mcrService is loaded after mocks are set up.
// When mcrService instantiates its sessionStore, it will get the mocked constructor,
// which returns our mockInstance.
let mockSessionStoreInstance;
if (InMemorySessionStore.mock && InMemorySessionStore.mock.results[0]) {
  mockSessionStoreInstance = InMemorySessionStore.mock.results[0].value;
} else {
  // Fallback or error if the mock setup is not as expected.
  // This can happen if mcrService is imported before the mock is fully effective,
  // or if the mock structure changes. For this setup, we assume it works.
  // If tests fail here, it's likely due to mock setup/ordering.
  console.error(
    'Warning: Could not retrieve the mock instance of InMemorySessionStore. Tests may not behave as expected.'
  );
  // Create a similar structured mock manually for safety, though it won't be the one mcrService uses.
  mockSessionStoreInstance = {
    initialize: jest.fn().mockResolvedValue(undefined),
    createSession: jest.fn(),
    getSession: jest.fn(),
    addFacts: jest.fn(),
    getKnowledgeBase: jest.fn(),
    deleteSession: jest.fn(),
    getLexiconSummary: jest.fn().mockResolvedValue('lexicon_entry/1'),
    close: jest.fn().mockResolvedValue(undefined),
  };
}

describe('MCR Service (mcrService.js)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default valid mock for validateKnowledgeBase, can be overridden in specific tests
    reasonerService.validateKnowledgeBase.mockResolvedValue({ isValid: true });

    // Reset and provide default resolved values for the session store mock methods
    if (mockSessionStoreInstance) {
      mockSessionStoreInstance.getSession.mockReset();
      mockSessionStoreInstance.getKnowledgeBase.mockReset();
      mockSessionStoreInstance.addFacts.mockReset();
      mockSessionStoreInstance.getLexiconSummary.mockReset();

      // Default successful async mocks
      mockSessionStoreInstance.getSession.mockResolvedValue({
        id: 'default-session-id',
        facts: [],
        lexicon: new Set(),
      });
      mockSessionStoreInstance.getKnowledgeBase.mockResolvedValue('');
      mockSessionStoreInstance.addFacts.mockResolvedValue(true);
      mockSessionStoreInstance.getLexiconSummary.mockResolvedValue(
        'lexicon_entry/1'
      );
    }

    jest.spyOn(mcrService, 'assertNLToSession').mockResolvedValue({ success: true, addedFacts: ['test_fact.'] });
    jest.spyOn(mcrService, 'querySessionWithNL').mockResolvedValue({ success: true, answer: 'Test answer.' });
    jest.spyOn(mcrService, 'translateNLToRulesDirect').mockResolvedValue({ success: true, rules: ['test_rule.'] });
    jest.spyOn(mcrService, 'translateRulesToNLDirect').mockResolvedValue({ success: true, explanation: 'Test explanation.' });
    jest.spyOn(mcrService, 'explainQuery').mockResolvedValue({ success: true, explanation: 'Test explanation.' });
    jest.spyOn(mcrService, 'setTranslationStrategy').mockResolvedValue(true);
  });

  describe('assertNLToSession', () => {
    const sessionId = 'test-session';
    const nlText = 'The sky is blue.';
    const prologFact = 'is_blue(sky).';

    beforeEach(async () => {
      await mcrService.setTranslationStrategy('SIR-R1');
      // Ensure mockSessionStoreInstance is used for setting up test conditions
      mockSessionStoreInstance.getSession.mockResolvedValue({
        id: sessionId,
        facts: [],
        lexicon: new Set(),
      });
      ontologyService.listOntologies.mockResolvedValue([
        { name: 'global', rules: 'universal_rule.' },
      ]);
      mockSessionStoreInstance.addFacts.mockResolvedValue(true);
      mockSessionStoreInstance.getKnowledgeBase.mockResolvedValue('');
      // getLexiconSummary is already defaulted in the outer beforeEach

      // More generic mock in beforeEach, specific tests will override
      llmService.generate.mockImplementation(
        async (systemPrompt /*, _userPrompt */) => {
          // _userPrompt commented out
          return {
            text: JSON.stringify({
              error: `Fallback mock in assertNLToSession for prompt: ${systemPrompt.substring(0, 50)}`,
            }),
            costData: null,
          };
        }
      );
    });

    it('should successfully assert a natural language statement using SIR-R1-Assert strategy', async () => {
      llmService.generate.mockReset(); // Specific mock for this test
      llmService.generate.mockImplementation(
        async (systemPrompt, userPrompt) => {
          if (
            systemPrompt === prompts.NL_TO_SIR_ASSERT.system &&
            userPrompt &&
            userPrompt.includes(nlText)
          ) {
            return {
              text: JSON.stringify({
                statementType: 'fact',
                fact: { predicate: 'is_blue', arguments: ['sky'] },
              }),
              costData: null,
            };
          }
          return {
            text: JSON.stringify({
              error:
                "Unexpected prompt in 'successfully assert' test specific mock",
            }),
            costData: null,
          };
        }
      );
      mockSessionStoreInstance.addFacts.mockResolvedValue(true); // Ensure addFacts is true

      const result = await mcrService.assertNLToSession(sessionId, nlText);
      expect(result.success).toBe(true);
      expect(result.message).toBe('Facts asserted successfully.');
      expect(result.addedFacts).toEqual([prologFact]);
      expect(result.strategyId).toBe('SIR-R1-Assert');
    });

    it('should return session not found if sessionStore.getSession returns null', async () => {
      mockSessionStoreInstance.getSession.mockResolvedValue(null);
      const result = await mcrService.assertNLToSession(sessionId, 'Some text');
      expect(result.success).toBe(false);
      expect(result.message).toBe('Session not found.');
      expect(result.error).toBe('SESSION_NOT_FOUND');
    });

    it('should return error from strategy if LLM returns invalid SIR JSON', async () => {
      llmService.generate.mockReset();
      llmService.generate.mockResolvedValue({
        text: 'This is not valid JSON',
        costData: null,
      });
      const result = await mcrService.assertNLToSession(
        sessionId,
        'Is the sky blue?'
      );
      expect(result.success).toBe(false);
      expect(result.message).toMatch(
        /Error during assertion: Execution failed at node 'step2_parse_sir_json'/i
      );
    });

    it('should return NO_FACTS_EXTRACTED if SIR strategy returns non-assertable SIR structure', async () => {
      llmService.generate.mockReset();
      llmService.generate.mockImplementation(
        async (systemPrompt, userPrompt) => {
          if (
            systemPrompt === prompts.NL_TO_SIR_ASSERT.system &&
            userPrompt &&
            userPrompt.includes(nlText)
          ) {
            return {
              text: JSON.stringify({
                statementType: 'comment',
                text: 'ignore this',
              }),
              costData: null,
            };
          }
          return {
            text: JSON.stringify({
              error: 'Unexpected prompt in NO_FACTS_EXTRACTED test',
            }),
            costData: null,
          };
        }
      );
      const result = await mcrService.assertNLToSession(sessionId, nlText);
      expect(result.success).toBe(true);
      expect(result.message).toBe('No facts were extracted from the input.');
      expect(result.error).toBe(ErrorCodes.NO_FACTS_EXTRACTED);
    });

    it('should return SESSION_ADD_FACTS_FAILED if sessionStore.addFacts returns false', async () => {
      llmService.generate.mockReset();
      llmService.generate.mockImplementation(
        async (systemPrompt, userPrompt) => {
          if (
            systemPrompt === prompts.NL_TO_SIR_ASSERT.system &&
            userPrompt &&
            userPrompt.includes(nlText)
          ) {
            return {
              text: JSON.stringify({
                statementType: 'fact',
                fact: { predicate: 'is_blue', arguments: ['sky'] },
              }),
              costData: null,
            };
          }
          return {
            text: JSON.stringify({
              error: 'Unexpected prompt in SESSION_ADD_FACTS_FAILED test',
            }),
            costData: null,
          };
        }
      );
      mockSessionStoreInstance.addFacts.mockResolvedValue(false); // Use mockResolvedValue
      const result = await mcrService.assertNLToSession(sessionId, nlText);
      expect(result.success).toBe(false);
      expect(result.message).toBe(
        'Error during assertion: Failed to add facts to session store after validation.'
      );
      expect(result.error).toBe(ErrorCodes.SESSION_ADD_FACTS_FAILED);
    });

    it('should handle errors from ontologyService.listOntologies gracefully and still assert', async () => {
      llmService.generate.mockReset();
      llmService.generate.mockImplementation(
        async (systemPrompt, userPrompt) => {
          if (
            systemPrompt === prompts.NL_TO_SIR_ASSERT.system &&
            userPrompt &&
            userPrompt.includes(nlText)
          ) {
            return {
              text: JSON.stringify({
                statementType: 'fact',
                fact: { predicate: 'is_blue', arguments: ['sky'] },
              }),
              costData: null,
            };
          }
          return {
            text: JSON.stringify({
              error: 'Unexpected prompt in ontologyService error test',
            }),
            costData: null,
          };
        }
      );
      ontologyService.listOntologies.mockRejectedValue(
        new Error('Ontology service error')
      );
      const result = await mcrService.assertNLToSession(sessionId, nlText);
      expect(result.success).toBe(true);
      expect(result.message).toBe('Facts asserted successfully.');
      expect(result.addedFacts).toEqual([prologFact]);
    });

    it('should handle errors from llmService.generate (network error, etc.)', async () => {
      // This mock specifically targets the NL_TO_SIR_ASSERT prompt for this test case
      llmService.generate.mockReset();
      llmService.generate.mockImplementation(
        async (systemPrompt, userPrompt) => {
          if (
            systemPrompt === prompts.NL_TO_SIR_ASSERT.system &&
            userPrompt &&
            userPrompt.includes(nlText)
          ) {
            return Promise.reject(new Error('LLM generation failed'));
          }
          // Fallback to prevent other tests from using this specific rejection
          return {
            text: JSON.stringify({
              statementType: 'fact',
              fact: { predicate: 'is_blue', arguments: ['sky'] },
            }),
            costData: null,
          };
        }
      );
      const result = await mcrService.assertNLToSession(sessionId, nlText);
      expect(result.success).toBe(false);
      expect(result.message).toContain(
        "Error during assertion: Execution failed at node 'step1_nl_to_sir_llm' (Type: LLM_Call) in strategy 'SIR-R1-Assert': LLM generation failed"
      );
      expect(result.error).toBe(ErrorCodes.STRATEGY_EXECUTION_ERROR); // This is the error code from MCRError when strategy execution fails
    });

    it('should return validation error if reasonerService.validateKnowledgeBase returns isValid: false', async () => {
      llmService.generate.mockReset();
      llmService.generate.mockImplementation(
        async (systemPrompt, userPrompt) => {
          if (
            systemPrompt === prompts.NL_TO_SIR_ASSERT.system &&
            userPrompt &&
            userPrompt.includes(nlText)
          ) {
            return {
              text: JSON.stringify({
                statementType: 'fact',
                fact: { predicate: 'is_blue', arguments: ['sky'] },
              }),
              costData: null,
            };
          }
          return {
            text: JSON.stringify({
              error:
                'Unexpected prompt in reasonerService validation error test',
            }),
            costData: null,
          };
        }
      );
      reasonerService.validateKnowledgeBase.mockResolvedValue({
        isValid: false,
        error: 'Syntax error in asserted fact',
      });
      const result = await mcrService.assertNLToSession(sessionId, nlText, {
        useLoops: false,
      });
      expect(result.success).toBe(false);
      expect(result.message).toBe(
        'Failed to assert facts: Generated Prolog is invalid.'
      );
      expect(result.error).toBe(ErrorCodes.INVALID_GENERATED_PROLOG);
      expect(result.details).toContain(
        'Generated Prolog is invalid: "is_blue(sky)."'
      );
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
      mockSessionStoreInstance.getSession.mockResolvedValue({
        // Use mockResolvedValue
        id: sessionId,
        facts: ['is_blue(sky).'],
        lexicon: new Set(),
      });
      mockSessionStoreInstance.getKnowledgeBase.mockResolvedValue(
        'is_blue(sky).'
      ); // Use mockResolvedValue
      ontologyService.listOntologies.mockResolvedValue([
        { name: 'global', rules: 'universal_rule.' },
      ]);
      // General mock for this describe block, specific tests can override if needed
      llmService.generate.mockImplementation(
        async (systemPrompt, userPrompt) => {
          if (
            systemPrompt === prompts.NL_TO_QUERY.system &&
            userPrompt &&
            userPrompt.includes(nlQuestion)
          ) {
            // Ensure this returns a string for the raw_llm_query_output
            return { text: prologQuery, costData: null };
          }
          if (
            systemPrompt === prompts.LOGIC_TO_NL_ANSWER.system &&
            userPrompt &&
            userPrompt.includes(JSON.stringify(reasonerResults))
          ) {
            return { text: nlAnswer, costData: null };
          }
          return Promise.reject(
            new Error(
              `Unexpected LLM call in querySessionWithNL default mock. System: ${systemPrompt.substring(0, 50)}, User: ${userPrompt ? userPrompt.substring(0, 100) : 'N/A'}`
            )
          );
        }
      );
      reasonerService.executeQuery.mockResolvedValue({
        results: reasonerResults,
        trace: null,
      });
    });

    it('should successfully query a session with NL using SIR-R1-Query strategy', async () => {
      llmService.generate.mockImplementation(
        async (systemPrompt, userPrompt) => {
          if (
            systemPrompt === prompts.NL_TO_QUERY.system &&
            userPrompt &&
            userPrompt.includes(nlQuestion)
          ) {
            return { text: prologQuery, costData: null };
          }
          if (
            systemPrompt === prompts.LOGIC_TO_NL_ANSWER.system &&
            userPrompt &&
            userPrompt.includes(JSON.stringify(reasonerResults))
          ) {
            return { text: nlAnswer, costData: null };
          }
          return Promise.reject(
            new Error(
              `Unexpected LLM call in 'successfully query' test. System: ${systemPrompt.substring(0, 50)}`
            )
          );
        }
      );
      const result = await mcrService.querySessionWithNL(sessionId, nlQuestion);
      expect(result.success).toBe(true);
      expect(result.answer).toBe(nlAnswer);
    });

    it('should successfully query with dynamic ontology', async () => {
      llmService.generate.mockImplementation(
        async (systemPrompt, userPrompt) => {
          if (
            systemPrompt === prompts.NL_TO_QUERY.system &&
            userPrompt &&
            userPrompt.includes(nlQuestion)
          ) {
            return { text: prologQuery, costData: null };
          }
          if (
            systemPrompt === prompts.LOGIC_TO_NL_ANSWER.system &&
            userPrompt &&
            userPrompt.includes(JSON.stringify(reasonerResults))
          ) {
            return { text: nlAnswer, costData: null };
          }
          return Promise.reject(
            new Error(
              `Unexpected LLM call in 'dynamic ontology' test. System: ${systemPrompt.substring(0, 50)}`
            )
          );
        }
      );
      const result = await mcrService.querySessionWithNL(
        sessionId,
        nlQuestion,
        { dynamicOntology: dynamicOntologyText }
      );
      expect(result.success).toBe(true);
      expect(result.answer).toBe(nlAnswer);
    });

    it('should successfully query with trace enabled and return an explanation', async () => {
      const traceMock = {
        goal: 'color(sky, Color).',
        children: [{ goal: 'is_blue(sky).', children: [] }],
      };
      const explanationMock =
        'The sky is blue because it was found to be blue.';
      reasonerService.executeQuery.mockResolvedValue({
        results: reasonerResults,
        trace: traceMock,
      });

      llmService.generate.mockImplementation(
        async (systemPrompt, userPrompt) => {
          if (systemPrompt === prompts.NL_TO_QUERY.system) {
            return { text: prologQuery, costData: null };
          }
          if (systemPrompt === prompts.LOGIC_TO_NL_ANSWER.system) {
            return { text: nlAnswer, costData: null };
          }
          if (systemPrompt === prompts.LOGIC_TRACE_TO_NL.system) {
            return { text: explanationMock, costData: null };
          }
          return Promise.reject(new Error('Unexpected LLM call in trace test'));
        }
      );

      const result = await mcrService.querySessionWithNL(
        sessionId,
        nlQuestion,
        {
          trace: true,
        }
      );

      expect(result.success).toBe(true);
      expect(result.answer).toBe(nlAnswer);
      expect(result.explanation).toBe(explanationMock);
      expect(llmService.generate).toHaveBeenCalledWith(
        prompts.LOGIC_TRACE_TO_NL.system,
        expect.stringContaining(JSON.stringify(traceMock, null, 2))
      );
    });

    it('should return error if LLM generates null for Prolog query', async () => {
      llmService.generate.mockImplementation(
        async (systemPrompt, userPrompt) => {
          if (
            systemPrompt === prompts.NL_TO_QUERY.system &&
            userPrompt &&
            userPrompt.includes(nlQuestion)
          ) {
            // Simulate LLM returning an object that is not a string, or null text
            return { text: null, costData: null };
          }
          if (systemPrompt === prompts.LOGIC_TO_NL_ANSWER.system) {
            return { text: nlAnswer, costData: null };
          }
          return Promise.reject(
            new Error(
              'Unexpected LLM call in "querySessionWithNL › should return error if LLM generates null for Prolog query" test'
            )
          );
        }
      );
      const result = await mcrService.querySessionWithNL(sessionId, nlQuestion);
      expect(result.success).toBe(false);
      expect(result.message).toMatch(
        /Error during query: Execution failed at node 'step2_extract_prolog_query' \(Type: Extract_Prolog_Query\) in strategy 'SIR-R1-Query': Input for Extract_Prolog_Query node step2_extract_prolog_query \(variable 'raw_llm_query_output'\) is not a string. Found: object/i
      );
    });
  });

  describe('translateNLToRulesDirect', () => {
    const nlTextToTranslate = 'If X is a man, X is mortal.';
    const expectedPrologRule = 'mortal(X) :- man(X).';

    beforeEach(async () => {
      await mcrService.setTranslationStrategy('SIR-R1');
      llmService.generate.mockReset(); // Important: Reset before setting new specific mock
      llmService.generate.mockImplementation(
        async (systemPrompt, userPrompt) => {
          if (
            systemPrompt === prompts.NL_TO_SIR_ASSERT.system &&
            userPrompt &&
            userPrompt.includes(nlTextToTranslate)
          ) {
            return {
              text: JSON.stringify({
                statementType: 'rule',
                rule: {
                  head: { predicate: 'mortal', arguments: ['X'] },
                  body: [{ predicate: 'man', arguments: ['X'] }],
                },
              }),
              costData: null,
            };
          }
          return {
            text: JSON.stringify({
              error: `Unexpected prompt in translateNLToRulesDirect test. System: ${systemPrompt.substring(0, 50)} User: ${userPrompt ? userPrompt.substring(0, 50) : 'N/A'}`,
            }),
            costData: null,
          };
        }
      );
    });

    it('should successfully translate NL to Prolog rules directly', async () => {
      const result =
        await mcrService.translateNLToRulesDirect(nlTextToTranslate);
      expect(result.success).toBe(true);
      expect(result.rules).toEqual([expectedPrologRule]);
    });
  });

  describe('translateRulesToNLDirect', () => {
    const prologRules = 'father(john, peter).';
    const nlExplanation = 'John is the father of Peter.';

    beforeEach(() => {
      llmService.generate.mockReset();
      llmService.generate.mockResolvedValue({
        text: nlExplanation,
        costData: null,
      });
    });

    it('should successfully translate Prolog rules to NL directly', async () => {
      const result = await mcrService.translateRulesToNLDirect(
        prologRules,
        'conversational'
      );
      expect(result.success).toBe(true);
      expect(result.explanation).toBe(nlExplanation); // Asserting the string text
    });

    it('should return error if LLM fails to generate an explanation (null text)', async () => {
      llmService.generate.mockReset();
      llmService.generate.mockResolvedValue({ text: null, costData: null });
      const result = await mcrService.translateRulesToNLDirect(prologRules);
      expect(result.success).toBe(false);
      expect(result.message).toBe(
        'Failed to generate a natural language explanation.'
      );
      expect(result.error).toBe('EMPTY_EXPLANATION_GENERATED');
    });

    it('should return error if LLM fails to generate an explanation (LLM returns null object)', async () => {
      llmService.generate.mockReset();
      llmService.generate.mockResolvedValue(null); // Simulate LLM returning null object
      const result = await mcrService.translateRulesToNLDirect(prologRules);
      expect(result.success).toBe(false);
      expect(result.message).toBe(
        'Failed to generate a natural language explanation.'
      );
      expect(result.error).toBe('EMPTY_EXPLANATION_GENERATED');
    });
  });

  describe('explainQuery', () => {
    const sessionId = 'test-session-explain';
    const nlQuestion = 'Why is the sky blue?';
    const prologQueryForExplain = 'explain(color(sky,blue)).'; // Example, actual output from NL_TO_QUERY might differ
    const explanation = 'The sky is blue due to Rayleigh scattering.';

    beforeEach(async () => {
      await mcrService.setTranslationStrategy('SIR-R1'); // Ensures SIR-R1-Query is used for the first part
      mockSessionStoreInstance.getSession.mockResolvedValue({
        // Use mockResolvedValue
        id: sessionId,
        facts: ['is_blue(sky).'],
        lexicon: new Set(),
      });
      mockSessionStoreInstance.getKnowledgeBase.mockResolvedValue(
        'is_blue(sky).'
      ); // Use mockResolvedValue
      // Default successful ontology listing
      ontologyService.listOntologies.mockResolvedValue([
        { name: 'global', rules: 'universal_rule.' },
      ]);

      // Reset and set a more specific default mock for the explainQuery suite
      llmService.generate.mockReset();
      llmService.generate.mockImplementation(
        async (systemPrompt, userPrompt) => {
          if (
            systemPrompt === prompts.NL_TO_QUERY.system &&
            userPrompt &&
            userPrompt.includes(nlQuestion)
          ) {
            return { text: prologQueryForExplain, costData: null };
          }
          if (
            systemPrompt === prompts.EXPLAIN_PROLOG_QUERY.system &&
            userPrompt &&
            userPrompt.includes(prologQueryForExplain)
          ) {
            return { text: explanation, costData: null };
          }
          return Promise.reject(
            new Error(
              `Unexpected LLM call in explainQuery default mock. System: ${systemPrompt.substring(0, 50)}, User: ${userPrompt ? userPrompt.substring(0, 100) : 'N/A'}`
            )
          );
        }
      );
    });

    it('should successfully generate a query explanation using SIR-R1-Query strategy', async () => {
      // This test will use the mock from beforeEach
      const result = await mcrService.explainQuery(sessionId, nlQuestion);
      expect(result.success).toBe(true);
      expect(result.explanation).toBe(explanation);
    });

    it('should return error if LLM fails to translate NL to Prolog query for explanation', async () => {
      llmService.generate.mockReset();
      llmService.generate.mockImplementation(
        async (systemPrompt, userPrompt) => {
          // Fail the NL_TO_QUERY step
          if (
            systemPrompt === prompts.NL_TO_QUERY.system &&
            userPrompt &&
            userPrompt.includes(nlQuestion)
          ) {
            return Promise.reject(
              new Error('Strategy query generation failed')
            );
          }
          // This part of mock might not be reached if the first call fails as expected
          if (systemPrompt === prompts.EXPLAIN_PROLOG_QUERY.system) {
            return { text: explanation, costData: null };
          }
          return Promise.reject(
            new Error(
              'Unexpected LLM call in "explainQuery › should return error if LLM fails to translate NL to Prolog query" test'
            )
          );
        }
      );
      const result = await mcrService.explainQuery(sessionId, nlQuestion);
      expect(result.success).toBe(false);
      expect(result.message).toMatch(
        /Error during query explanation: Execution failed at node 'step1_nl_to_query_llm' \(Type: LLM_Call\) in strategy 'SIR-R1-Query': Strategy query generation failed/i
      );
      expect(result.details).toMatch(/Strategy query generation failed/i);
      expect(result.error).toBe(ErrorCodes.STRATEGY_EXECUTION_ERROR);
    });

    it('should return error if LLM generates null for Prolog query for explanation', async () => {
      llmService.generate.mockReset();
      llmService.generate.mockImplementation(
        async (systemPrompt, userPrompt) => {
          // Return null for NL_TO_QUERY step
          if (
            systemPrompt === prompts.NL_TO_QUERY.system &&
            userPrompt &&
            userPrompt.includes(nlQuestion)
          ) {
            return { text: null, costData: null };
          }
          if (systemPrompt === prompts.EXPLAIN_PROLOG_QUERY.system) {
            return { text: explanation, costData: null };
          }
          return Promise.reject(
            new Error(
              'Unexpected LLM call in "explainQuery › should return error if LLM generates null for Prolog query" test'
            )
          );
        }
      );
      const result = await mcrService.explainQuery(sessionId, nlQuestion);
      expect(result.success).toBe(false);
      expect(result.message).toMatch(
        /Error during query explanation: Execution failed at node 'step2_extract_prolog_query' \(Type: Extract_Prolog_Query\) in strategy 'SIR-R1-Query': Input for Extract_Prolog_Query node step2_extract_prolog_query \(variable 'raw_llm_query_output'\) is not a string. Found: object/i
      );
      expect(result.details).toMatch(
        /Input for Extract_Prolog_Query node step2_extract_prolog_query \(variable 'raw_llm_query_output'\) is not a string. Found: object/i
      );
      expect(result.error).toBe(ErrorCodes.INVALID_NODE_INPUT);
    });

    it('should handle ontologyService error gracefully for NL_TO_QUERY prompt context and still explain', async () => {
      // Specific mock for this test: ontologyService fails for the strategy execution part, but succeeds for the explanation prompt part
      ontologyService.listOntologies.mockReset();
      ontologyService.listOntologies
        .mockImplementationOnce(() =>
          Promise.reject(new Error('Ontology N2Q prompt error for explain'))
        ) // Fails for strategy context
        .mockResolvedValue([{ name: 'global', rules: 'universal_rule.' }]); // Succeeds for EXPLAIN_PROLOG_QUERY context

      // LLM should still proceed for EXPLAIN_PROLOG_QUERY if NL_TO_QUERY provides a (potentially less optimal) query
      llmService.generate.mockReset();
      llmService.generate.mockImplementation(
        async (systemPrompt, userPrompt) => {
          if (
            systemPrompt === prompts.NL_TO_QUERY.system &&
            userPrompt &&
            userPrompt.includes(nlQuestion)
          ) {
            // Simulate that even with ontology error, a query might be generated (e.g., without ontology context)
            return { text: prologQueryForExplain, costData: null };
          }
          if (
            systemPrompt === prompts.EXPLAIN_PROLOG_QUERY.system &&
            userPrompt &&
            userPrompt.includes(prologQueryForExplain)
          ) {
            return { text: explanation, costData: null };
          }
          return Promise.reject(
            new Error(
              'Unexpected LLM call in ontologyGracefulError (NL_TO_QUERY) test'
            )
          );
        }
      );

      const result = await mcrService.explainQuery(sessionId, nlQuestion);
      expect(result.success).toBe(true); // Should still succeed as the explanation part works
      expect(result.explanation).toBe(explanation);
      // Optionally check debugInfo for logged ontology error
      expect(result.debugInfo.ontologyErrorForStrategy).toContain(
        'Ontology N2Q prompt error for explain'
      );
    });

    it('should handle ontologyService error gracefully for EXPLAIN_PROLOG_QUERY prompt context and still explain', async () => {
      // Specific mock for this test: ontologyService succeeds for strategy, fails for explanation prompt context
      ontologyService.listOntologies.mockReset();
      ontologyService.listOntologies
        .mockResolvedValueOnce([{ name: 'global', rules: 'universal_rule.' }]) // Succeeds for strategy context
        .mockImplementationOnce(() =>
          Promise.reject(new Error('Ontology EXPLAIN prompt error'))
        ); // Fails for EXPLAIN_PROLOG_QUERY context

      // LLM should still proceed for EXPLAIN_PROLOG_QUERY, potentially without ontology context in that prompt
      llmService.generate.mockReset();
      llmService.generate.mockImplementation(
        async (systemPrompt, userPrompt) => {
          if (
            systemPrompt === prompts.NL_TO_QUERY.system &&
            userPrompt &&
            userPrompt.includes(nlQuestion)
          ) {
            return { text: prologQueryForExplain, costData: null };
          }
          if (
            systemPrompt === prompts.EXPLAIN_PROLOG_QUERY.system &&
            userPrompt &&
            userPrompt.includes(prologQueryForExplain)
          ) {
            // Explanation might be different or less detailed if ontologyRules was empty, but it should still return something
            return { text: explanation, costData: null };
          }
          return Promise.reject(
            new Error(
              'Unexpected LLM call in ontologyGracefulError (EXPLAIN_PROLOG_QUERY) test'
            )
          );
        }
      );
      const result = await mcrService.explainQuery(sessionId, nlQuestion);
      expect(result.success).toBe(true);
      expect(result.explanation).toBe(explanation);
      expect(result.debugInfo.ontologyErrorForPrompt).toContain(
        'Ontology EXPLAIN prompt error'
      );
    });
  });
});
