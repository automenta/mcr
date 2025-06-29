// test/llmService.test.js
const LlmService = require('../src/llmService');
const Config = require('../src/config');
const { ApiError } = require('../src/errors');
const Prompts = require('../src/prompts'); // Real Prompts will be used

jest.mock('../src/config');

// Define mocks for the .pipe().invoke() methods of the *clients* that provider strategies will return
let mockOpenAiClientInvoke = jest.fn();
let mockGeminiClientInvoke = jest.fn();
let mockOllamaClientInvoke = jest.fn();

// Mock the provider modules to export strategy objects
// Define mocks inline to avoid hoisting issues
jest.mock('../src/llmProviders/openaiProvider', () => ({
  name: 'openai',
  initialize: jest.fn().mockImplementation((llmConfig) => ({
    pipe: jest.fn((outputParser) => ({ invoke: mockOpenAiClientInvoke })),
    someOtherMethodJustForTesting: () => {}
  })),
}));

jest.mock('../src/llmProviders/geminiProvider', () => ({
  name: 'gemini',
  initialize: jest.fn().mockImplementation((llmConfig) => ({
    pipe: jest.fn((outputParser) => ({ invoke: mockGeminiClientInvoke })),
  })),
}));

jest.mock('../src/llmProviders/ollamaProvider', () => ({
  name: 'ollama',
  initialize: jest.fn().mockImplementation((llmConfig) => ({
    pipe: jest.fn((outputParser) => ({ invoke: mockOllamaClientInvoke })),
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

let mockLangchainFormatFn;
let mockLangchainFromTemplateFn;
jest.mock('@langchain/core/prompts', () => {
  return {
    PromptTemplate: {
      fromTemplate: (...args) => mockLangchainFromTemplateFn(...args),
    },
  };
});

describe('LlmService', () => {
  let mockConfig;
  let testProviderStrategies; // Holds the strategies for injection

  beforeEach(() => {
    jest.clearAllMocks();

    mockConfig = {
      llm: {
        provider: 'openai', // Default provider
        model: {
          openai: 'gpt-test-model',
          gemini: 'gemini-test-model',
          ollama: 'ollama-test-model',
        },
        apiKey: { openai: 'test-openai-key', gemini: 'test-gemini-key' },
        ollamaBaseUrl: 'http://localhost:11434',
      },
      debugMode: false,
    };
    Config.get.mockReturnValue(mockConfig);

    mockLangchainFormatFn = jest.fn();
    mockLangchainFromTemplateFn = jest.fn(() => ({ format: mockLangchainFormatFn }));

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
      expect(openaiProviderMock.initialize).toHaveBeenCalledWith(mockConfig.llm);
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
      expect(geminiProviderMock.initialize).toHaveBeenCalledWith(mockConfig.llm);
      expect(LlmService._client).toBeDefined();
      expect(LlmService._activeProviderName).toBe('gemini');
    });

    test('should initialize OllamaProvider strategy when provider is ollama', () => {
      mockConfig.llm.provider = 'ollama';
      LlmService.init(mockConfig, testProviderStrategies);
      const ollamaProviderMock = require('../src/llmProviders/ollamaProvider'); // Get the mock
      expect(ollamaProviderMock.initialize).toHaveBeenCalledWith(mockConfig.llm);
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
        throw new Error("Test-induced Initialization failed");
      });
      LlmService.init(mockConfig, testProviderStrategies);
      expect(LlmService._client).toBeNull();
      expect(LlmService._activeProviderName).toBeNull();
    });

    test('should throw error if appConfig or appConfig.llm is missing', () => {
      expect(() => LlmService.init(null, testProviderStrategies)).toThrow('LLMService configuration error: Missing LLM config.');
      expect(() => LlmService.init({}, testProviderStrategies)).toThrow('LLMService configuration error: Missing LLM config.');
    });
  });

  const mockClientInvokeImpl = (providerName, output) => {
    const invokeMap = {
      openai: mockOpenAiClientInvoke,
      gemini: mockGeminiClientInvoke,
      ollama: mockOllamaClientInvoke,
    };
    if (!invokeMap[providerName]) throw new Error(`mockClientInvokeImpl: Unknown provider ${providerName}`);
    invokeMap[providerName].mockResolvedValue(output);
    return invokeMap[providerName];
  };

  describe('nlToRulesAsync', () => {
    test('should call client.pipe.invoke with correct prompt and inputs', async () => {
      mockConfig.llm.provider = 'openai';
      LlmService.init(mockConfig, testProviderStrategies);
      const currentMockInvoke = mockClientInvokeImpl('openai', ['rule1.', 'rule2.']);
      mockLangchainFormatFn.mockResolvedValue(`Formatted: ${Prompts.NL_TO_RULES}`);

      const rules = await LlmService.nlToRulesAsync('text', 'facts', 'ontology');

      expect(mockLangchainFromTemplateFn).toHaveBeenCalledWith(Prompts.NL_TO_RULES);
      expect(mockLangchainFormatFn).toHaveBeenCalledWith({
        text_to_translate: 'text', existing_facts: 'facts', ontology_context: 'ontology'
      });
      expect(currentMockInvoke).toHaveBeenCalledWith(`Formatted: ${Prompts.NL_TO_RULES}`);
      expect(rules).toEqual(['rule1.', 'rule2.']);
    });

    test('should throw ApiError if LLM returns non-array', async () => {
      mockConfig.llm.provider = 'openai';
      LlmService.init(mockConfig, testProviderStrategies);
      mockClientInvokeImpl('openai', { not_an_array: true });
      await expect(LlmService.nlToRulesAsync('text')).rejects.toThrow('LLM failed to produce a valid JSON array of rules.');
    });

    test('should throw if client.pipe.invoke throws', async () => {
      mockConfig.llm.provider = 'openai';
      LlmService.init(mockConfig, testProviderStrategies);
      mockOpenAiClientInvoke.mockRejectedValue(new Error('Provider error'));
      await expect(LlmService.nlToRulesAsync('text')).rejects.toThrow('Error communicating with LLM provider: Provider error');
    });
  });

  describe('queryToPrologAsync', () => {
    test('should call client.pipe.invoke with correct prompt and inputs', async () => {
      mockConfig.llm.provider = 'openai';
      LlmService.init(mockConfig, testProviderStrategies);
      const currentMockInvoke = mockClientInvokeImpl('openai', 'query(X).');
      mockLangchainFormatFn.mockResolvedValue(`Formatted: ${Prompts.QUERY_TO_PROLOG}`);

      const prologQuery = await LlmService.queryToPrologAsync('What is X?');

      expect(mockLangchainFromTemplateFn).toHaveBeenCalledWith(Prompts.QUERY_TO_PROLOG);
      expect(mockLangchainFormatFn).toHaveBeenCalledWith({ question: 'What is X?' });
      expect(currentMockInvoke).toHaveBeenCalledWith(`Formatted: ${Prompts.QUERY_TO_PROLOG}`);
      expect(prologQuery).toBe('query(X).');
    });

    test('should throw ApiError if LLM returns empty string', async () => {
      mockConfig.llm.provider = 'openai';
      LlmService.init(mockConfig, testProviderStrategies);
      mockClientInvokeImpl('openai', '   ');
      await expect(LlmService.queryToPrologAsync('question')).rejects.toThrow('LLM generated an empty or whitespace-only Prolog query.');
    });

    test('should throw if client.pipe.invoke throws', async () => {
      mockConfig.llm.provider = 'openai';
      LlmService.init(mockConfig, testProviderStrategies);
      mockOpenAiClientInvoke.mockRejectedValue(new Error('Provider error for query'));
      await expect(LlmService.queryToPrologAsync('q')).rejects.toThrow('Error communicating with LLM provider: Provider error for query');
    });
  });

  describe('resultToNlAsync', () => {
    test('should call client.pipe.invoke with correct prompt and inputs', async () => {
      mockConfig.llm.provider = 'openai';
      LlmService.init(mockConfig, testProviderStrategies);
      const currentMockInvoke = mockClientInvokeImpl('openai', 'The answer is yes.');
      mockLangchainFormatFn.mockResolvedValue(`Formatted: ${Prompts.RESULT_TO_NL}`);

      const nlAnswer = await LlmService.resultToNlAsync('Is it true?', '{"result":"true"}', 'conversational');

      expect(mockLangchainFromTemplateFn).toHaveBeenCalledWith(Prompts.RESULT_TO_NL);
      expect(mockLangchainFormatFn).toHaveBeenCalledWith({
        original_question: 'Is it true?', logic_result: '{"result":"true"}', style: 'conversational'
      });
      expect(currentMockInvoke).toHaveBeenCalledWith(`Formatted: ${Prompts.RESULT_TO_NL}`);
      expect(nlAnswer).toBe('The answer is yes.');
    });

    test('should use default style "conversational" if not provided', async () => {
      mockConfig.llm.provider = 'openai';
      LlmService.init(mockConfig, testProviderStrategies);
      mockClientInvokeImpl('openai', 'Default style answer.');
      mockLangchainFormatFn.mockResolvedValue("formatted prompt");
      await LlmService.resultToNlAsync('query', '{}');
      expect(mockLangchainFormatFn).toHaveBeenCalledWith(expect.objectContaining({ style: 'conversational' }));
    });

    test('should throw if client.pipe.invoke throws', async () => {
      mockConfig.llm.provider = 'openai';
      LlmService.init(mockConfig, testProviderStrategies);
      mockOpenAiClientInvoke.mockRejectedValue(new Error('Provider error for NL answer'));
      await expect(LlmService.resultToNlAsync('q','{}','s')).rejects.toThrow('Error communicating with LLM provider: Provider error for NL answer');
    });
  });

  describe('rulesToNlAsync', () => {
    test('should call client.pipe.invoke with correct prompt and inputs', async () => {
      mockConfig.llm.provider = 'openai';
      LlmService.init(mockConfig, testProviderStrategies);
      const currentMockInvoke = mockClientInvokeImpl('openai', 'These are the rules explained.');
      mockLangchainFormatFn.mockResolvedValue(`Formatted: ${Prompts.RULES_TO_NL}`);

      const nlExplanation = await LlmService.rulesToNlAsync(['rule1.', 'rule2(X).'], 'formal');

      expect(mockLangchainFromTemplateFn).toHaveBeenCalledWith(Prompts.RULES_TO_NL);
      expect(mockLangchainFormatFn).toHaveBeenCalledWith({
        prolog_rules: 'rule1.\nrule2(X).', style: 'formal'
      });
      expect(currentMockInvoke).toHaveBeenCalledWith(`Formatted: ${Prompts.RULES_TO_NL}`);
      expect(nlExplanation).toBe('These are the rules explained.');
    });

    test('should use default style "formal" if not provided', async () => {
        mockConfig.llm.provider = 'openai';
        LlmService.init(mockConfig, testProviderStrategies);
        mockClientInvokeImpl('openai', 'Default style rule explanation.');
        mockLangchainFormatFn.mockResolvedValue("formatted prompt");
        await LlmService.rulesToNlAsync(['rule.']);
        expect(mockLangchainFormatFn).toHaveBeenCalledWith(expect.objectContaining({ style: 'formal' }));
    });

    test('should throw if client.pipe.invoke throws', async () => {
      mockConfig.llm.provider = 'openai';
      LlmService.init(mockConfig, testProviderStrategies);
      mockOpenAiClientInvoke.mockRejectedValue(new Error('Provider error for rules explanation'));
      await expect(LlmService.rulesToNlAsync(['r.'],'s')).rejects.toThrow('Error communicating with LLM provider: Provider error for rules explanation');
    });
  });

  describe('explainQueryAsync', () => {
    test('should call client.pipe.invoke with correct prompt and inputs', async () => {
      mockConfig.llm.provider = 'openai';
      LlmService.init(mockConfig, testProviderStrategies);
      const currentMockInvoke = mockClientInvokeImpl('openai', 'This is how the query works.');
      mockLangchainFormatFn.mockResolvedValue(`Formatted: ${Prompts.EXPLAIN_QUERY}`);

      const explanation = await LlmService.explainQueryAsync('Why X?', ['factA.'], ['ontologyC.']);

      expect(mockLangchainFromTemplateFn).toHaveBeenCalledWith(Prompts.EXPLAIN_QUERY);
      expect(mockLangchainFormatFn).toHaveBeenCalledWith({
        query: 'Why X?', facts: ['factA.'], ontology_context: ['ontologyC.']
      });
      expect(currentMockInvoke).toHaveBeenCalledWith(`Formatted: ${Prompts.EXPLAIN_QUERY}`);
      expect(explanation).toBe('This is how the query works.');
    });

    test('should handle empty facts and ontology', async () => {
        mockConfig.llm.provider = 'openai';
        LlmService.init(mockConfig, testProviderStrategies);
        const currentMockInvoke = mockClientInvokeImpl('openai', 'Explanation with no context.'); // Ensure this is the mock for 'openai'
        mockLangchainFormatFn.mockResolvedValue("formatted prompt");
        await LlmService.explainQueryAsync('Why X?', [], []);
        expect(mockLangchainFormatFn).toHaveBeenCalledWith({ query: 'Why X?', facts: [], ontology_context: [] });
        expect(currentMockInvoke).toHaveBeenCalled();
    });

    test('should throw if client.pipe.invoke throws', async () => {
      mockConfig.llm.provider = 'openai';
      LlmService.init(mockConfig, testProviderStrategies);
      mockOpenAiClientInvoke.mockRejectedValue(new Error('Provider error for query explanation'));
      await expect(LlmService.explainQueryAsync('q',[],[])).rejects.toThrow('Error communicating with LLM provider: Provider error for query explanation');
    });
  });

  describe('getPromptTemplates', () => {
    test('should return all prompt templates', () => {
      const templates = LlmService.getPromptTemplates();
      expect(templates).toEqual(Prompts);
    });
  });
});
