// test/llmService.test.js
const LlmService = require('../src/llmService');
const Config = require('../src/config');
// const { ApiError } = require('../src/errors'); // Unused
// const OpenAIProvider = require('../src/llmProviders/openaiProvider'); // Unused
// const GeminiProvider = require('../src/llmProviders/geminiProvider'); // Unused
// const OllamaProvider = require('../src/llmProviders/ollamaProvider'); // Unused
const Prompts = require('../src/prompts');

jest.mock('../src/config');

// Define mocks for the .pipe().invoke() methods of the *clients* that provider strategies will return
const mockOpenAiClientInvoke = jest.fn();
const mockGeminiClientInvoke = jest.fn();
const mockOllamaClientInvoke = jest.fn();

// Mock the provider modules to export strategy objects
jest.mock('../src/llmProviders/openaiProvider', () => ({
  name: 'openai',
  initialize: jest.fn().mockImplementation((_llmConfig) => ({
    // Prefixed llmConfig
    pipe: jest.fn((_outputParser) => ({ invoke: mockOpenAiClientInvoke })), // Prefixed outputParser
    someOtherMethodJustForTesting: () => {},
  })),
}));

jest.mock('../src/llmProviders/geminiProvider', () => ({
  name: 'gemini',
  initialize: jest.fn().mockImplementation((_llmConfig) => ({
    // Prefixed llmConfig
    pipe: jest.fn((_outputParser) => ({ invoke: mockGeminiClientInvoke })), // Prefixed outputParser
  })),
}));

jest.mock('../src/llmProviders/ollamaProvider', () => ({
  name: 'ollama',
  initialize: jest.fn().mockImplementation((_llmConfig) => ({
    // Prefixed llmConfig
    pipe: jest.fn((_outputParser) => ({ invoke: mockOllamaClientInvoke })), // Prefixed outputParser
  })),
}));

