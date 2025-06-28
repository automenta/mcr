

const { ChatOpenAI } = require("@langchain/openai");
const { ChatGoogleGenerativeAI } = require("@langchain/google-genai");
const { ChatOllama } = require("@langchain/community/chat_models/ollama");
const { JsonOutputParser, StringOutputParser } = require("@langchain/core/output_parsers");
const { PromptTemplate } = require("@langchain/core/prompts");
const logger = require('./logger');
const ApiError = require('./errors');
const ConfigManager = require('./config');

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
        const template = `You are an expert AI that translates natural language into a list of Prolog facts/rules. Your output MUST be a valid JSON array of strings, where each string is a single, complete Prolog statement ending with a period.
        CONTEXTUAL KNOWLEDGE BASE (existing facts):
        ```prolog
        ${existing_facts}
        ```
        PRE-DEFINED ONTOLOGY (for context):
        ```prolog
        ${ontology_context}
        ```
        Based on ALL the context above, translate ONLY the following new text. Do not repeat facts from the knowledge base.
        TEXT TO TRANSLATE: "{text_to_translate}"
        JSON OUTPUT:`;
        const result = await this._invokeChain(template, { existing_facts, ontology_context, text_to_translate: text }, new JsonOutputParser());
        if (!Array.isArray(result)) {
            logger.error("LLM failed to produce a valid JSON array of rules. Result:", result);
            throw new ApiError(422, "LLM failed to produce a valid JSON array of rules.");
        }
        return result;
    },
    async queryToProlog(question) {
        const template = `Translate the natural language question into a single, valid Prolog query string. The query must end with a period.
        Question: "{question}"
        Prolog Query:`;
        return (await this._invokeChain(template, { question }, new StringOutputParser())).trim();
    },
    async resultToNl(original_question, logic_result, style = 'conversational') {
        const template = `You are a helpful AI assistant. Given an original question and a result from a logic engine, provide a simple, conversational answer.
        Style: {style}
        Original Question: "{original_question}"
        Logic Engine Result: {logic_result}
        Conversational Answer:`;
        return this._invokeChain(template, { style, original_question, logic_result }, new StringOutputParser());
    },
    async rulesToNl(rules, style = 'formal') {
        const template = `Translate the following list of Prolog rules into a single, cohesive natural language explanation.
        Style: {style}
        RULES:
        ```prolog
        ${rules.join('\n')}
        ```
        Natural Language Explanation:`;
        return this._invokeChain(template, { style, prolog_rules: rules.join('\n') }, new StringOutputParser());
    },
    async explainQuery(query, facts, ontology_context) {
        const template = `You are an expert AI that explains Prolog queries in natural language. Given a Prolog query, existing facts, and ontology context, explain what the query is asking and what kind of result to expect.
        EXISTING FACTS:
        ```prolog
        ${facts.join('\n')}
        ```
        ONTOLOGY CONTEXT:
        ```prolog
        ${ontology_context.join('\n')}
        ```
        PROLOG QUERY TO EXPLAIN: "{query}"
        EXPLANATION:`;
        return this._invokeChain(template, { query, facts, ontology_context }, new StringOutputParser());
    }
};

module.exports = LlmService;

