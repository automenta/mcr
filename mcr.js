#!/usr/bin/env node

/**
 * Model Context Reasoner (MCR) - Version 2
 *
 * A single-file, self-installing, modular Node.js server providing a stateful,
 * API-driven bridge between LLMs (OpenAI, Gemini, Ollama) and a Prolog reasoner.
 *
 * REFACTOR HIGHLIGHTS:
 * - MODULARITY: Code is split into logical services (Config, LLM, Reasoner, etc.).
 * - LLM SUPPORT: Natively supports 'openai', 'gemini', and 'ollama' providers.
 * - ROBUSTNESS: Centralized error handling and stricter config validation.
 * - DEDUPLICATION: LLM prompting and reasoner logic are now in reusable services.
 *
 * --- SETUP ---
 * 1. Save this file as `mcr.js`.
 * 2. Create a `.env` file in the same directory.
 * 3. Add the required environment variables for your chosen LLM provider.
 *
 * --- .env FILE EXAMPLE ---
 * # For OpenAI:
 * OPENAI_API_KEY="sk-..."
 *
 * # For Google Gemini:
 * GEMINI_API_KEY="..."
 *
 * # For local Ollama (no key needed by default):
 * # MCR_LLM_OLLAMA_BASE_URL="http://localhost:11434"
 *
 * 4. Run the script: `node mcr.js`
 */

// -----------------------------------------------------------------------------
// SECTION 1: Setup (Dependencies are managed by package.json)
// -----------------------------------------------------------------------------

// Automatic dependency installation has been removed.
// Please use `npm install` to install dependencies listed in package.json.

// --- Early require of dotenv to make env vars available for ConfigManager ---
// Note: dotenv.config() is also called inside main(), which is fine,
// but having it here ensures process.env is populated for global ConfigManager.load()
require('dotenv').config();

// -------------------------------------------------------------------------
// CONFIGURATION & LOGGER (Global Scope)
// Must be defined before main() if main() relies on them being pre-initialized,
// or if other global scope code needs them (like LlmService.init below).
// -------------------------------------------------------------------------

// Forward declaration for logger in ConfigManager.validate
let logger;

const ConfigManager = {
    load() {
        const config = {
            server: {
                host: process.env.HOST || '0.0.0.0',
                port: parseInt(process.env.PORT || '8080', 10),
            },
            llm: {
                provider: process.env.MCR_LLM_PROVIDER || 'openai', // 'openai', 'gemini', 'ollama'
                model: {
                    openai: process.env.MCR_LLM_MODEL_OPENAI || 'gpt-4o',
                    gemini: process.env.MCR_LLM_MODEL_GEMINI || 'gemini-pro',
                    ollama: process.env.MCR_LLM_MODEL_OLLAMA || 'llama3',
                },
                apiKey: {
                    openai: process.env.OPENAI_API_KEY,
                    gemini: process.env.GEMINI_API_KEY,
                },
                ollamaBaseUrl: process.env.MCR_LLM_OLLAMA_BASE_URL || 'http://localhost:11434',
            },
            logging: {
                level: process.env.LOG_LEVEL || 'info',
                file: 'mcr.log',
            }
        };
        // Temporarily use console.warn if logger not yet initialized during first validation pass
        const tempLogger = logger || { warn: console.warn, error: console.error };
        this.validate(config, tempLogger);
        return config;
    },
    validate(config, currentLogger) { // Pass logger to allow for early validation logging
        const { provider, apiKey } = config.llm;
        if (provider === 'openai' && !apiKey.openai) {
            currentLogger.warn("MCR_LLM_PROVIDER is 'openai' but OPENAI_API_KEY is not set. OpenAI functionality will not work.");
        }
        if (provider === 'gemini' && !apiKey.gemini) {
            currentLogger.warn("MCR_LLM_PROVIDER is 'gemini' but GEMINI_API_KEY is not set. Gemini functionality will not work.");
        }
    }
};

const config = ConfigManager.load();
const winston = require('winston'); // winston can be required after config is loaded

logger = winston.createLogger({ // Assign to the previously declared logger
    level: config.logging.level,
    format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
    transports: [
        new winston.transports.File({ filename: config.logging.file }),
        new winston.transports.Console({
            format: winston.format.combine(winston.format.colorize(), winston.format.simple())
        }),
    ],
});

