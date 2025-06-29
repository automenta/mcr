const LlmService = require('../src/llmService');
const { ChatOpenAI } = require('@langchain/openai');
const { ChatGoogleGenerativeAI } = require('@langchain/google-genai');
const { ChatOllama } = require('@langchain/community/chat_models/ollama');
const {
  JsonOutputParser,
  StringOutputParser,
} = require('@langchain/core/output_parsers');
const { PromptTemplate } = require('@langchain/core/prompts');
const logger = require('../src/logger');
const ApiError = require('../src/errors');
const ConfigManager = require('../src/config');
const PROMPT_TEMPLATES = require('../src/prompts');

jest.mock('@langchain/openai');
jest.mock('@langchain/google-genai');
jest.mock('@langchain/community/chat_models/ollama');
jest.mock('@langchain/core/output_parsers');
jest.mock('@langchain/core/prompts');
jest.mock('../src/logger'); // Auto-mocked
jest.mock('../src/errors');
jest.mock('../src/config'); // Simpler mock, specific returns will be per test
/*
// Old mock, init is now called with config directly
jest.mock('../src/config', () => ({
  load: jest.fn(() => ({
    llm: {
      provider: 'openai', // Default for tests
      model: {
        openai: 'gpt-test',
        gemini: 'gemini-test',
        ollama: 'ollama-test',
      },
      apiKey: { openai: 'sk-test', gemini: 'gem-test' },
      ollamaBaseUrl: 'http://localhost:11434',
    },
    logging: { level: 'info', file: 'test.log' }, // For logger
  })),
}));
*/
jest.mock('../src/prompts');

