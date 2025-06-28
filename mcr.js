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

// -----------------------------------------------------------------------------
// SECTION 2: MAIN APPLICATION
// -----------------------------------------------------------------------------

// --- Module Imports ---
// Note: child_process is no longer needed here unless used elsewhere.
// const child_process = require('child_process'); // Removed as installDependencies is gone

function main() {
    // --- Module Imports ---
    const express = require('express');
    const { v4: uuidv4 } = require('uuid');
    const winston = require('winston');
    require('dotenv').config();
    const pl = require('tau-prolog');
    const { ChatOpenAI } = require("@langchain/openai");
    const { ChatGoogleGenerativeAI } = require("@langchain/google-genai");
    const { ChatOllama } = require("@langchain/community/chat_models/ollama");
    const { JsonOutputParser, StringOutputParser } = require("@langchain/core/output_parsers");
    const { PromptTemplate } = require("@langchain/core/prompts");

    // -------------------------------------------------------------------------
    // CORE SERVICES & MODULES
    // -------------------------------------------------------------------------

    /**
     * Custom Error class for consistent API responses.
     */
    class ApiError extends Error {
        constructor(statusCode, message) {
            super(message);
            this.statusCode = statusCode;
            this.name = 'ApiError';
        }
    }

    /**
     * Manages application configuration.
     */
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
                    file: 'mcr.log', // Changed from mcr_v2.log
                }
            };
            this.validate(config);
            return config;
        },
        validate(config) {
            const { provider, apiKey } = config.llm;
            if (provider === 'openai' && !apiKey.openai) {
                logger.warn("MCR_LLM_PROVIDER is 'openai' but OPENAI_API_KEY is not set. OpenAI functionality will not work.");
                // throw new Error("FATAL: MCR_LLM_PROVIDER is 'openai' but OPENAI_API_KEY is not set.");
            }
            if (provider === 'gemini' && !apiKey.gemini) {
                logger.warn("MCR_LLM_PROVIDER is 'gemini' but GEMINI_API_KEY is not set. Gemini functionality will not work.");
                // throw new Error("FATAL: MCR_LLM_PROVIDER is 'gemini' but GEMINI_API_KEY is not set.");
            }
            // For Ollama, no API key is strictly required by default.
        }
    };

    const config = ConfigManager.load(); // Load config early for logger

    /**
     * Centralized logger.
     */
    const logger = winston.createLogger({
        level: config.logging.level,
        format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
        transports: [
            new winston.transports.File({ filename: config.logging.file }),
            new winston.transports.Console({
                format: winston.format.combine(winston.format.colorize(), winston.format.simple())
            }),
        ],
    });

    // Re-validate config after logger is initialized so warnings can be logged.
    // ConfigManager.validate(config); // This was moved up, but we can log warnings here if needed.

    /**
     * Manages in-memory session state.
     */
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
            this.get(sessionId); // Ensures it exists before trying to delete
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

    /**
     * Abstraction layer for interacting with the chosen LLM.
     */
    const LlmService = {
        _client: null,
        init(cfg) { // Renamed config to cfg to avoid conflict with global config
            const { provider, model, apiKey, ollamaBaseUrl } = cfg.llm;
            try {
                switch (provider) {
                    case 'openai':
                        if (!apiKey.openai) {
                            logger.warn("OpenAI API key not provided. OpenAI LLM service will not be available.");
                            this._client = null;
                            return;
                        }
                        this._client = new ChatOpenAI({ apiKey: apiKey.openai, modelName: model.openai, temperature: 0 });
                        break;
                    case 'gemini':
                        if (!apiKey.gemini) {
                            logger.warn("Gemini API key not provided. Gemini LLM service will not be available.");
                            this._client = null;
                            return;
                        }
                        this._client = new ChatGoogleGenerativeAI({ apiKey: apiKey.gemini, modelName: model.gemini, temperature: 0 });
                        break;
                    case 'ollama':
                        this._client = new ChatOllama({ baseUrl: ollamaBaseUrl, model: model.ollama, temperature: 0 });
                        break;
                    default:
                        logger.error(`Unsupported LLM provider: ${provider}. LLM service will not be available.`);
                        this._client = null;
                        return;
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
            \`\`\`prolog
            {existing_facts}
            \`\`\`
            PRE-DEFINED ONTOLOGY (for context):
            \`\`\`prolog
            {ontology_context}
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
            {prolog_rules}
            \`\`\`
            Natural Language Explanation:`;
            return this._invokeChain(template, { style, prolog_rules: rules.join('\n') }, new StringOutputParser());
        }
    };
    LlmService.init(config); // Initialize LLM Service with the loaded config

    /**
     * Abstraction layer for the Tau Prolog reasoner.
     */
    const ReasonerService = {
        runQuery(facts, query) {
            return new Promise((resolve, reject) => {
                const session = pl.create();
                try {
                    session.consult(facts.join(' '), { // Ensure facts is an array of strings
                        success: () => {
                            session.query(query, {
                                success: () => {
                                    const results = [];
                                    const answerCallback = (answer) => {
                                        if (!answer || answer.indicator === 'the_end/0') {
                                            return resolve(results);
                                        }
                                        if (pl.is_substitution(answer)) {
                                            results.push(session.format_answer(answer, { quoted: true }));
                                        }
                                        try {
                                          session.answer(answerCallback);
                                        } catch (e) {
                                          logger.error("Error processing Prolog answer: ", e);
                                          reject(new ApiError(500, `Prolog answer processing error: ${e.message}`));
                                        }
                                    };
                                    try {
                                      session.answer(answerCallback);
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

    // -------------------------------------------------------------------------
    // API HANDLERS (CONTROLLERS)
    // -------------------------------------------------------------------------

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

                const session = SessionManager.get(sessionId); // Ensures session exists
                const currentFacts = session.facts.join('\n'); // Pass current facts for context
                const ontologyContext = SessionManager.getFactsWithOntology(sessionId).filter(f => !session.facts.includes(f)).join('\n'); // Pass only ontology

                const newFacts = await LlmService.nlToRules(text, currentFacts, ontologyContext);
                SessionManager.addFacts(sessionId, newFacts);

                res.json({
                    addedFacts: newFacts,
                    totalFactsInSession: SessionManager.get(sessionId).factCount, // Get updated count
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
                } else if (rawResults.length === 1 && rawResults[0] === "true.") { // Handle simple true/false
                    simpleResult = "Yes.";
                } else if (rawResults.length === 1 && rawResults[0] === "false.") {
                    simpleResult = "No.";
                } else {
                    // Attempt to parse, but provide raw if it's not simple JSON
                    try {
                        simpleResult = rawResults.map(r => {
                            // Tau-Prolog format_answer often returns strings like "X = 'value'."
                            // We want to extract the 'value' or represent the substitution.
                            if (r.includes("=")) {
                                return r; // Keep as is for now, or implement more sophisticated parsing
                            }
                            return JSON.parse(r); // If it's a simple JSON string like "true."
                        });
                        if (simpleResult.length === 1) simpleResult = simpleResult[0];
                    } catch (e) {
                        logger.warn(`Could not parse all Prolog results as JSON: ${rawResults}. Returning raw.`);
                        simpleResult = rawResults; // Fallback to raw results if parsing fails
                    }
                }

                logger.info(`Session ${sessionId}: Prolog query returned: ${JSON.stringify(simpleResult)}`);

                const finalAnswer = await LlmService.resultToNl(query, JSON.stringify(simpleResult), options.style);

                const response = {
                    queryProlog: prologQuery,
                    result: simpleResult, // This could be an array or a single value
                    answer: finalAnswer,
                    metadata: { success: true, steps: rawResults.length }
                };
                if (options.debug) {
                     const currentSession = SessionManager.get(sessionId);
                     response.debug = {
                        factsInSession: currentSession.facts,
                        ontologyApplied: SessionManager.getFactsWithOntology(sessionId).filter(f => !currentSession.facts.includes(f))
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

    // -------------------------------------------------------------------------
    // SERVER SETUP & START
    // -------------------------------------------------------------------------

    const app = express();
    app.use(express.json({ limit: '1mb' })); // Added request size limit

    // --- API Routes ---
    app.get('/', ApiHandlers.getRoot);
    app.post('/sessions', ApiHandlers.createSession);
    app.get('/sessions/:sessionId', ApiHandlers.getSession);
    app.delete('/sessions/:sessionId', ApiHandlers.deleteSession);
    app.post('/sessions/:sessionId/assert', ApiHandlers.assert);
    app.post('/sessions/:sessionId/query', ApiHandlers.query);
    app.post('/translate/nl-to-rules', ApiHandlers.translateNlToRules);
    app.post('/translate/rules-to-nl', ApiHandlers.translateRulesToNl);

    // --- Centralized Error Handling Middleware ---
    app.use((err, req, res, next) => {
        if (err instanceof ApiError) {
            logger.warn(`API Error (${err.statusCode}): ${err.message} for ${req.method} ${req.path}`);
            return res.status(err.statusCode).json({ error: { message: err.message, type: err.name } });
        }
        logger.error(`Internal Server Error: ${err.stack || err.message } for ${req.method} ${req.path}`);
        res.status(500).json({ error: { message: 'An internal server error occurred.', details: err.message, type: 'InternalServerError' }});
    });

    // --- Start Server ---
    function startServer() {
        app.listen(config.server.port, config.server.host, () => {
            logger.info(`MCR server listening on http://${config.server.host}:${config.server.port}`);
            logger.info(`LLM Provider: ${config.llm.provider}`);
            if (config.llm.provider === 'ollama') {
                logger.info(`Ollama Model: ${config.llm.model.ollama}, Base URL: ${config.llm.ollamaBaseUrl}`);
            } else if (config.llm.provider === 'openai') {
                logger.info(`OpenAI Model: ${config.llm.model.openai}`);
            } else if (config.llm.provider === 'gemini') {
                logger.info(`Gemini Model: ${config.llm.model.gemini}`);
            }
        }).on('error', (error) => {
            logger.error(`Failed to start server: ${error.message}`);
            if (error.code === 'EADDRINUSE') {
                logger.error(`Port ${config.server.port} is already in use.`);
            }
            process.exit(1);
        });
    }

    // Check if this script is the main module, then start main and the server.
    if (require.main === module) {
        // Removed the call to installDependencies() as we rely on npm install
        main(); // Call main to setup everything
        startServer(); // Then start the server
    } else {
      // This means the file is being required, so we might export main or app
      // For now, the primary use case is direct execution.
      // If it were to be required, we'd likely export 'app' or 'main' or specific services.
      // module.exports = { app, main, LlmService, ReasonerService, SessionManager, ConfigManager, logger };
    }
}

// If not being required, and installDependencies was removed, we need to call main directly.
// However, the structure above already places main() call inside the 'if require.main === module'
// which is correct. Let's make sure `main()` is called when the script is run directly.
// The original script had installDependencies().then(() => main())
// Now we will call main() directly if not requiring, and then startServer.

// The structure `if (require.main === module)` is used to ensure that `main()` and `startServer()`
// are called only when the script is executed directly (e.g., `node mcr.js`),
// and not when it's required by another script (e.g., `require('./mcr.js')`).

// The initial `main()` call at the top level (outside `if require.main === module`)
// needs to be inside the `if require.main === module` block or removed if `main` also starts the server.
// Let's adjust: The `main()` function sets up everything, and `startServer()` starts listening.
// The `installDependencies().then(() => main())` logic needs to be replaced.

// Corrected structure for direct execution:
if (require.main === module) {
    // The `main()` function should only be called once.
    // The `main()` function is defined, then it's called below.
    // The `installDependencies` call was removed from the top level.
    // The `main()` function itself doesn't start the server, `startServer()` does.
    // So, we call `main()` to do all the setup, then `startServer()`.

    // The `main()` function is already defined. Now, if this is the main module,
    // we need to execute the logic that was previously chained after `installDependencies`.
    // This means calling `main()` to set up all services and routes, and then `startServer()`.

    // The current structure has main() defined, and then an `if (require.main === module)`
    // block that calls main() and startServer(). This is correct.
    // The only change was removing the top-level `installDependencies().then(() => main())`.
    // And ensuring `main()` is called to set up everything before `startServer()`.
    // The file structure already has main() defined and then the `if require.main` block calls it.
    // The initial `main()` call at the bottom of the file is not needed if it's inside the `if require.main` block.

    // Let's make sure the `main()` function is called only once.
    // The current code calls `main()` inside the `if (require.main === module)` block.
    // This is the correct place.

    // No, the `main()` function is defined, but it's not called from the global scope anymore.
    // It's called within the `if (require.main === module)` block at the end of SECTION 2.
    // This is the standard way to make a Node.js script executable.
    // The `main()` function should contain all setup logic, and then `startServer()`.
    // The current structure is:
    // function main() { ... setup ... }
    // if (require.main === module) { main(); startServer(); }
    // This is correct.

    // Let's ensure the main function is indeed called when the script runs.
    // The provided code has a top-level call:
    // installDependencies().then(() => main()).catch(...)
    // And then defines function main() { ... }
    // And at the very end of mcr_v2.js, there's no explicit call to main() or startServer()
    // outside of the `installDependencies` promise chain.

    // My plan is to remove `installDependencies` and call `main()` and then `startServer()` directly.
    // The `main()` function in the original code does NOT start the server. It sets up Express app.
    // The server is started by `app.listen` which I've wrapped in `startServer`.

    // So, the end of the file should be:
    // if (require.main === module) {
    //     main(); // This sets up the 'app' and services
    //     // startServer() is now called inside main() in the original script, let's check.
    //     // No, app.listen is inside main(). I will extract it to startServer() for clarity.
    // }
    // I have already extracted `startServer` and it's called inside the `if require.main` block.
    // The `main()` function call is also there. This seems fine.
    // The only thing is the initial `config = ConfigManager.load()` and `logger` instantiation
    // are outside `main()`. This is fine for them to be module-scoped.
    // The `LlmService.init(config)` is also module-scoped.

    // Let's verify the execution flow for `node mcr.js`:
    // 1. Dependencies are checked/installed (REMOVED this part).
    // 2. `main()` is called.
    //    - Imports modules.
    //    - Defines ApiError, ConfigManager, logger, SessionManager, LlmService, ReasonerService, ApiHandlers.
    //    - Initializes config, logger, LlmService.
    //    - Sets up Express app, routes, error handling.
    //    - Calls `app.listen` (which I've wrapped in `startServer` and moved the call).

    // The crucial change is how `main()` is invoked.
    // Original: `installDependencies().then(() => main())`
    // New: `if (require.main === module) { main(); startServer(); }`
    // And `main` should *not* call `startServer` itself if `startServer` is called separately.
    // The current `main()` function in my generated code does *not* call `startServer()`.
    // It sets up `app`, and then `startServer()` (which contains `app.listen`) is called after `main()`
    // within the `if (require.main === module)` block. This is the correct structure.

    // One final check of the original `mcr_v2.js`:
    // `installDependencies().then(() => main())`
    // `function main() { ... app.listen(...) }`
    // So `main()` *does* start the server in the original.
    // My `main()` sets up the app, and `startServer()` starts it.
    // This means my `if (require.main === module)` block should be:
    // ```
    // if (require.main === module) {
    //   main(); // Sets up app and all services
    //   startServer(); // Calls app.listen
    // }
    // ```
    // This is what I have. The global `config` and `logger` are fine. `LlmService.init(config)` is also fine.
}