// Re-validate with the proper logger if necessary, or rely on LlmService.init to log
// ConfigManager.validate(config, logger); // This would log again, using the configured logger.

// -----------------------------------------------------------------------------
// SECTION 2: MAIN APPLICATION
// -----------------------------------------------------------------------------

function main() {
    // --- Module Imports ---
    const express = require('express');
    const { v4: uuidv4 } = require('uuid');
    // winston is already required globally
    // dotenv.config() already called globally and can be called again safely if needed
    require('dotenv').config(); // Calling again ensures .env takes precedence if loaded late
    const pl = require('tau-prolog');
    const { ChatOpenAI } = require("@langchain/openai");
    const { ChatGoogleGenerativeAI } = require("@langchain/google-genai");
    const { ChatOllama } = require("@langchain/community/chat_models/ollama");
    const { JsonOutputParser, StringOutputParser } = require("@langchain/core/output_parsers");
    const { PromptTemplate } = require("@langchain/core/prompts");

    // ConfigManager, config, logger are already defined in the global scope

    // -------------------------------------------------------------------------
    // CORE SERVICES & MODULES (Scoped to main, or use global instances)
    // -------------------------------------------------------------------------

    class ApiError extends Error {
        constructor(statusCode, message) {
            super(message);
            this.statusCode = statusCode;
            this.name = 'ApiError';
        }
    }

    const SessionManager = {
        _sessions: {},
        _ontologies: {
            "common-sense": `
                has(Person, Object) :- picked_up(Person, Object).
                not(on_table(Object)) :- has(_, Object).
                not(in_room(Person)) :- left_room(Person).
            `
        },
        create() {
            const sessionId = uuidv4();
            const now = new Date().toISOString();
            this._sessions[sessionId] = { sessionId, createdAt: now, facts: [], factCount: 0 };
            logger.info(`Created new session: ${sessionId}`);
            return this._sessions[sessionId];
        },
        get(sessionId) {
            const session = this._sessions[sessionId];
            if (!session) throw new ApiError(404, `Session with ID '${sessionId}' not found.`);
            return session;
        },
        delete(sessionId) {
            this.get(sessionId); // Ensures it exists
            delete this._sessions[sessionId];
            logger.info(`Terminated session: ${sessionId}`);
        },
        addFacts(sessionId, newFacts) {
            const session = this.get(sessionId);
            session.facts.push(...newFacts);
            session.factCount = session.facts.length;
            logger.info(`Session ${sessionId}: Asserted ${newFacts.length} new facts.`);
        },
        getFactsWithOntology(sessionId) {
            const session = this.get(sessionId);
            const ontologyFacts = Object.values(this._ontologies)
                .flatMap(o => o.split('\n'))
                .map(line => line.trim())
                .filter(line => line && !line.startsWith('%'));
            return [...session.facts, ...ontologyFacts];
        }
    };

    // LlmService is globally initialized after this block
    const LlmService = {
        _client: null,
        init(cfg) { // cfg parameter is the global config object
            const { provider, model, apiKey, ollamaBaseUrl } = cfg.llm;
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
                logger.error(`LLM invocation error for provider ${config.llm.provider}: ${error.message}`); // Use global config here
                throw new ApiError(502, `Error communicating with LLM provider: ${error.message}`);
            }
        },
        async nlToRules(text, existing_facts = '', ontology_context = '') {
            const template = `You are an expert AI that translates natural language into a list of Prolog facts/rules. Your output MUST be a valid JSON array of strings, where each string is a single, complete Prolog statement ending with a period.
            CONTEXTUAL KNOWLEDGE BASE (existing facts):
            \`\`\`prolog
            ${existing_facts}
            \`\`\`
            PRE-DEFINED ONTOLOGY (for context):
            \`\`\`prolog
            ${ontology_context}
            \`\`\`
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
            \`\`\`prolog
            ${rules.join('\n')}
            \`\`\`
            Natural Language Explanation:`;
            return this._invokeChain(template, { style, prolog_rules: rules.join('\n') }, new StringOutputParser());
        }
    };
    LlmService.init(config); // Initialize LlmService with the global config

    const ReasonerService = {
        runQuery(facts, query) {
            return new Promise((resolve, reject) => {
                const prologSession = pl.create(); // Renamed to avoid conflict if 'session' is used elsewhere
                try {
                    prologSession.consult(facts.join(' '), {
                        success: () => {
                            prologSession.query(query, {
                                success: () => {
                                    const results = [];
                                    const answerCallback = (answer) => {
                                        if (!answer || answer.indicator === 'the_end/0') {
                                            return resolve(results);
                                        }
                                        if (pl.is_substitution(answer)) {
                                            results.push(prologSession.format_answer(answer, { quoted: true }));
                                        }
                                        try {
                                          prologSession.answer(answerCallback);
                                        } catch (e) {
                                          logger.error("Error processing Prolog answer: ", e);
                                          reject(new ApiError(500, `Prolog answer processing error: ${e.message}`));
                                        }
                                    };
                                    try {
                                      prologSession.answer(answerCallback);
                                    } catch (e) {
                                      logger.error("Error initiating Prolog answer callback: ", e);
                                      reject(new ApiError(500, `Prolog answer initiation error: ${e.message}`));
                                    }
                                },
                                error: (err) => {
                                    logger.error(`Prolog query failed: ${err}`, { query });
                                    reject(new ApiError(422, `Prolog query failed: ${err}`))
                                }
                            });
                        },
                        error: (err) => {
                            logger.error(`Prolog knowledge base is invalid: ${err}`, { facts });
                            reject(new ApiError(422, `Prolog knowledge base is invalid: ${err}`))
                        }
                    });
                } catch (e) {
                    logger.error(`Error during Prolog session setup: ${e.message}`, { facts, query });
                    reject(new ApiError(500, `Prolog session error: ${e.message}`));
                }
            });
        }
    };

    const ApiHandlers = {
        getRoot: (req, res) => res.json({ status: "ok", name: "Model Context Reasoner", version: "2.0.0", description: "MCR API" }),
        createSession: (req, res) => res.status(201).json(SessionManager.create()),
        getSession: (req, res, next) => {
            try {
                res.json(SessionManager.get(req.params.sessionId));
            } catch(err) { next(err); }
        },
        deleteSession: (req, res, next) => {
            try {
                SessionManager.delete(req.params.sessionId);
                res.json({ message: `Session ${req.params.sessionId} terminated.` });
            } catch(err) { next(err); }
        },
        assert: async (req, res, next) => {
            try {
                const { sessionId } = req.params;
                const { text } = req.body;
                if (!text || typeof text !== 'string' || text.trim() === '') {
                    throw new ApiError(400, "Missing or invalid required field 'text'. Must be a non-empty string.");
                }
                const currentSession = SessionManager.get(sessionId); // Ensures session exists
                const currentFacts = currentSession.facts.join('\\n');
                const ontologyContext = SessionManager.getFactsWithOntology(sessionId).filter(f => !currentSession.facts.includes(f)).join('\\n');
                const newFacts = await LlmService.nlToRules(text, currentFacts, ontologyContext);
                SessionManager.addFacts(sessionId, newFacts);
                res.json({
                    addedFacts: newFacts,
                    totalFactsInSession: SessionManager.get(sessionId).factCount,
                    metadata: { success: true }
                });
            } catch (err) { next(err); }
        },
        query: async (req, res, next) => {
            try {
                const { sessionId } = req.params;
                const { query, options = {} } = req.body;
                if (!query || typeof query !== 'string' || query.trim() === '') {
                     throw new ApiError(400, "Missing or invalid required field 'query'. Must be a non-empty string.");
                }
                const prologQuery = await LlmService.queryToProlog(query);
                logger.info(`Session ${sessionId}: Translated NL query to Prolog: "${prologQuery}"`);
                const facts = SessionManager.getFactsWithOntology(sessionId);
                const rawResults = await ReasonerService.runQuery(facts, prologQuery);
                let simpleResult;
                if (rawResults.length === 0) {
                    simpleResult = "No solution found.";
                } else if (rawResults.length === 1 && rawResults[0] === "true.") {
                    simpleResult = "Yes.";
                } else if (rawResults.length === 1 && rawResults[0] === "false.") {
                    simpleResult = "No.";
                } else {
                    try {
                        simpleResult = rawResults.map(r => r.includes("=") ? r : JSON.parse(r));
                        if (simpleResult.length === 1) simpleResult = simpleResult[0];
                    } catch (e) {
                        logger.warn(`Could not parse all Prolog results as JSON: ${rawResults}. Returning raw.`);
                        simpleResult = rawResults;
                    }
                }
                logger.info(`Session ${sessionId}: Prolog query returned: ${JSON.stringify(simpleResult)}`);
                const finalAnswer = await LlmService.resultToNl(query, JSON.stringify(simpleResult), options.style);
                const response = {
                    queryProlog: prologQuery, result: simpleResult, answer: finalAnswer,
                    metadata: { success: true, steps: rawResults.length }
                };
                if (options.debug) {
                     const currentSessionDebug = SessionManager.get(sessionId);
                     response.debug = {
                        factsInSession: currentSessionDebug.facts,
                        ontologyApplied: SessionManager.getFactsWithOntology(sessionId).filter(f => !currentSessionDebug.facts.includes(f))
                     };
                }
                res.json(response);
            } catch (err) { next(err); }
        },
        translateNlToRules: async (req, res, next) => {
            try {
                const { text, existing_facts = '', ontology_context = '' } = req.body;
                if (!text || typeof text !== 'string' || text.trim() === '') {
                    throw new ApiError(400, "Missing or invalid required field 'text'. Must be a non-empty string.");
                }
                const rules = await LlmService.nlToRules(text, existing_facts, ontology_context);
                res.json({ rules });
            } catch (err) { next(err); }
        },
        translateRulesToNl: async (req, res, next) => {
            try {
                const { rules, style } = req.body;
                if (!rules || !Array.isArray(rules) || !rules.every(r => typeof r === 'string')) {
                    throw new ApiError(400, "Missing or invalid 'rules' field; must be an array of strings.");
                }
                const text = await LlmService.rulesToNl(rules, style);
                res.json({ text });
            } catch (err) { next(err); }
        }
    };

    const app = express();
    app.use(express.json({ limit: '1mb' }));
    app.get('/', ApiHandlers.getRoot);
    app.post('/sessions', ApiHandlers.createSession);
    app.get('/sessions/:sessionId', ApiHandlers.getSession);
    app.delete('/sessions/:sessionId', ApiHandlers.deleteSession);
    app.post('/sessions/:sessionId/assert', ApiHandlers.assert);
    app.post('/sessions/:sessionId/query', ApiHandlers.query);
    app.post('/translate/nl-to-rules', ApiHandlers.translateNlToRules);
    app.post('/translate/rules-to-nl', ApiHandlers.translateRulesToNl);

    app.use((err, req, res, next) => {
        if (err instanceof ApiError) {
            logger.warn(`API Error (${err.statusCode}): ${err.message} for ${req.method} ${req.path}`);
            return res.status(err.statusCode).json({ error: { message: err.message, type: err.name } });
        }
        logger.error(`Internal Server Error: ${err.stack || err.message } for ${req.method} ${req.path}`);
        res.status(500).json({ error: { message: 'An internal server error occurred.', details: err.message, type: 'InternalServerError' }});
    });

    function startServer() {
        app.listen(config.server.port, config.server.host, () => {
            logger.info(`MCR server listening on http://${config.server.host}:${config.server.port}`);
            logger.info(`LLM Provider: ${config.llm.provider}`);
            const llmModel = config.llm.model[config.llm.provider];
            logger.info(`LLM Model: ${llmModel}`);
            if (config.llm.provider === 'ollama') {
                logger.info(`Ollama Base URL: ${config.llm.ollamaBaseUrl}`);
            }
        }).on('error', (error) => {
            logger.error(`Failed to start server: ${error.message}`);
            if (error.code === 'EADDRINUSE') {
                logger.error(`Port ${config.server.port} is already in use.`);
            }
            process.exit(1); // Exit if server fails to start
        });
    }

    startServer(); // Call startServer at the end of main()
}

// --- Main Execution Block ---
// This code runs if the script is executed directly: `node mcr.js`
if (require.main === module) {
    main(); // Initialize and start the application
}