describe('LlmService', () => {
  // @TODO: Fix failing tests - disabling for now (re-enabling)
  let mockChatClient;
  let mockPipe;
  let mockInvoke;

  beforeAll(() => {
    mockInvoke = jest.fn();
    mockPipe = jest.fn(() => ({
      invoke: mockInvoke,
    }));

    mockChatClient = {
      pipe: mockPipe,
    };

    ChatOpenAI.mockImplementation(() => mockChatClient);
    ChatGoogleGenerativeAI.mockImplementation(() => mockChatClient);
    ChatOllama.mockImplementation(() => mockChatClient);

    PromptTemplate.fromTemplate.mockImplementation((template) => ({
      format: jest.fn(
        (input) => `Formatted: ${template} ${JSON.stringify(input)}`
      ),
    }));

    JsonOutputParser.mockImplementation(() => ({ type: 'json' }));
    StringOutputParser.mockImplementation(() => ({ type: 'string' }));

    ApiError.mockImplementation((status, message) => ({ status, message }));

    PROMPT_TEMPLATES.NL_TO_RULES = 'NL_TO_RULES_TEMPLATE';
    PROMPT_TEMPLATES.QUERY_TO_PROLOG = 'QUERY_TO_PROLOG_TEMPLATE';
    PROMPT_TEMPLATES.RESULT_TO_NL = 'RESULT_TO_NL_TEMPLATE';
    PROMPT_TEMPLATES.RULES_TO_NL = 'RULES_TO_NL_TEMPLATE';
    PROMPT_TEMPLATES.EXPLAIN_QUERY = 'EXPLAIN_QUERY_TEMPLATE';
  });

  beforeEach(() => {
    jest.clearAllMocks();
    LlmService._client = null;
  });

  describe('Initialization (init)', () => {
    test('should initialize with OpenAI if configured and API key is present', () => {
      const mockConfig = {
        llm: {
          provider: 'openai',
          model: { openai: 'gpt-4o' },
          apiKey: { openai: 'sk-test' },
        },
      };
      LlmService.init(mockConfig);
      expect(ChatOpenAI).toHaveBeenCalledWith({
        apiKey: 'sk-test',
        modelName: 'gpt-4o',
        temperature: 0,
      });
      expect(LlmService._client).toBe(mockChatClient);
      expect(logger.info).toHaveBeenCalledWith(
        "LLM Service initialized with provider: 'openai' and model: 'gpt-4o'"
      );
    });

    test('should not initialize OpenAI if API key is missing', () => {
      const mockConfig = {
        llm: {
          provider: 'openai',
          model: { openai: 'gpt-4o' },
          apiKey: { openai: null }, // Key is null
        },
      };
      LlmService.init(mockConfig);
      expect(ChatOpenAI).not.toHaveBeenCalled();
      expect(LlmService._client).toBeNull();
      expect(logger.warn).toHaveBeenCalledWith(
        'OpenAI API key not provided. OpenAI LLM service will not be available.'
      );
    });

    test('should initialize with Gemini if configured and API key is present', () => {
      const mockConfig = {
        llm: {
          provider: 'gemini',
          model: { gemini: 'gemini-pro' },
          apiKey: { gemini: 'gemini-test' },
        },
      };
      LlmService.init(mockConfig);
      expect(ChatGoogleGenerativeAI).toHaveBeenCalledWith({
        apiKey: 'gemini-test',
        modelName: 'gemini-pro',
        temperature: 0,
      });
      expect(LlmService._client).toBe(mockChatClient);
      expect(logger.info).toHaveBeenCalledWith(
        "LLM Service initialized with provider: 'gemini' and model: 'gemini-pro'"
      );
    });

    test('should not initialize Gemini if API key is missing', () => {
      const mockConfig = {
        llm: {
          provider: 'gemini',
          model: { gemini: 'gemini-pro' },
          apiKey: { gemini: null }, // Key is null
        },
      };
      LlmService.init(mockConfig);
      expect(ChatGoogleGenerativeAI).not.toHaveBeenCalled();
      expect(LlmService._client).toBeNull();
      expect(logger.warn).toHaveBeenCalledWith(
        'Gemini API key not provided. Gemini LLM service will not be available.'
      );
    });

    test('should initialize with Ollama if configured', () => {
      const mockConfig = {
        llm: {
          provider: 'ollama',
          model: { ollama: 'llama3' },
          ollamaBaseUrl: 'http://localhost:11434',
          apiKey: {}, // Ollama doesn't need an API key but structure might be expected
        },
      };
      LlmService.init(mockConfig);
      expect(ChatOllama).toHaveBeenCalledWith({
        baseUrl: 'http://localhost:11434',
        model: 'llama3',
        temperature: 0,
      });
      expect(LlmService._client).toBe(mockChatClient);
      expect(logger.info).toHaveBeenCalledWith(
        "LLM Service initialized with provider: 'ollama' and model: 'llama3'"
      );
    });

    test('should handle unsupported LLM provider', () => {
      const mockConfig = {
        llm: { provider: 'unsupported', model: {}, apiKey: {} },
      };
      LlmService.init(mockConfig);
      expect(LlmService._client).toBeNull();
      // This log message comes from LlmService.init based on current implementation
      expect(logger.fatal).toHaveBeenCalledWith(
        "Unsupported LLM provider configured: 'unsupported'. This should have been caught by config validation. LLM service will not be available.",
        expect.any(Object)
      );
    });

    test('should handle errors during client instantiation', () => {
      ChatOpenAI.mockImplementationOnce(() => {
        throw new Error('Instantiation failed');
      });
      const mockConfig = {
        llm: {
          provider: 'openai',
          model: { openai: 'gpt-4o' },
          apiKey: { openai: 'sk-test' },
        },
      };
      LlmService.init(mockConfig);
      expect(LlmService._client).toBeNull();
      expect(logger.error).toHaveBeenCalledWith(
        "Failed to initialize LLM provider 'openai': Instantiation failed"
      );
    });
  });

  describe('LLM Invocation (_invokeChainAsync)', () => {
    beforeEach(() => {
      ConfigManager.load.mockReturnValue({
        llm: {
          provider: 'openai',
          model: { openai: 'gpt-4o' },
          apiKey: { openai: 'sk-test' },
        },
      });
      LlmService.init();
    });

    test('should throw ApiError if LLM client is not initialized', async () => {
      LlmService._client = null;
      await expect(
        LlmService._invokeChainAsync('template', {}, new StringOutputParser())
      ).rejects.toEqual(
        expect.objectContaining({
          status: 503,
          message: 'LLM Service unavailable. Check configuration and API keys.',
        })
      );
      expect(logger.error).toHaveBeenCalledWith(
        'LLM Service not available or not initialized correctly.'
      );
      expect(ApiError).toHaveBeenCalledWith(
        503,
        'LLM Service unavailable. Check configuration and API keys.'
      );
    });

    test('should call prompt format and chain invoke with correct arguments', async () => {
      mockInvoke.mockResolvedValue('LLM Response');
      const mockInput = { key: 'value' };
      const mockOutputParser = { type: 'test-parser' };

      const result = await LlmService._invokeChainAsync(
        'TEST_TEMPLATE',
        mockInput,
        mockOutputParser
      );

      expect(PromptTemplate.fromTemplate).toHaveBeenCalledWith('TEST_TEMPLATE');
      expect(PromptTemplate.fromTemplate().format).toHaveBeenCalledWith(
        mockInput
      );
      expect(mockPipe).toHaveBeenCalledWith(mockOutputParser);
      expect(mockInvoke).toHaveBeenCalledWith(
        'Formatted: TEST_TEMPLATE {"key":"value"}'
      );
      expect(result).toBe('LLM Response');
    });

    test('should handle errors during LLM invocation', async () => {
      mockInvoke.mockRejectedValue(new Error('LLM API error'));

      await expect(
        LlmService._invokeChainAsync('template', {}, new StringOutputParser())
      ).rejects.toEqual(
        expect.objectContaining({
          status: 502,
          message: 'Error communicating with LLM provider: LLM API error',
        })
      );
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('LLM invocation error')
      );
      expect(ApiError).toHaveBeenCalledWith(
        502,
        expect.stringContaining('Error communicating with LLM provider')
      );
    });

    // Test specific error mappings from _invokeChainAsync
    it.each([
      [
        { response: { status: 401 }, message: 'Auth error' },
        500,
        'LLM provider authentication/authorization error. Please check server configuration (API key, permissions).',
        'LLM_PROVIDER_AUTH_ERROR',
      ],
      [
        { response: { status: 403 }, message: 'Forbidden' },
        500,
        'LLM provider authentication/authorization error. Please check server configuration (API key, permissions).',
        'LLM_PROVIDER_AUTH_ERROR',
      ],
      [
        { message: 'Invalid API key' }, // No status, but message implies auth issue
        500,
        'LLM provider authentication/authorization error (API key related). Please check server configuration.',
        'LLM_PROVIDER_AUTH_ERROR',
      ],
      [
        { response: { status: 429 }, message: 'Rate limit' },
        429,
        'LLM provider rate limit exceeded. Please try again later.',
        'LLM_PROVIDER_RATE_LIMIT',
      ],
      [
        {
          response: {
            status: 404,
            data: { error: { message: 'Model not found' } },
          },
        },
        500,
        'LLM provider model or endpoint not found. Please check server configuration. Details: Model not found',
        'LLM_PROVIDER_NOT_FOUND',
      ],
      [
        {
          response: { status: 400, data: { error: { message: 'Bad input' } } },
        },
        422,
        'LLM provider rejected the request. Details: Bad input',
        'LLM_PROVIDER_BAD_REQUEST',
      ],
      [
        {
          response: {
            status: 400,
            data: {
              error: {
                message: 'Content safety violation',
                type: 'moderation',
              },
            },
          },
        },
        422,
        "Request blocked by LLM provider's content safety policy. Details: Content safety violation",
        'LLM_PROVIDER_CONTENT_SAFETY',
      ],
      [
        { response: { status: 503 }, message: 'Service unavailable' }, // Other 5xx from provider
        502, // We map it to 502 Bad Gateway from our end
        'Error communicating with LLM provider: Service unavailable',
        'LLM_PROVIDER_GENERAL_ERROR',
      ],
    ])(
      'should map provider error %j to ApiError with status %s, message "%s", and code "%s"',
      async (providerError, expectedStatus, expectedMessage, expectedCode) => {
        mockInvoke.mockRejectedValue(providerError);
        await expect(
          LlmService._invokeChainAsync('template', {}, new StringOutputParser())
        ).rejects.toEqual(
          expect.objectContaining({
            status: expectedStatus,
            message: expectedMessage,
            errorCode: expectedCode,
          })
        );
        expect(ApiError).toHaveBeenCalledWith(
          expectedStatus,
          expectedMessage,
          expectedCode
        );
      }
    );
  });

  describe('Specific LLM Functions', () => {
    beforeEach(() => {
      // For these tests, ensure LlmService is initialized
      const mockConfig = {
        llm: {
          provider: 'openai',
          model: { openai: 'gpt-4o' },
          apiKey: { openai: 'sk-test' },
        },
      };
      LlmService.init(mockConfig);
    });

    test('nlToRules should call _invokeChain with correct template and parser', async () => {
      mockInvoke.mockResolvedValue(['rule1.', 'rule2.']);
      const text = 'Some text';
      const existingFacts = 'fact1.';
      const ontologyContext = 'onto1.';

      const result = await LlmService.nlToRulesAsync(
        text,
        existingFacts,
        ontologyContext
      );

      expect(mockPipe).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'json' })
      );
      expect(PromptTemplate.fromTemplate().format).toHaveBeenCalledWith({
        existing_facts: existingFacts,
        ontology_context: ontologyContext,
        text_to_translate: text,
      });
      expect(result).toEqual(['rule1.', 'rule2.']);
    });

    test('nlToRulesAsync should throw ApiError if LLM does not return an array', async () => {
      mockInvoke.mockResolvedValue('not an array');
      await expect(LlmService.nlToRulesAsync('text')).rejects.toEqual(
        expect.objectContaining({ status: 422 })
      );
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining(
          'LLM failed to produce a valid JSON array of rules.'
        )
      );
      expect(ApiError).toHaveBeenCalledWith(
        422,
        'LLM failed to produce a valid JSON array of rules.'
      );
    });

    test('queryToProlog should call _invokeChain with correct template and parser', async () => {
      mockInvoke.mockResolvedValue('prolog_query.');
      const question = 'Is this true?';

      const result = await LlmService.queryToPrologAsync(question);

      expect(mockPipe).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'string' })
      );
      expect(PromptTemplate.fromTemplate().format).toHaveBeenCalledWith({
        question,
      });
      expect(result).toBe('prolog_query.');
    });

    test('queryToPrologAsync should throw ApiError if LLM returns empty/whitespace string', async () => {
      const question = 'A question that results in empty output';
      // Mock the behavior of _callLlmAsync for this specific test case if needed,
      // or more directly, mock what _invokeChain returns to _callLlmAsync
      mockInvoke.mockResolvedValue('   '); // LLM returns only whitespace

      await expect(LlmService.queryToPrologAsync(question)).rejects.toEqual(
        expect.objectContaining({
          status: 500,
          message:
            'LLM generated an empty or whitespace-only Prolog query. Cannot proceed with reasoning.',
          errorCode: 'LLM_EMPTY_PROLOG_QUERY_GENERATED',
        })
      );
      expect(logger.error).toHaveBeenCalledWith(
        'LLM generated an empty Prolog query.',
        expect.objectContaining({
          internalErrorCode: 'LLM_EMPTY_PROLOG_QUERY',
          question,
          llmOutput: '   ',
        })
      );
      expect(ApiError).toHaveBeenCalledWith(
        500,
        'LLM generated an empty or whitespace-only Prolog query. Cannot proceed with reasoning.',
        'LLM_EMPTY_PROLOG_QUERY_GENERATED'
      );
    });

    test('resultToNl should call _invokeChain with correct template and parser', async () => {
      mockInvoke.mockResolvedValue('Natural language answer.');
      const originalQuestion = 'What is it?';
      const logicResult = 'true.';
      const style = 'formal';

      const result = await LlmService.resultToNlAsync(
        originalQuestion,
        logicResult,
        style
      );

      expect(mockPipe).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'string' })
      );
      expect(PromptTemplate.fromTemplate().format).toHaveBeenCalledWith({
        style,
        original_question: originalQuestion,
        logic_result: logicResult,
      });
      expect(result).toBe('Natural language answer.');
    });

    test('rulesToNl should call _invokeChain with correct template and parser', async () => {
      mockInvoke.mockResolvedValue('Rules explained.');
      const rules = ['rule1.', 'rule2.'];
      const style = 'conversational';

      const result = await LlmService.rulesToNlAsync(rules, style);

      expect(mockPipe).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'string' })
      );
      expect(PromptTemplate.fromTemplate().format).toHaveBeenCalledWith({
        style,
        prolog_rules: rules.join('\n'),
      });
      expect(result).toBe('Rules explained.');
    });

    test('explainQuery should call _invokeChain with correct template and parser', async () => {
      mockInvoke.mockResolvedValue('Query explanation.');
      const query = 'query(X).';
      const facts = 'fact(a).';
      const ontologyContext = 'ontology(b).';

      const result = await LlmService.explainQueryAsync(
        query,
        facts,
        ontologyContext
      );

      expect(mockPipe).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'string' })
      );
      expect(PromptTemplate.fromTemplate().format).toHaveBeenCalledWith({
        query,
        facts,
        ontology_context: ontologyContext,
      });
      expect(result).toBe('Query explanation.');
    });
  });
});
