// Define mock logger functions first
const mockLoggerFunctions = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

// Use jest.doMock to control the logger mock precisely
jest.doMock('../src/logger', () => ({
  logger: mockLoggerFunctions,
  reconfigureLogger: jest.fn(),
  initializeLoggerContext: jest.fn((req, res, next) => {
    if (next) next();
  }),
  // Use actual asyncLocalStorage unless it also needs specific mock behavior
  asyncLocalStorage: jest.requireActual('../src/logger').asyncLocalStorage,
}));

// Now import modules that depend on the logger
const LlmService = require('../src/llmService');
const { ChatOpenAI } = require('@langchain/openai');
const { ChatGoogleGenerativeAI } = require('@langchain/google-genai');
const { ChatOllama } = require('@langchain/community/chat_models/ollama');
const {
  JsonOutputParser,
  StringOutputParser,
} = require('@langchain/core/output_parsers');
const { PromptTemplate } = require('@langchain/core/prompts');
// const logger = require('../src/logger'); // No longer needed here, mock is applied via doMock
const ApiError = require('../src/errors');
const ConfigManager = require('../src/config');
const PROMPT_TEMPLATES = require('../src/prompts');

jest.mock('@langchain/openai');
jest.mock('@langchain/google-genai');
jest.mock('@langchain/community/chat_models/ollama');
jest.mock('@langchain/core/output_parsers');
jest.mock('@langchain/core/prompts');
// jest.mock('../src/logger'); // REMOVED - Handled by jest.doMock
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

    // Update ApiError mock to include errorCode and name
    ApiError.mockImplementation((status, message, errorCode) => {
      const err = new Error(message); // So it's an actual error object
      err.status = status;
      err.statusCode = status; // Common alias
      err.errorCode = errorCode;
      err.name = 'ApiError';
      return err;
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset LlmService state before each test in this describe block if necessary
    // LlmService._client = null; // This is done in the top-level beforeEach now
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
      expect(mockLoggerFunctions.info).toHaveBeenCalledWith(
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
      expect(mockLoggerFunctions.warn).toHaveBeenCalledWith(
        'OpenAI API key not provided. OpenAI LLM service will not be available for this provider.',
        { internalErrorCode: 'OPENAI_API_KEY_MISSING' }
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
      expect(mockLoggerFunctions.info).toHaveBeenCalledWith(
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
      expect(mockLoggerFunctions.warn).toHaveBeenCalledWith(
        'Gemini API key not provided. Gemini LLM service will not be available for this provider.',
        { internalErrorCode: 'GEMINI_API_KEY_MISSING' }
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
      expect(mockLoggerFunctions.info).toHaveBeenCalledWith(
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
      expect(mockLoggerFunctions.error).toHaveBeenCalledWith(
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
      expect(mockLoggerFunctions.error).toHaveBeenNthCalledWith(2,
        "LLM client for provider 'openai' could not be initialized. LLM service will be impaired or unavailable."
        // Note: The metadata for this specific log in LlmService.js doesn't have an internalErrorCode
        // or other details like the "Critical error..." log does. If we want to be more precise,
        // we can add 'undefined' or 'expect.anything()' for the second arg if no metadata is logged.
        // LlmService code: logger.error(`LLM client for provider ...`); - no second arg.
      );
    });
  });

  describe('LLM Invocation (_invokeChainAsync)', () => {
    beforeEach(() => {
      const mockConfig = {
        llm: {
          provider: 'openai',
          model: { openai: 'gpt-4o' },
          apiKey: { openai: 'sk-test' },
        },
        // Add other necessary config properties if LlmService.init or other parts depend on them
        logging: { level: 'test' }, // Example: if logger reconfiguration is triggered
      };
      ConfigManager.load.mockReturnValue(mockConfig);
      LlmService.init(mockConfig); // Pass the object directly
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
      expect(mockLoggerFunctions.error).toHaveBeenCalledWith(
        'LLM Service not available or not initialized correctly.',
        {
          internalErrorCode: 'LLM_SERVICE_UNAVAILABLE',
          configuredProvider: 'openai', // Based on the mockConfig in beforeEach
        }
      );
      expect(ApiError).toHaveBeenCalledWith(
        503,
        'LLM Service unavailable. Check configuration and API keys.'
      );
    });

    test('should call prompt format and chain invoke with correct arguments', async () => {
      mockInvoke.mockResolvedValue('LLM Response');
      const mockInput = { key: 'value' };
      const mockOutputParser = new StringOutputParser(); // Use an actual (mocked) parser type
      const mockFormatFnInstance = jest.fn(input => `Formatted: TEST_TEMPLATE ${JSON.stringify(input)}`);

      PromptTemplate.fromTemplate.mockImplementationOnce((template) => {
        // Ensure this specific mock is for 'TEST_TEMPLATE' if necessary, or make it generic
        if (template === 'TEST_TEMPLATE') {
          return { format: mockFormatFnInstance };
        }
        // Fallback or error for other templates if this mock is too specific
        return { format: jest.fn() }; // Default fallback
      });

      const result = await LlmService._invokeChainAsync(
        'TEST_TEMPLATE',
        mockInput,
        mockOutputParser
      );

      expect(PromptTemplate.fromTemplate).toHaveBeenCalledWith('TEST_TEMPLATE');
      expect(mockFormatFnInstance).toHaveBeenCalledWith(mockInput); // Check the specific mock function
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
      expect(mockLoggerFunctions.error).toHaveBeenCalledWith(
        expect.stringContaining('LLM invocation error for provider openai.'),
        expect.objectContaining({
          internalErrorCode: 'LLM_INVOCATION_ERROR',
          provider: 'openai',
          errorMessage: 'LLM API error',
        })
      );
      expect(ApiError).toHaveBeenCalledWith(
        502,
        expect.stringContaining('Error communicating with LLM provider: LLM API error'), // More specific message
        'LLM_PROVIDER_GENERAL_ERROR' // Add the errorCode
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

      const mockFormatFnInstance = jest.fn();
      PromptTemplate.fromTemplate.mockImplementationOnce(() => ({ format: mockFormatFnInstance }));

      // Re-call the function to ensure the mockImplementationOnce is used for this specific call path
      // Or, if LlmService.nlToRulesAsync internally calls _invokeChainAsync which then calls fromTemplate,
      // we need to ensure the mock is set *before* nlToRulesAsync is called.
      // The current structure where nlToRulesAsync calls _callLlmAsync which calls _invokeChainAsync
      // means the mock should be set before nlToRulesAsync.

      // Let's reset and set up specifically for this call.
      PromptTemplate.fromTemplate.mockReset(); // Reset general mock
      const specificMockFormatFn = jest.fn().mockImplementation(input => JSON.stringify(input)); // Simple mock for format
      PromptTemplate.fromTemplate.mockImplementation(templateName => {
        if (templateName === PROMPT_TEMPLATES.NL_TO_RULES) {
          return { format: specificMockFormatFn };
        }
        // Fallback for other templates if any are used unexpectedly
        return { format: jest.fn() };
      });

      const resultAct = await LlmService.nlToRulesAsync(text, existingFacts, ontologyContext);

      expect(specificMockFormatFn).toHaveBeenCalledWith({
        existing_facts: existingFacts,
        ontology_context: ontologyContext,
        text_to_translate: text,
      });
      expect(resultAct).toEqual(['rule1.', 'rule2.']);
    });

    test('nlToRulesAsync should throw ApiError if LLM does not return an array', async () => {
      mockInvoke.mockResolvedValue('not an array');
      await expect(LlmService.nlToRulesAsync('text')).rejects.toEqual(
        expect.objectContaining({ status: 422 })
      );
      expect(mockLoggerFunctions.error).toHaveBeenCalledWith(
        'LLM failed to produce a valid JSON array of rules.',
        expect.objectContaining({
          internalErrorCode: 'LLM_INVALID_JSON_ARRAY_RULES',
          templateName: 'NL_TO_RULES',
          // input: { existing_facts: '', ontology_context: '', text_to_translate: 'text' }, // Input can vary
          resultReceived: 'not an array',
        })
      );
      expect(ApiError).toHaveBeenCalledWith(
        422,
        'LLM failed to produce a valid JSON array of rules. The output was not an array.'
      );
    });

    test('queryToProlog should call _invokeChain with correct template and parser', async () => {
      mockInvoke.mockResolvedValue('prolog_query.');
      const question = 'Is this true?';

      const result = await LlmService.queryToPrologAsync(question);

      expect(mockPipe).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'string' })
      );

      // Reset and set up specifically for this call.
      PromptTemplate.fromTemplate.mockReset();
      const specificMockFormatFn = jest.fn().mockImplementation(input => JSON.stringify(input));
      PromptTemplate.fromTemplate.mockImplementation(templateName => {
        if (templateName === PROMPT_TEMPLATES.QUERY_TO_PROLOG) {
          return { format: specificMockFormatFn };
        }
        return { format: jest.fn() };
      });

      const resultAct = await LlmService.queryToPrologAsync(question);

      expect(specificMockFormatFn).toHaveBeenCalledWith({
        question,
      });
      expect(resultAct).toBe('prolog_query.');
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
      expect(mockLoggerFunctions.error).toHaveBeenCalledWith(
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

      // Reset and set up specifically for this call.
      PromptTemplate.fromTemplate.mockReset();
      const specificMockFormatFn = jest.fn().mockImplementation(input => JSON.stringify(input));
      PromptTemplate.fromTemplate.mockImplementation(templateName => {
        if (templateName === PROMPT_TEMPLATES.RESULT_TO_NL) {
          return { format: specificMockFormatFn };
        }
        return { format: jest.fn() };
      });

      const resultAct = await LlmService.resultToNlAsync(originalQuestion, logicResult, style);

      expect(specificMockFormatFn).toHaveBeenCalledWith({
        style,
        original_question: originalQuestion,
        logic_result: logicResult,
      });
      expect(resultAct).toBe('Natural language answer.');
    });

    test('rulesToNl should call _invokeChain with correct template and parser', async () => {
      mockInvoke.mockResolvedValue('Rules explained.');
      const rules = ['rule1.', 'rule2.'];
      const style = 'conversational';

      const result = await LlmService.rulesToNlAsync(rules, style);

      expect(mockPipe).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'string' })
      );

      // Reset and set up specifically for this call.
      PromptTemplate.fromTemplate.mockReset();
      const specificMockFormatFn = jest.fn().mockImplementation(input => JSON.stringify(input));
      PromptTemplate.fromTemplate.mockImplementation(templateName => {
        if (templateName === PROMPT_TEMPLATES.RULES_TO_NL) {
          return { format: specificMockFormatFn };
        }
        return { format: jest.fn() };
      });

      const resultAct = await LlmService.rulesToNlAsync(rules, style);

      expect(specificMockFormatFn).toHaveBeenCalledWith({
        style,
        prolog_rules: rules.join('\n'),
      });
      expect(resultAct).toBe('Rules explained.');
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

      // Reset and set up specifically for this call.
      PromptTemplate.fromTemplate.mockReset();
      const specificMockFormatFn = jest.fn().mockImplementation(input => JSON.stringify(input));
      PromptTemplate.fromTemplate.mockImplementation(templateName => {
        if (templateName === PROMPT_TEMPLATES.EXPLAIN_QUERY) {
          return { format: specificMockFormatFn };
        }
        return { format: jest.fn() };
      });

      const resultAct = await LlmService.explainQueryAsync(query, facts, ontologyContext);

      expect(specificMockFormatFn).toHaveBeenCalledWith({
        query,
        facts,
        ontology_context: ontologyContext,
      });
      expect(resultAct).toBe('Query explanation.');
    });
  });
});
