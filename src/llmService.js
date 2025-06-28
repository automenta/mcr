const { JsonOutputParser, StringOutputParser } = require("@langchain/core/output_parsers");
const { PromptTemplate } = require("@langchain/core/prompts");
const logger = require('./logger').logger; // Ensure we get the logger object
const ApiError = require('./errors');
const ConfigManager = require('./config');
const PROMPT_TEMPLATES = require('./prompts');

// Load provider strategies
const OpenAiProvider = require('./llmProviders/openaiProvider');
const GeminiProvider = require('./llmProviders/geminiProvider');
const OllamaProvider = require('./llmProviders/ollamaProvider');

const config = ConfigManager.load();

const LlmService = {
    _client: null,
    _providerStrategies: {}, // Registry for provider initialization logic

    registerProvider(providerStrategy) {
        if (providerStrategy && providerStrategy.name && typeof providerStrategy.initialize === 'function') {
            this._providerStrategies[providerStrategy.name] = providerStrategy;
            logger.debug(`LLM provider strategy '${providerStrategy.name}' registered.`);
        } else {
            logger.warn('Attempted to register invalid LLM provider strategy.', { strategy: providerStrategy });
        }
    },

    init() {
        // Register known providers
        this.registerProvider(OpenAiProvider);
        this.registerProvider(GeminiProvider);
        this.registerProvider(OllamaProvider);
        // To add a new provider, create its file in llmProviders/ and register it here.

        const providerName = config.llm.provider;
        const providerStrategy = this._providerStrategies[providerName];

        if (providerStrategy) {
            try {
                this._client = providerStrategy.initialize(config.llm);
                if (this._client) {
                    logger.info(`LLM Service initialized with provider: '${providerName}' and model: '${config.llm.model[providerName]}'`);
                } else {
                    // Initialization might have failed and returned null (e.g. missing API key)
                    // The provider's initialize method should have logged the specific reason.
                    logger.warn(`LLM client for provider '${providerName}' could not be initialized. LLM service may be impaired or unavailable.`);
                }
            } catch (error) {
                logger.error(`Error during initialization of LLM provider '${providerName}': ${error.message}`, {
                    internalErrorCode: 'LLM_PROVIDER_INIT_ERROR',
                    providerName,
                    originalError: error.message,
                    stack: error.stack
                });
                this._client = null;
            }
        } else {
            logger.error(`Unsupported LLM provider configured: '${providerName}'. LLM service will not be available.`, { internalErrorCode: 'LLM_UNSUPPORTED_PROVIDER', providerName });
            this._client = null;
        }
    },
    async _invokeChain(promptTemplate, input, outputParser) {
        if (!this._client) {
            logger.error("LLM Service not available or not initialized correctly.", { internalErrorCode: 'LLM_SERVICE_UNAVAILABLE', configuredProvider: config.llm.provider });
            throw new ApiError(503, "LLM Service unavailable. Check configuration and API keys.");
        }

        let formattedPrompt;
        try {
            // Langchain's PromptTemplate.format can throw if keys are missing, so we wrap this too.
            formattedPrompt = await PromptTemplate.fromTemplate(promptTemplate).format(input);
        } catch (formattingError) {
            logger.error("Error formatting LLM prompt template.", {
                internalErrorCode: 'LLM_PROMPT_FORMATTING_ERROR',
                template: promptTemplate,
                inputKeys: Object.keys(input),
                error: formattingError.message,
                stack: formattingError.stack
            });
            throw new ApiError(500, `Internal error formatting LLM prompt: ${formattingError.message}`);
        }

        const chain = this._client.pipe(outputParser);
        try {
            return await chain.invoke(formattedPrompt);
        } catch(error) {
            // Attempt to get more detailed error information if available (e.g. from AxiosError)
            const responseData = error.response?.data;
            const cause = error.cause; // Langchain errors often have a 'cause'
            logger.error(`LLM invocation error for provider ${config.llm.provider}.`, {
                internalErrorCode: 'LLM_INVOCATION_ERROR',
                provider: config.llm.provider,
                prompt: formattedPrompt, // Log the actual prompt sent
                llmInput: input,         // Log the structured input to the template
                errorMessage: error.message,
                errorStack: error.stack,
                responseData: responseData, // Log raw response data from LLM provider if available
                cause: cause, // Log the underlying cause if available
            });
            const userMessage = responseData?.error?.message || error.message; // Use provider's error if available
            throw new ApiError(502, `Error communicating with LLM provider: ${userMessage}`);
        }
    },
    async nlToRules(text, existing_facts = '', ontology_context = '') {
        const templateName = 'NL_TO_RULES';
        const template = PROMPT_TEMPLATES[templateName];
        const input = { existing_facts, ontology_context, text_to_translate: text };
        try {
            const result = await this._invokeChain(template, input, new JsonOutputParser());
            if (!Array.isArray(result)) {
                logger.error("LLM failed to produce a valid JSON array of rules.", {
                    internalErrorCode: 'LLM_INVALID_JSON_ARRAY_RULES',
                    templateName,
                    input,
                    resultReceived: result
                });
                throw new ApiError(422, "LLM failed to produce a valid JSON array of rules. The output was not an array.");
            }
            return result;
        } catch (error) {
            if (error instanceof ApiError) throw error; // Re-throw ApiErrors from _invokeChain or this function
            logger.error("Unhandled error in nlToRules.", { internalErrorCode: 'NL_TO_RULES_UNHANDLED_ERROR', error: error.message, stack: error.stack });
            throw new ApiError(500, "An unexpected error occurred during natural language to rules translation.");
        }
    },
    async queryToProlog(question) {
        const templateName = 'QUERY_TO_PROLOG';
        const template = PROMPT_TEMPLATES[templateName];
        const input = { question };
        try {
            return (await this._invokeChain(template, input, new StringOutputParser())).trim();
        } catch (error) {
            if (error instanceof ApiError) throw error;
            logger.error("Unhandled error in queryToProlog.", { internalErrorCode: 'QUERY_TO_PROLOG_UNHANDLED_ERROR', error: error.message, stack: error.stack });
            throw new ApiError(500, "An unexpected error occurred during query to Prolog translation.");
        }
    },
    async resultToNl(original_question, logic_result, style = 'conversational') {
        const templateName = 'RESULT_TO_NL';
        const template = PROMPT_TEMPLATES[templateName];
        const input = { style, original_question, logic_result };
        try {
            return await this._invokeChain(template, input, new StringOutputParser());
        } catch (error) {
            if (error instanceof ApiError) throw error;
            logger.error("Unhandled error in resultToNl.", { internalErrorCode: 'RESULT_TO_NL_UNHANDLED_ERROR', error: error.message, stack: error.stack });
            throw new ApiError(500, "An unexpected error occurred during result to natural language translation.");
        }
    },
    async rulesToNl(rules, style = 'formal') {
        const templateName = 'RULES_TO_NL';
        const template = PROMPT_TEMPLATES[templateName];
        const input = { style, prolog_rules: rules.join('\n') };
        try {
            return await this._invokeChain(template, input, new StringOutputParser());
        } catch (error) {
            if (error instanceof ApiError) throw error;
            logger.error("Unhandled error in rulesToNl.", { internalErrorCode: 'RULES_TO_NL_UNHANDLED_ERROR', error: error.message, stack: error.stack });
            throw new ApiError(500, "An unexpected error occurred during rules to natural language translation.");
        }
    },
    async explainQuery(query, facts, ontology_context) {
        const templateName = 'EXPLAIN_QUERY';
        const template = PROMPT_TEMPLATES[templateName];
        const input = { query, facts, ontology_context };
        try {
            return await this._invokeChain(template, input, new StringOutputParser());
        } catch (error) {
            if (error instanceof ApiError) throw error;
            logger.error("Unhandled error in explainQuery.", { internalErrorCode: 'EXPLAIN_QUERY_UNHANDLED_ERROR', error: error.message, stack: error.stack });
            throw new ApiError(500, "An unexpected error occurred during query explanation.");
        }
    },
    getPromptTemplates() {
        // Returns a copy to prevent external modification of the original templates object
        return JSON.parse(JSON.stringify(PROMPT_TEMPLATES));
    }
};

module.exports = LlmService;