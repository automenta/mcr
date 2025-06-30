const {
  JsonOutputParser,
  StringOutputParser,
} = require('@langchain/core/output_parsers');
const { PromptTemplate } = require('@langchain/core/prompts');
const logger = require('./logger').logger;
const ApiError = require('./errors');
// const ConfigManager = require('./config'); // Unused import
const PROMPT_TEMPLATES = require('./prompts');

const OpenAiProvider = require('./llmProviders/openaiProvider');
const GeminiProvider = require('./llmProviders/geminiProvider');
const OllamaProvider = require('./llmProviders/ollamaProvider');

/**
 * Service for interacting with Large Language Models (LLMs).
 * It supports multiple providers (OpenAI, Gemini, Ollama) and handles
 * prompt formatting, LLM invocation, and output parsing.
 */
const LlmService = {
  _client: null,
  _providerStrategies: {}, // Internal storage if not using optional map
  _appConfig: null, // To store appConfig
  _activeProviderName: null, // To store the name of the active provider

  /**
   * Registers an LLM provider strategy.
   * @param {object} providerStrategy - The provider strategy object.
   * @param {string} providerStrategy.name - Name of the provider (e.g., 'openai').
   * @param {function} providerStrategy.initialize - Function to initialize the provider client.
   * @private
   */
  registerProvider(providerStrategy) {
    if (
      providerStrategy &&
      providerStrategy.name &&
      typeof providerStrategy.initialize === 'function'
    ) {
      this._providerStrategies[providerStrategy.name] = providerStrategy;
      logger.debug(
        `LLM provider strategy '${providerStrategy.name}' registered.`
      );
    } else {
      logger.warn('Attempted to register invalid LLM provider strategy.', {
        strategy: providerStrategy,
      });
    }
  },

  /**
   * Initializes the LLM service by selecting and configuring the LLM provider
   * based on the application configuration.
   * @param {object} appConfig - The application configuration object.
   * @param {object} [optionalProviderStrategies=null] - Optional object mapping provider names to strategies, for testing.
   */
  init(appConfig, optionalProviderStrategies = null) {
    if (!appConfig || !appConfig.llm) {
      logger.error(
        'LLMService.init() called without valid application configuration. LLM Service cannot start.'
      );
      throw new Error('LLMService configuration error: Missing LLM config.');
    }
    this._appConfig = appConfig;

    let providerStrategy;
    const providerName = this._appConfig.llm.provider;
    let currentStrategies = this._providerStrategies;

    if (optionalProviderStrategies) {
      currentStrategies = optionalProviderStrategies;
      providerStrategy = currentStrategies[providerName];
      if (!providerStrategy) {
        logger.warn(
          `LLM provider '${providerName}' not found in optionalProviderStrategies. LLM service may be impaired.`,
          { providerName }
        );
      }
    } else {
      // Default behavior: register known providers and look up from internal storage
      this._providerStrategies = {}; // Clear previous internal strategies
      this.registerProvider(OpenAiProvider);
      this.registerProvider(GeminiProvider);
      this.registerProvider(OllamaProvider);
      providerStrategy = this._providerStrategies[providerName];
    }

    this._client = null;
    this._activeProviderName = null;

    if (providerStrategy && typeof providerStrategy.initialize === 'function') {
      try {
        this._client = await providerStrategy.initialize(this._appConfig.llm); // Added await
        if (this._client) {
          this._activeProviderName = providerStrategy.name; // Set active provider name
          logger.info(
            `LLM Service initialized with provider: '${this._activeProviderName}' and model: '${this._appConfig.llm.model[this._activeProviderName]}'`
          );
        } else {
          logger.error(
            `LLM client for provider '${providerName}' could not be initialized (initialize returned null/undefined). LLM service will be impaired or unavailable.`
          );
        }
      } catch (error) {
        logger.error(
          `Critical error during initialization of LLM provider '${providerName}' (using ${optionalProviderStrategies ? 'optional strategies' : 'internal registration'}): ${error.message}`,
          {
            internalErrorCode: 'LLM_PROVIDER_INIT_CRITICAL_ERROR',
            providerName,
            originalError: error.message,
            stack: error.stack,
          }
        );
        this._client = null;
      }
    } else {
      logger.error(
        `Unsupported or missing LLM provider strategy for '${providerName}' (using ${optionalProviderStrategies ? 'optional strategies' : 'internal registration'}). LLM service will not be available.`,
        {
          internalErrorCode: 'LLM_PROVIDER_STRATEGY_NOT_FOUND',
          providerName,
          usingOptionalStrategies: !!optionalProviderStrategies,
        }
      );
      this._client = null;
    }
  },

  async _callLlmAsync(
    templateName,
    inputVariables,
    outputParser,
    errorContext
  ) {
    const template = PROMPT_TEMPLATES[templateName];
    if (!template) {
      logger.error(`Prompt template '${templateName}' not found.`, {
        internalErrorCode: 'LLM_TEMPLATE_NOT_FOUND',
        templateName,
      });
      throw new ApiError(
        500,
        `Internal error: Prompt template '${templateName}' not found.`
      );
    }
    try {
      return await this._invokeChainAsync(
        template,
        inputVariables,
        outputParser
      );
    } catch (error) {
      if (error instanceof ApiError) throw error;
      logger.error(`Unhandled error in ${errorContext.methodName}.`, {
        internalErrorCode: errorContext.internalErrorCode,
        templateName,
        inputVariables,
        error: error.message,
        stack: error.stack,
      });
      throw new ApiError(500, errorContext.customErrorMessage);
    }
  },

  async _invokeChainAsync(promptTemplate, input, outputParser) {
    if (!this._client) {
      logger.error('LLM Service not available or not initialized correctly.', {
        internalErrorCode: 'LLM_SERVICE_UNAVAILABLE',
        configuredProvider: this._appConfig
          ? this._appConfig.llm.provider
          : 'unknown',
        activeProviderName: this._activeProviderName || 'none',
      });
      throw new ApiError(
        503,
        'LLM Service unavailable. Check configuration and API keys.'
      );
    }

    let formattedPrompt;
    try {
      formattedPrompt =
        await PromptTemplate.fromTemplate(promptTemplate).format(input);
    } catch (formattingError) {
      logger.error('Error formatting LLM prompt template.', {
        internalErrorCode: 'LLM_PROMPT_FORMATTING_ERROR',
        template: promptTemplate,
        inputKeys: Object.keys(input),
        error: formattingError.message,
        stack: formattingError.stack,
      });
      throw new ApiError(
        500,
        `Internal error formatting LLM prompt: ${formattingError.message}`
      );
    }

    const chain = this._client.pipe(outputParser);
    try {
      return await chain.invoke(formattedPrompt);
    } catch (error) {
      const responseData = error.response?.data;
      const errorStatus = error.response?.status || error.status;
      const cause = error.cause;
      const providerName =
        this._activeProviderName ||
        (this._appConfig ? this._appConfig.llm.provider : 'unknown');

      logger.error(`LLM invocation error for provider ${providerName}.`, {
        internalErrorCode: 'LLM_INVOCATION_ERROR',
        provider: providerName,
        llmInputKeys: Object.keys(input || {}),
        errorMessage: error.message,
        errorStack: error.stack,
        errorStatus,
        responseData,
        cause,
      });

      let statusCode = 502;
      let message = `Error communicating with LLM provider: ${error.message}`;
      let errorCode = 'LLM_PROVIDER_GENERAL_ERROR';

      // Add specific advice for Ollama fetch errors
      if (providerName === 'ollama' && error.message?.toLowerCase().includes('fetch failed')) {
        message += ` (Ensure Ollama server is running and accessible at the configured MCR_LLM_OLLAMA_BASE_URL: ${this._appConfig.llm.ollamaBaseUrl}. Also, verify the model '${this._appConfig.llm.model.ollama}' is available in Ollama.)`;
      }

      if (errorStatus) {
        if (errorStatus === 401 || errorStatus === 403) {
          statusCode = 500;
          message = `LLM provider authentication/authorization error. Please check server configuration (API key, permissions).`;
          errorCode = 'LLM_PROVIDER_AUTH_ERROR';
        } else if (errorStatus === 429) {
          statusCode = 429;
          message = `LLM provider rate limit exceeded. Please try again later.`;
          errorCode = 'LLM_PROVIDER_RATE_LIMIT';
        } else if (errorStatus === 404) {
          statusCode = 500;
          message = `LLM provider model or endpoint not found. Please check server configuration. Details: ${responseData?.error?.message || error.message}`;
          errorCode = 'LLM_PROVIDER_NOT_FOUND';
        } else if (errorStatus >= 400 && errorStatus < 500) {
          statusCode = 422;
          message = `LLM provider rejected the request. Details: ${responseData?.error?.message || error.message}`;
          errorCode = 'LLM_PROVIDER_BAD_REQUEST';
          if (
            responseData?.error?.type?.includes('moderation') ||
            responseData?.error?.code?.includes(' bezpieczeństwa') ||
            responseData?.error?.message?.toLowerCase().includes('safety')
          ) {
            errorCode = 'LLM_PROVIDER_CONTENT_SAFETY';
            message = `Request blocked by LLM provider's content safety policy. Details: ${responseData?.error?.message || error.message}`;
          }
        }
      } else if (error.message?.toLowerCase().includes('api key')) {
        statusCode = 500;
        message = `LLM provider authentication/authorization error (API key related). Please check server configuration.`;
        errorCode = 'LLM_PROVIDER_AUTH_ERROR';
      }
      throw new ApiError(statusCode, message, errorCode);
    }
  },

  async nlToRulesAsync(text, existing_facts = '', ontology_context = '') {
    const result = await this._callLlmAsync(
      'NL_TO_RULES',
      { existing_facts, ontology_context, text_to_translate: text },
      new JsonOutputParser(),
      {
        methodName: 'nlToRulesAsync',
        internalErrorCode: 'NL_TO_RULES_UNHANDLED_ERROR',
        customErrorMessage:
          'An unexpected error occurred during natural language to rules translation.',
      }
    );
    if (!Array.isArray(result)) {
      logger.error('LLM failed to produce a valid JSON array of rules.', {
        internalErrorCode: 'LLM_INVALID_JSON_ARRAY_RULES',
        templateName: 'NL_TO_RULES',
        input: { existing_facts, ontology_context, text_to_translate: text },
        resultReceived: result,
      });
      throw new ApiError(
        422,
        'LLM failed to produce a valid JSON array of rules. The output was not an array.'
      );
    }
    return result;
  },

  async queryToPrologAsync(question) {
    const result = await this._callLlmAsync(
      'QUERY_TO_PROLOG',
      { question },
      new StringOutputParser(),
      {
        methodName: 'queryToPrologAsync',
        internalErrorCode: 'QUERY_TO_PROLOG_UNHANDLED_ERROR',
        customErrorMessage:
          'An unexpected error occurred during query to Prolog translation.',
      }
    );
    const trimmedResult = result.trim();
    if (!trimmedResult) {
      logger.error('LLM generated an empty Prolog query.', {
        internalErrorCode: 'LLM_EMPTY_PROLOG_QUERY',
        question,
        llmOutput: result,
      });
      throw new ApiError(
        500,
        'LLM generated an empty or whitespace-only Prolog query. Cannot proceed with reasoning.',
        'LLM_EMPTY_PROLOG_QUERY_GENERATED'
      );
    }
    return trimmedResult;
  },

  async resultToNlAsync(
    original_question,
    logic_result,
    style = 'conversational'
  ) {
    return this._callLlmAsync(
      'RESULT_TO_NL',
      { style, original_question, logic_result },
      new StringOutputParser(),
      {
        methodName: 'resultToNlAsync',
        internalErrorCode: 'RESULT_TO_NL_UNHANDLED_ERROR',
        customErrorMessage:
          'An unexpected error occurred during result to natural language translation.',
      }
    );
  },

  async rulesToNlAsync(rules, style = 'formal') {
    return this._callLlmAsync(
      'RULES_TO_NL',
      { style, prolog_rules: rules.join('\n') },
      new StringOutputParser(),
      {
        methodName: 'rulesToNlAsync',
        internalErrorCode: 'RULES_TO_NL_UNHANDLED_ERROR',
        customErrorMessage:
          'An unexpected error occurred during rules to natural language translation.',
      }
    );
  },

  async explainQueryAsync(query, facts, ontology_context) {
    return this._callLlmAsync(
      'EXPLAIN_QUERY',
      { query, facts, ontology_context },
      new StringOutputParser(),
      {
        methodName: 'explainQueryAsync',
        internalErrorCode: 'EXPLAIN_QUERY_UNHANDLED_ERROR',
        customErrorMessage:
          'An unexpected error occurred during query explanation.',
      }
    );
  },

  getPromptTemplates() {
    return JSON.parse(JSON.stringify(PROMPT_TEMPLATES));
  },

  getActiveProviderName() {
    return this._activeProviderName;
  },

  getActiveModelName() {
    if (this._activeProviderName && this._appConfig && this._appConfig.llm && this._appConfig.llm.model) {
      return this._appConfig.llm.model[this._activeProviderName];
    }
    return 'unknown';
  },
};

module.exports = LlmService;
