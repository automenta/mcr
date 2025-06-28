const { ChatOpenAI } = require("@langchain/openai");
const { ChatGoogleGenerativeAI } = require("@langchain/google-genai");
const { ChatOllama } = require("@langchain/community/chat_models/ollama");
const { JsonOutputParser, StringOutputParser } = require("@langchain/core/output_parsers");
const { PromptTemplate } = require("@langchain/core/prompts");
const logger = require('./logger');
const ApiError = require('./errors');
const ConfigManager = require('./config');
const PROMPT_TEMPLATES = require('./prompts');

const config = ConfigManager.load();

const LlmService = {
    _client: null,
    init() {
        const { provider, model, apiKey, ollamaBaseUrl } = config.llm;
        try {
            switch (provider) {
                case 'openai':
                    if (!apiKey.openai) {
                        logger.warn("OpenAI API key not provided. OpenAI LLM service will not be available.");
                        this._client = null; return;
                    }
                    this._client = new ChatOpenAI({ apiKey: apiKey.openai, modelName: model.openai, temperature: 0 });
                    break;
                case 'gemini':
                    if (!apiKey.gemini) {
                        logger.warn("Gemini API key not provided. Gemini LLM service will not be available.");
                        this._client = null; return;
                    }
                    this._client = new ChatGoogleGenerativeAI({ apiKey: apiKey.gemini, modelName: model.gemini, temperature: 0 });
                    break;
                case 'ollama':
                    this._client = new ChatOllama({ baseUrl: ollamaBaseUrl, model: model.ollama, temperature: 0 });
                    break;
                default:
                    logger.error(`Unsupported LLM provider: ${provider}. LLM service will not be available.`);
                    this._client = null; return;
            }
            logger.info(`LLM Service initialized with provider: '${provider}' and model: '${model[provider]}'`);
        } catch (error) {
            logger.error(`Failed to initialize LLM provider '${provider}': ${error.message}`);
            this._client = null;
        }
    },
    async _invokeChain(promptTemplate, input, outputParser) {
        if (!this._client) {
            logger.error("LLM Service not available or not initialized correctly.");
            throw new ApiError(503, "LLM Service unavailable. Check configuration and API keys.");
        }
        const prompt = await PromptTemplate.fromTemplate(promptTemplate).format(input);
        const chain = this._client.pipe(outputParser);
        try {
            return await chain.invoke(prompt);
        } catch(error) {
            logger.error(`LLM invocation error for provider ${config.llm.provider}: ${error.message}`);
            throw new ApiError(502, `Error communicating with LLM provider: ${error.message}`);
        }
    },
    async nlToRules(text, existing_facts = '', ontology_context = '') {
        const template = PROMPT_TEMPLATES.NL_TO_RULES;
        const result = await this._invokeChain(template, { existing_facts, ontology_context, text_to_translate: text }, new JsonOutputParser());
        if (!Array.isArray(result)) {
            logger.error("LLM failed to produce a valid JSON array of rules. Result:", result);
            throw new ApiError(422, "LLM failed to produce a valid JSON array of rules.");
        }
        return result;
    },
    async queryToProlog(question) {
        const template = PROMPT_TEMPLATES.QUERY_TO_PROLOG;
        return (await this._invokeChain(template, { question }, new StringOutputParser())).trim();
    },
    async resultToNl(original_question, logic_result, style = 'conversational') {
        const template = PROMPT_TEMPLATES.RESULT_TO_NL;
        return this._invokeChain(template, { style, original_question, logic_result }, new StringOutputParser());
    },
    async rulesToNl(rules, style = 'formal') {
        const template = PROMPT_TEMPLATES.RULES_TO_NL;
        return this._invokeChain(template, { style, prolog_rules: rules.join('\n') }, new StringOutputParser());
    },
    async explainQuery(query, facts, ontology_context) {
        const template = PROMPT_TEMPLATES.EXPLAIN_QUERY;
        return this._invokeChain(template, { query, facts, ontology_context }, new StringOutputParser());
    }
};

module.exports = LlmService;