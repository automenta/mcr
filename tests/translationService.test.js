// tests/translationService.test.js

jest.mock('../src/llmService', () => ({
  generate: jest.fn(),
}));

jest.mock('../src/config', () => ({
  llm: {
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

const translationService = require('../src/translationService');
const llmService = require('../src/llmService');
const { ErrorCodes } = require('../src/errors');
const ontologyService = require('../src/ontologyService');
const { prompts } = require('../src/prompts');

const getActiveStrategyId = jest.fn().mockReturnValue('SIR-R1');
const getOperationalStrategyJson = jest.fn();
const getSession = jest.fn();
const getKnowledgeBase = jest.fn();
const getLexiconSummary = jest.fn();

jest.mock('../src/strategyExecutor', () => {
  return jest.fn().mockImplementation(() => {
    return {
      execute: jest.fn().mockImplementation((llmService, reasonerService, context) => {
        if (context.naturalLanguageText) {
          return Promise.resolve(['mortal(X) :- man(X).']);
        }
        if (context.naturalLanguageQuestion) {
          if (llmService.generate.mock.results[0].value.text === null) {
            return Promise.reject(new Error("Input for Extract_Prolog_Query node step2_extract_prolog_query (variable 'raw_llm_query_output') is not a string. Found: object"));
          }
          if (llmService.generate.mock.results[0].type === 'throw') {
            return Promise.reject(new Error('Strategy query generation failed'));
          }
          return Promise.resolve('explain(color(sky,blue)).');
        }
        return Promise.resolve([]);
      }),
    };
  });
});

describe('Translation Service (translationService.js)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getActiveStrategyId.mockReturnValue('SIR-R1');
  });

  describe('translateNLToRulesDirect', () => {
    const nlTextToTranslate = 'If X is a man, X is mortal.';
    const expectedPrologRule = 'mortal(X) :- man(X).';

    beforeEach(() => {
      getOperationalStrategyJson.mockResolvedValue({
        id: 'SIR-R1-Assert',
        name: 'SIR-R1 Assertion Strategy',
        description: 'A strategy for translating natural language statements to Prolog facts/rules via a Structured Intermediate Representation (SIR). This is Revision 1.',
        nodes: [
          {
            id: 'step1_nl_to_sir_llm',
            type: 'LLM_Call',
            llmPrompt: 'NL_TO_SIR_ASSERT',
            input: {
              naturalLanguageText: '{{naturalLanguageText}}',
              ontologyRules: '{{ontologyRules}}',
              lexiconSummary: '{{lexiconSummary}}',
              existingFacts: '{{existingFacts}}',
            },
            output: {
              raw_llm_sir_output: '{{llm_response_text}}',
            },
          },
          {
            id: 'step2_parse_sir_json',
            type: 'Parse_SIR_JSON',
            input: {
              json_string: '{{raw_llm_sir_output}}',
            },
            output: {
              parsed_sir: '{{parsed_sir}}',
            },
          },
          {
            id: 'step3_sir_to_prolog',
            type: 'SIR_To_Prolog',
            input: {
              sir: '{{parsed_sir}}',
            },
            output: {
              prolog_clauses: '{{prolog_clauses}}',
            },
          },
        ],
        output: '{{prolog_clauses}}',
      });
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
        await translationService.translateNLToRulesDirect(
          nlTextToTranslate,
          null,
          getActiveStrategyId,
          getOperationalStrategyJson
        );
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
      const result = await translationService.translateRulesToNLDirect(
        prologRules,
        'conversational'
      );
      expect(result.success).toBe(true);
      expect(result.explanation).toBe(nlExplanation); // Asserting the string text
    });

    it('should return error if LLM fails to generate an explanation (null text)', async () => {
      llmService.generate.mockReset();
      llmService.generate.mockResolvedValue({ text: null, costData: null });
      const result = await translationService.translateRulesToNLDirect(prologRules);
      expect(result.success).toBe(false);
      expect(result.message).toBe(
        'Failed to generate a natural language explanation.'
      );
      expect(result.error).toBe('EMPTY_EXPLANATION_GENERATED');
    });

    it('should return error if LLM fails to generate an explanation (LLM returns null object)', async () => {
      llmService.generate.mockReset();
      llmService.generate.mockResolvedValue(null); // Simulate LLM returning null object
      const result = await translationService.translateRulesToNLDirect(prologRules);
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

    beforeEach(() => {
      getSession.mockResolvedValue({
        id: sessionId,
        facts: ['is_blue(sky).'],
        lexicon: new Set(),
      });
      getKnowledgeBase.mockResolvedValue('is_blue(sky).');
      getLexiconSummary.mockResolvedValue('lexicon_entry/1');
      ontologyService.listOntologies.mockResolvedValue([
        { name: 'global', rules: 'universal_rule.' },
      ]);
      getOperationalStrategyJson.mockResolvedValue({
        id: 'SIR-R1-Query',
        name: 'SIR-R1 Query Translation Strategy',
        description: 'A strategy for translating natural language questions to Prolog queries via a Structured Intermediate Representation (SIR). This is Revision 1.',
        nodes: [
          {
            id: 'step1_nl_to_query_llm',
            type: 'LLM_Call',
            llmPrompt: 'NL_TO_QUERY',
            input: {
              naturalLanguageQuestion: '{{naturalLanguageQuestion}}',
              existingFacts: '{{existingFacts}}',
              ontologyRules: '{{ontologyRules}}',
              lexiconSummary: '{{lexiconSummary}}',
            },
            output: {
              raw_llm_query_output: '{{llm_response_text}}',
            },
          },
          {
            id: 'step2_extract_prolog_query',
            type: 'Extract_Prolog_Query',
            input: {
              text: '{{raw_llm_query_output}}',
            },
            output: {
              prolog_query: '{{prolog_query}}',
            },
          },
        ],
        output: '{{prolog_query}}',
      });

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
      const result = await translationService.explainQuery(
        sessionId,
        nlQuestion,
        getOperationalStrategyJson,
        getSession,
        getKnowledgeBase,
        getLexiconSummary
      );
      expect(result.success).toBe(true);
      expect(result.explanation).toBe(explanation);
    });

    it('should return error if LLM fails to translate NL to Prolog query for explanation', async () => {
      llmService.generate.mockReset();
      llmService.generate.mockImplementation(
        async (systemPrompt, userPrompt) => {
          if (
            systemPrompt === prompts.NL_TO_QUERY.system &&
            userPrompt &&
            userPrompt.includes(nlQuestion)
          ) {
            return Promise.reject(
              new Error('Strategy query generation failed')
            );
          }
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
      const result = await translationService.explainQuery(
        sessionId,
        nlQuestion,
        getOperationalStrategyJson,
        getSession,
        getKnowledgeBase,
        getLexiconSummary
      );
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
      const result = await translationService.explainQuery(
        sessionId,
        nlQuestion,
        getOperationalStrategyJson,
        getSession,
        getKnowledgeBase,
        getLexiconSummary
      );
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
      ontologyService.listOntologies.mockReset();
      ontologyService.listOntologies
        .mockImplementationOnce(() =>
          Promise.reject(new Error('Ontology N2Q prompt error for explain'))
        )
        .mockResolvedValue([{ name: 'global', rules: 'universal_rule.' }]);

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
              'Unexpected LLM call in ontologyGracefulError (NL_TO_QUERY) test'
            )
          );
        }
      );

      const result = await translationService.explainQuery(
        sessionId,
        nlQuestion,
        getOperationalStrategyJson,
        getSession,
        getKnowledgeBase,
        getLexiconSummary
      );
      expect(result.success).toBe(true);
      expect(result.explanation).toBe(explanation);
      expect(result.debugInfo.ontologyErrorForStrategy).toContain(
        'Ontology N2Q prompt error for explain'
      );
    });

    it('should handle ontologyService error gracefully for EXPLAIN_PROLOG_QUERY prompt context and still explain', async () => {
      ontologyService.listOntologies.mockReset();
      ontologyService.listOntologies
        .mockResolvedValueOnce([{ name: 'global', rules: 'universal_rule.' }])
        .mockImplementationOnce(() =>
          Promise.reject(new Error('Ontology EXPLAIN prompt error'))
        );

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
              'Unexpected LLM call in ontologyGracefulError (EXPLAIN_PROLOG_QUERY) test'
            )
          );
        }
      );
      const result = await translationService.explainQuery(
        sessionId,
        nlQuestion,
        getOperationalStrategyJson,
        getSession,
        getKnowledgeBase,
        getLexiconSummary
      );
      expect(result.success).toBe(true);
      expect(result.explanation).toBe(explanation);
      expect(result.debugInfo.ontologyErrorForPrompt).toContain(
        'Ontology EXPLAIN prompt error'
      );
    });
  });
});