jest.mock('../src/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock Langchain's PromptTemplate for formatPrompt testing
const mockActualFormatImplementation = jest.fn();

jest.mock('@langchain/core/prompts', () => ({
  PromptTemplate: {
    // Store the mock function created by jest.fn() so we can reset it etc.
    _fromTemplateMock: jest.fn().mockImplementation((_templateString) =>
      // _templateString is unused by this simplified mock but good to acknowledge
      ({
        format: mockActualFormatImplementation,
        // Provide a default for inputVariables. Tests that care about this
        // can provide a more specific mock for fromTemplate if needed.
        inputVariables: [],
      })
    ),
    // Expose fromTemplate as a getter to return the stored mock function
    // This allows us to spy on/reset fromTemplate itself if needed,
    // while still controlling its implementation.
    get fromTemplate() {
      return this._fromTemplateMock;
    },
  },
}));

describe('LlmService', () => {
  let mockConfig;
  let testProviderStrategies; // Holds the strategies for injection
  let PromptsCore; // To access the mock fromTemplate

  beforeEach(() => {
    jest.clearAllMocks();
    PromptsCore = require('@langchain/core/prompts'); // Get the mocked module

    // Default mock config
    mockConfig = {
      llm: {
        provider: 'openai', // Default provider
        model: {
          openai: 'gpt-test-model',
          gemini: 'gemini-test-model',
          ollama: 'ollama-test-model',
        },
        apiKey: {
          openai: 'test-openai-key',
          gemini: 'test-gemini-key',
        },
        ollamaBaseUrl: 'http://localhost:11434',
      },
      debugMode: false,
    };
    Config.get.mockReturnValue(mockConfig);

    // Reset the actual format implementation mock
    mockActualFormatImplementation.mockReset();
    // Provide a default resolved value for the format method to prevent it from returning undefined
    mockActualFormatImplementation.mockResolvedValue(
      'Default mock formatted prompt string'
    );
    // If we need to reset fromTemplate's call history or change its implementation per test:
    PromptsCore.PromptTemplate._fromTemplateMock.mockClear();
    // Restore default implementation for fromTemplate if it was changed in a test
    PromptsCore.PromptTemplate._fromTemplateMock.mockImplementation(
      (_templateString) => ({
        format: mockActualFormatImplementation,
        inputVariables: [],
      })
    );

    // Reset the client invoke mocks
    mockOpenAiClientInvoke.mockReset();
    mockGeminiClientInvoke.mockReset();
    mockOllamaClientInvoke.mockReset();

    // Require the mocked providers here to get the Jest-provided mock objects
    const openaiProviderMock = require('../src/llmProviders/openaiProvider');
    const geminiProviderMock = require('../src/llmProviders/geminiProvider');
    const ollamaProviderMock = require('../src/llmProviders/ollamaProvider');

    // Clear initialize history on the strategy mocks themselves
    openaiProviderMock.initialize.mockClear();
    geminiProviderMock.initialize.mockClear();
    ollamaProviderMock.initialize.mockClear();

    // Prepare the strategies object for injection
    testProviderStrategies = {
      openai: openaiProviderMock,
      gemini: geminiProviderMock,
      ollama: ollamaProviderMock,
    };

    // Reset LlmService internal state before each test
    LlmService._client = null;
    LlmService._activeProviderName = null;
  });

  describe('init', () => {
    test('should initialize OpenAIProvider strategy when provider is openai', () => {
      mockConfig.llm.provider = 'openai';
      LlmService.init(mockConfig, testProviderStrategies);
      const openaiProviderMock = require('../src/llmProviders/openaiProvider'); // Get the mock
      expect(openaiProviderMock.initialize).toHaveBeenCalledWith(
        mockConfig.llm
      );
      expect(LlmService._client).toBeDefined();
      expect(LlmService._client.pipe).toBeDefined();
      expect(typeof LlmService._client.pipe).toBe('function');
      expect(LlmService._client.someOtherMethodJustForTesting).toBeDefined();
      expect(LlmService._activeProviderName).toBe('openai');
    });

    test('should initialize GeminiProvider strategy when provider is gemini', () => {
      mockConfig.llm.provider = 'gemini';
      LlmService.init(mockConfig, testProviderStrategies);
      const geminiProviderMock = require('../src/llmProviders/geminiProvider'); // Get the mock
      expect(geminiProviderMock.initialize).toHaveBeenCalledWith(
        mockConfig.llm
      );
      expect(LlmService._client).toBeDefined();
      expect(LlmService._activeProviderName).toBe('gemini');
    });

    test('should initialize OllamaProvider strategy when provider is ollama', () => {
      mockConfig.llm.provider = 'ollama';
      LlmService.init(mockConfig, testProviderStrategies);
      const ollamaProviderMock = require('../src/llmProviders/ollamaProvider'); // Get the mock
      expect(ollamaProviderMock.initialize).toHaveBeenCalledWith(
        mockConfig.llm
      );
      expect(LlmService._client).toBeDefined();
      expect(LlmService._activeProviderName).toBe('ollama');
    });

    test('should set client to null if provider strategy is not found in optionalProviderStrategies', () => {
      mockConfig.llm.provider = 'unknown';
      LlmService.init(mockConfig, testProviderStrategies);
      expect(LlmService._client).toBeNull();
      expect(LlmService._activeProviderName).toBeNull();
    });

    test('should set client to null if provider strategy is not found (no optionalProviderStrategies provided, uses internal)', () => {
      mockConfig.llm.provider = 'unknown_internal';
      LlmService.init(mockConfig); // No map passed, should use internal registration
      expect(LlmService._client).toBeNull();
      expect(LlmService._activeProviderName).toBeNull();
    });

    test('should set client to null if provider initialization fails (e.g., initialize throws)', () => {
      mockConfig.llm.provider = 'openai';
      const openaiProviderMock = require('../src/llmProviders/openaiProvider'); // Get the mock
      openaiProviderMock.initialize.mockImplementationOnce(() => {
        throw new Error('Test-induced Initialization failed');
      });
      LlmService.init(mockConfig, testProviderStrategies);
      expect(LlmService._client).toBeNull();
      expect(LlmService._activeProviderName).toBeNull();
    });

    test('should throw error if appConfig or appConfig.llm is missing', () => {
      expect(() => LlmService.init(null, testProviderStrategies)).toThrow(
        'LLMService configuration error: Missing LLM config.'
      );
      expect(() => LlmService.init({}, testProviderStrategies)).toThrow(
        'LLMService configuration error: Missing LLM config.'
      );
    });
  });

  // Helper function to set the resolved value for the correct client's invoke mock
  const mockClientInvokeImpl = (providerName, output) => {
    const invokeMap = {
      openai: mockOpenAiClientInvoke,
      gemini: mockGeminiClientInvoke,
      ollama: mockOllamaClientInvoke,
    };
    if (!invokeMap[providerName])
      throw new Error(`mockClientInvokeImpl: Unknown provider ${providerName}`);
    invokeMap[providerName].mockResolvedValue(output);
    return invokeMap[providerName];
  };

  describe('nlToRulesAsync', () => {
    test('should call client.pipe.invoke with correct prompt and inputs for nlToRulesAsync', async () => {
      mockConfig.llm.provider = 'openai';
      LlmService.init(mockConfig, testProviderStrategies);
      const currentMockInvoke = mockClientInvokeImpl('openai', [
        'rule1.',
        'rule2.',
      ]);

      const text = 'Convert this to rules.';
      const existingFacts = 'fact1.';
      const ontologyContext = 'ontology1.';
      const expectedFormattedPrompt = `Formatted prompt for NL_TO_RULES`;
      // mockLangchainFormatFn.mockResolvedValue(expectedFormattedPrompt);
      mockActualFormatImplementation.mockResolvedValue(expectedFormattedPrompt);

      const rules = await LlmService.nlToRulesAsync(
        text,
        existingFacts,
        ontologyContext
      );

      // expect(mockLangchainFromTemplateFn).toHaveBeenCalledWith(
      expect(PromptsCore.PromptTemplate.fromTemplate).toHaveBeenCalledWith(
        Prompts.NL_TO_RULES
      );
      // expect(mockLangchainFormatFn).toHaveBeenCalledWith({
      expect(mockActualFormatImplementation).toHaveBeenCalledWith({
        text_to_translate: text,
        existing_facts: existingFacts,
        ontology_context: ontologyContext,
      });
      expect(currentMockInvoke).toHaveBeenCalledWith(expectedFormattedPrompt);
      expect(rules).toEqual(['rule1.', 'rule2.']);
    });

    test('should throw ApiError if LLM returns non-array for nlToRulesAsync', async () => {
      mockConfig.llm.provider = 'openai';
      LlmService.init(mockConfig, testProviderStrategies);
      mockClientInvokeImpl('openai', { not_an_array: true });
      await expect(LlmService.nlToRulesAsync('text')).rejects.toThrow(
        'LLM failed to produce a valid JSON array of rules.'
      );
    });

    test('should throw if client.pipe.invoke throws for nlToRulesAsync', async () => {
      mockConfig.llm.provider = 'openai';
      LlmService.init(mockConfig, testProviderStrategies);
      mockOpenAiClientInvoke.mockRejectedValue(new Error('Provider error'));
      await expect(LlmService.nlToRulesAsync('text')).rejects.toThrow(
        'Error communicating with LLM provider: Provider error'
      );
    });
  });

  describe('queryToPrologAsync', () => {
    test('should call client.pipe.invoke with correct prompt and inputs for queryToPrologAsync', async () => {
      mockConfig.llm.provider = 'openai';
      LlmService.init(mockConfig, testProviderStrategies);
      const currentMockInvoke = mockClientInvokeImpl('openai', 'query(X).');

      const question = 'What is X?';
      const expectedFormattedPrompt = `Formatted prompt for QUERY_TO_PROLOG`;
      // mockLangchainFormatFn.mockResolvedValue(expectedFormattedPrompt);
      mockActualFormatImplementation.mockResolvedValue(expectedFormattedPrompt);

      const prologQuery = await LlmService.queryToPrologAsync(question);

      // expect(mockLangchainFromTemplateFn).toHaveBeenCalledWith(
      expect(PromptsCore.PromptTemplate.fromTemplate).toHaveBeenCalledWith(
        Prompts.QUERY_TO_PROLOG
      );
      // expect(mockLangchainFormatFn).toHaveBeenCalledWith({ question });
      expect(mockActualFormatImplementation).toHaveBeenCalledWith({ question });
      expect(currentMockInvoke).toHaveBeenCalledWith(expectedFormattedPrompt);
      expect(prologQuery).toBe('query(X).');
    });

    test('should append a period if LLM output for queryToPrologAsync does not have one', async () => {
      mockConfig.llm.provider = 'openai';
      LlmService.init(mockConfig, testProviderStrategies);
      const currentMockInvoke = mockClientInvokeImpl('openai', 'query(Y)'); // No period

      const question = 'What is Y?';
      const expectedFormattedPrompt = `Formatted prompt for QUERY_TO_PROLOG no period`;
      // mockLangchainFormatFn.mockResolvedValue(expectedFormattedPrompt);
      mockActualFormatImplementation.mockResolvedValue(expectedFormattedPrompt);

      const prologQuery = await LlmService.queryToPrologAsync(question);

      // expect(mockLangchainFromTemplateFn).toHaveBeenCalledWith(
      expect(PromptsCore.PromptTemplate.fromTemplate).toHaveBeenCalledWith(
        Prompts.QUERY_TO_PROLOG
      );
      // expect(mockLangchainFormatFn).toHaveBeenCalledWith({ question });
      expect(mockActualFormatImplementation).toHaveBeenCalledWith({ question });
      expect(currentMockInvoke).toHaveBeenCalledWith(expectedFormattedPrompt);
      expect(prologQuery).toBe('query(Y).'); // Expect period to be added
    });

    test('should handle query from LLM that already has a period and trailing space for queryToPrologAsync', async () => {
      mockConfig.llm.provider = 'openai';
      LlmService.init(mockConfig, testProviderStrategies);
      const currentMockInvoke = mockClientInvokeImpl('openai', 'query(Z). '); // Period and space

      const question = 'What is Z?';
      const expectedFormattedPrompt = `Formatted prompt for QUERY_TO_PROLOG with period and space`;
      // mockLangchainFormatFn.mockResolvedValue(expectedFormattedPrompt);
      mockActualFormatImplementation.mockResolvedValue(expectedFormattedPrompt);

      const prologQuery = await LlmService.queryToPrologAsync(question);
      expect(PromptsCore.PromptTemplate.fromTemplate).toHaveBeenCalledWith(
        Prompts.QUERY_TO_PROLOG
      );
      expect(mockActualFormatImplementation).toHaveBeenCalledWith({ question });
      // The actual LLM output is what matters for period addition, not the formatted prompt string.
      // So, the mockClientInvokeImpl should return 'query(Z). '
      // This test is more about how LlmService processes the *result* of the LLM call.
      // Let's adjust the client mock for this specific test.
      // mockClientInvokeImpl already set for 'openai', it will return 'query(Z). '
      expect(prologQuery).toBe('query(Z).'); // Expect period to be present, space trimmed
    });

    test('should throw ApiError if LLM returns empty string for queryToPrologAsync', async () => {
      mockConfig.llm.provider = 'openai';
      LlmService.init(mockConfig, testProviderStrategies);
      mockClientInvokeImpl('openai', '   ');
      await expect(LlmService.queryToPrologAsync('question')).rejects.toThrow(
        'LLM generated an empty or whitespace-only Prolog query.'
      );
    });

    test('should throw if client.pipe.invoke throws for queryToPrologAsync', async () => {
      mockConfig.llm.provider = 'openai';
      LlmService.init(mockConfig, testProviderStrategies);
      mockOpenAiClientInvoke.mockRejectedValue(
        new Error('Provider error for query')
      );
      await expect(LlmService.queryToPrologAsync('q')).rejects.toThrow(
        'Error communicating with LLM provider: Provider error for query'
      );
    });
  });

  describe('resultToNlAsync', () => {
    test('should call client.pipe.invoke with correct prompt and inputs', async () => {
      mockConfig.llm.provider = 'openai';
      LlmService.init(mockConfig, testProviderStrategies);
      const currentMockInvoke = mockClientInvokeImpl(
        'openai',
        'The answer is yes.'
      );

      const originalQuery = 'Is it true?';
      const logicResultJson = '{"result":"true"}';
      const style = 'conversational';
      const expectedFormattedPrompt = `Formatted prompt for RESULT_TO_NL`;
      // mockLangchainFormatFn.mockResolvedValue(expectedFormattedPrompt);
      mockActualFormatImplementation.mockResolvedValue(expectedFormattedPrompt);

      const nlAnswer = await LlmService.resultToNlAsync(
        originalQuery,
        logicResultJson,
        style
      );

      // expect(mockLangchainFromTemplateFn).toHaveBeenCalledWith(
      expect(PromptsCore.PromptTemplate.fromTemplate).toHaveBeenCalledWith(
        Prompts.RESULT_TO_NL
      );
      // expect(mockLangchainFormatFn).toHaveBeenCalledWith({
      expect(mockActualFormatImplementation).toHaveBeenCalledWith({
        original_question: originalQuery,
        logic_result: logicResultJson,
        style: style,
      });
      expect(currentMockInvoke).toHaveBeenCalledWith(expectedFormattedPrompt);
      expect(nlAnswer).toBe('The answer is yes.');
    });

    test('should use default style "conversational" if not provided', async () => {
      mockConfig.llm.provider = 'openai';
      LlmService.init(mockConfig, testProviderStrategies);
      mockClientInvokeImpl('openai', 'Default style answer.');
      // mockLangchainFormatFn.mockResolvedValue('formatted prompt');
      mockActualFormatImplementation.mockResolvedValue('formatted prompt');
      await LlmService.resultToNlAsync('query', '{}');
      // expect(mockLangchainFormatFn).toHaveBeenCalledWith(
      expect(mockActualFormatImplementation).toHaveBeenCalledWith(
        expect.objectContaining({ style: 'conversational' })
      );
    });

    test('should throw if client.pipe.invoke throws for resultToNlAsync', async () => {
      mockConfig.llm.provider = 'openai';
      LlmService.init(mockConfig, testProviderStrategies);
      mockOpenAiClientInvoke.mockRejectedValue(
        new Error('Provider error for NL answer')
      );
      await expect(LlmService.resultToNlAsync('q', '{}', 's')).rejects.toThrow(
        'Error communicating with LLM provider: Provider error for NL answer'
      );
    });
  });

  describe('rulesToNlAsync', () => {
    test('should call client.pipe.invoke with correct prompt and inputs', async () => {
      mockConfig.llm.provider = 'openai';
      LlmService.init(mockConfig, testProviderStrategies);
      const currentMockInvoke = mockClientInvokeImpl(
        'openai',
        'These are the rules explained.'
      );

      const rulesArray = ['rule1.', 'rule2(X).'];
      const style = 'formal';
      const expectedFormattedPrompt = `Formatted prompt for RULES_TO_NL`;
      // mockLangchainFormatFn.mockResolvedValue(expectedFormattedPrompt);
      mockActualFormatImplementation.mockResolvedValue(expectedFormattedPrompt);

      const nlExplanation = await LlmService.rulesToNlAsync(rulesArray, style);

      // expect(mockLangchainFromTemplateFn).toHaveBeenCalledWith(
      expect(PromptsCore.PromptTemplate.fromTemplate).toHaveBeenCalledWith(
        Prompts.RULES_TO_NL
      );
      // expect(mockLangchainFormatFn).toHaveBeenCalledWith({
      expect(mockActualFormatImplementation).toHaveBeenCalledWith({
        prolog_rules: rulesArray.join('\n'),
        style: style,
      });
      expect(currentMockInvoke).toHaveBeenCalledWith(expectedFormattedPrompt);
      expect(nlExplanation).toBe('These are the rules explained.');
    });

    test('should use default style "formal" if not provided for rulesToNlAsync', async () => {
      mockConfig.llm.provider = 'openai';
      LlmService.init(mockConfig, testProviderStrategies);
      mockClientInvokeImpl('openai', 'Default style rule explanation.');
      // mockLangchainFormatFn.mockResolvedValue('formatted prompt');
      mockActualFormatImplementation.mockResolvedValue('formatted prompt');
      await LlmService.rulesToNlAsync(['rule.']);
      // expect(mockLangchainFormatFn).toHaveBeenCalledWith(
      expect(mockActualFormatImplementation).toHaveBeenCalledWith(
        expect.objectContaining({ style: 'formal' })
      );
    });

    test('should throw if client.pipe.invoke throws for rulesToNlAsync', async () => {
      mockConfig.llm.provider = 'openai';
      LlmService.init(mockConfig, testProviderStrategies);
      mockOpenAiClientInvoke.mockRejectedValue(
        new Error('Provider error for rules explanation')
      );
      await expect(LlmService.rulesToNlAsync(['r.'], 's')).rejects.toThrow(
        'Error communicating with LLM provider: Provider error for rules explanation'
      );
    });
  });

  describe('explainQueryAsync', () => {
    test('should call client.pipe.invoke with correct prompt and inputs', async () => {
      mockConfig.llm.provider = 'openai';
      LlmService.init(mockConfig, testProviderStrategies);
      const currentMockInvoke = mockClientInvokeImpl(
        'openai',
        'This is how the query works.'
      );

      const query = 'Why X?';
      const facts = ['factA.'];
      const ontology = ['ontologyC.'];
      const expectedFormattedPrompt = `Formatted prompt for EXPLAIN_QUERY`;
      // mockLangchainFormatFn.mockResolvedValue(expectedFormattedPrompt);
      mockActualFormatImplementation.mockResolvedValue(expectedFormattedPrompt);

      const explanation = await LlmService.explainQueryAsync(
        query,
        facts,
        ontology
      );

      // expect(mockLangchainFromTemplateFn).toHaveBeenCalledWith(
      expect(PromptsCore.PromptTemplate.fromTemplate).toHaveBeenCalledWith(
        Prompts.EXPLAIN_QUERY
      );
      // expect(mockLangchainFormatFn).toHaveBeenCalledWith({
      expect(mockActualFormatImplementation).toHaveBeenCalledWith({
        query: query,
        facts: facts,
        ontology_context: ontology,
      });
      expect(currentMockInvoke).toHaveBeenCalledWith(expectedFormattedPrompt);
      expect(explanation).toBe('This is how the query works.');
    });

    test('should handle empty facts and ontology for explainQueryAsync', async () => {
      mockConfig.llm.provider = 'openai';
      LlmService.init(mockConfig, testProviderStrategies);
      const currentMockInvoke = mockClientInvokeImpl(
        'openai',
        'Explanation with no context.'
      );
      // mockLangchainFormatFn.mockResolvedValue('formatted prompt');
      mockActualFormatImplementation.mockResolvedValue('formatted prompt');
      await LlmService.explainQueryAsync('Why X?', [], []);
      // expect(mockLangchainFormatFn).toHaveBeenCalledWith({
      expect(mockActualFormatImplementation).toHaveBeenCalledWith({
        query: 'Why X?',
        facts: [],
        ontology_context: [],
      });
      // expect(currentMockInvoke).toHaveBeenCalled(); // currentMockInvoke is already called by LlmService
      expect(mockOpenAiClientInvoke).toHaveBeenCalled(); // Check specific provider's mock
    });

    test('should throw if client.pipe.invoke throws for explainQueryAsync', async () => {
      mockConfig.llm.provider = 'openai';
      LlmService.init(mockConfig, testProviderStrategies);
      mockOpenAiClientInvoke.mockRejectedValue(
        new Error('Provider error for query explanation')
      );
      await expect(LlmService.explainQueryAsync('q', [], [])).rejects.toThrow(
        'Error communicating with LLM provider: Provider error for query explanation'
      );
    });
  });

  describe('getPromptTemplates', () => {
    test('should return all prompt templates', () => {
      // No init needed for this simple getter
      const templates = LlmService.getPromptTemplates();
      expect(templates).toEqual(Prompts); // Use the imported Prompts alias
    });
  });
});
