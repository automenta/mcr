const {
  JsonOutputParser,
  StringOutputParser,
} = require('@langchain/core/output_parsers');
const { PromptTemplate } = require('@langchain/core/prompts');
const logger = require('./logger').logger;
const ApiError = require('./errors');
const ConfigManager = require('./config');
const PROMPT_TEMPLATES = require('./prompts');

const OpenAiProvider = require('./llmProviders/openaiProvider');
const GeminiProvider = require('./llmProviders/geminiProvider');
const OllamaProvider = require('./llmProviders/ollamaProvider');

// Remove top-level config load, it will be passed to init
// const config = ConfigManager.load();

/**
 * Service for interacting with Large Language Models (LLMs).
 * It supports multiple providers (OpenAI, Gemini, Ollama) and handles
 * prompt formatting, LLM invocation, and output parsing.
 */
const LlmService = {
  _client: null,
  _providerStrategies: {},

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
   */
  init(appConfig) {
    if (!appConfig || !appConfig.llm) {
        logger.fatal('LLMService.init() called without valid application configuration. LLM Service cannot start.');
        // This scenario should ideally be prevented by ConfigManager exiting on critical load failures.
        // If it still happens, it's a programming error.
        throw new Error('LLMService configuration error: Missing LLM config.');
    }
    this._appConfig = appConfig; // Store the config for later use if needed by other methods

    this.registerProvider(OpenAiProvider);
    this.registerProvider(GeminiProvider);
    this.registerProvider(OllamaProvider);

    const providerName = this._appConfig.llm.provider;
    const providerStrategy = this._providerStrategies[providerName];

    if (providerStrategy) {
      try {
        this._client = providerStrategy.initialize(this._appConfig.llm);
        if (this._client) {
          logger.info(
            `LLM Service initialized with provider: '${providerName}' and model: '${this._appConfig.llm.model[providerName]}'`
          );
        } else {
          // Initialization function of provider should throw or log detailed error
          logger.error( // Changed to error as this is a critical failure for the selected provider
            `LLM client for provider '${providerName}' could not be initialized. LLM service will be impaired or unavailable.`
          );
        }
      } catch (error) {
        logger.error(
          `Critical error during initialization of LLM provider '${providerName}': ${error.message}`,
          {
            internalErrorCode: 'LLM_PROVIDER_INIT_CRITICAL_ERROR',
            providerName,
            originalError: error.message,
            stack: error.stack,
          }
        );
        this._client = null; // Ensure client is null on error
        // Depending on policy, might re-throw to halt server startup if LLM is essential
        // For now, it logs error and _client remains null, leading to 503s.
      }
    } else {
      // This case should be caught by ConfigManager.validate() now.
      // If it still occurs, it's a more severe issue.
      logger.fatal(
        `Unsupported LLM provider configured: '${providerName}'. This should have been caught by config validation. LLM service will not be available.`,
        { internalErrorCode: 'LLM_UNSUPPORTED_PROVIDER_UNCAUGHT', providerName }
      );
      this._client = null;
    }
  },

  /**
   * A private helper to call the LLM with a specific prompt template and input variables.
   * Handles template lookup, invocation, and basic error wrapping.
   * @param {string} templateName - The name of the prompt template (key in PROMPT_TEMPLATES).
   * @param {object} inputVariables - An object containing variables for the prompt template.
   * @param {object} outputParser - An instance of a LangChain output parser.
   * @param {object} errorContext - Context for error reporting.
   * @param {string} errorContext.methodName - Name of the calling public method.
   * @param {string} errorContext.internalErrorCode - Specific internal error code.
   * @param {string} errorContext.customErrorMessage - User-facing error message for unhandled errors.
   * @returns {Promise<any>} The parsed output from the LLM.
   * @throws {ApiError} If template is not found or LLM invocation fails.
   * @private
   */
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
        configuredProvider: this._appConfig ? this._appConfig.llm.provider : 'unknown',
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
      const cause = error.cause;
      const providerName = this._appConfig ? this._appConfig.llm.provider : 'unknown';
      logger.error(
        `LLM invocation error for provider ${providerName}.`,
        {
          internalErrorCode: 'LLM_INVOCATION_ERROR',
          provider: providerName,
          prompt: formattedPrompt,
          llmInput: input,
          errorMessage: error.message,
          errorStack: error.stack,
          responseData: responseData,
          cause: cause,
        }
      );
      const userMessage = responseData?.error?.message || error.message;
      throw new ApiError(
        502,
        `Error communicating with LLM provider: ${userMessage}`
      );
    }
  },

  /**
   * Translates natural language text into a list of Prolog facts/rules.
   * @param {string} text - The natural language text to translate.
   * @param {string} [existing_facts=''] - Optional string of existing Prolog facts for context.
   * @param {string} [ontology_context=''] - Optional string of ontology rules for context.
   * @returns {Promise<string[]>} A promise that resolves to an array of Prolog rule strings.
   * @throws {ApiError} If LLM processing fails or returns an invalid format.
   */
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

  /**
   * Translates a natural language question into a Prolog query string.
   * @param {string} question - The natural language question.
   * @returns {Promise<string>} A promise that resolves to a Prolog query string.
   * @throws {ApiError} If LLM processing fails.
   */
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
    return result.trim();
  },

  /**
   * Translates a Prolog query result back into a natural language answer.
   * @param {string} original_question - The original natural language question.
   * @param {string} logic_result - The JSON stringified result from the Prolog engine.
   * @param {string} [style='conversational'] - The desired style of the natural language answer.
   * @returns {Promise<string>} A promise that resolves to a natural language answer.
   * @throws {ApiError} If LLM processing fails.
   */
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

  /**
   * Translates a list of Prolog rules into a natural language explanation.
   * @param {string[]} rules - An array of Prolog rule strings.
   * @param {string} [style='formal'] - The desired style of the explanation.
   * @returns {Promise<string>} A promise that resolves to a natural language explanation.
   * @throws {ApiError} If LLM processing fails.
   */
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

  /**
   * Generates a natural language explanation of how a Prolog query would be resolved.
   * @param {string} query - The Prolog query string to explain.
   * @param {string[]} facts - An array of existing Prolog facts for context.
   * @param {string[]} ontology_context - An array of ontology rules for context.
   * @returns {Promise<string>} A promise that resolves to a natural language explanation.
   * @throws {ApiError} If LLM processing fails.
   */
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

  /**
   * Retrieves a copy of all loaded prompt templates.
   * @returns {object} A deep copy of the PROMPT_TEMPLATES object.
   */
  getPromptTemplates() {
    return JSON.parse(JSON.stringify(PROMPT_TEMPLATES));
  },
};

module.exports = LlmService;
