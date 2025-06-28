# Model Context Reasoner (MCR)

The **Model Context Reasoner (MCR)** is a standalone server application that provides a powerful, API-driven bridge between Large Language Models (LLMs) and formal logic reasoners. It's designed as a "guitar pedal" for your AI stack: a single, plug-and-play unit that adds sophisticated reasoning capabilities to any application with minimal setup.

This specification focuses on:

-   **Utility**: Stateful **sessions** allow for building and querying a persistent knowledge base over multiple API calls, enabling conversational memory and complex problem-solving.
-   **Implementability**: A clear, RESTful API with well-defined schemas and standard HTTP error codes. The project structure is simple, and configuration relies on both YAML for structure and `.env` for secrets.
-   **Enjoyability**: A streamlined API and a fun, narrative-driven example make it easy and rewarding to get started. The "stompbox" feel of asserting facts and then querying for insights is intuitive and powerful.

This version significantly enhances **utility** by introducing stateful sessions for persistent context, **implementability** with clearer project structure and API error handling, and **enjoyability** through a more ergonomic API and a fun, illustrative example. It retains the core "guitar pedal" philosophy while making the application far more powerful for real-world use.

---

### **Core Concepts**

1.  **MCR as a Service**: MCR runs as a background server, exposing its functionality via an HTTP API. Any application (a web frontend, a Python script, another backend) can use it.
2.  **Stateful Sessions**: The core of MCR's power. Clients create a `sessionId` to establish a persistent reasoning context. Facts asserted within that session are remembered for subsequent queries, creating a dynamic knowledge base.
3.  **LLM-Powered Translation**: MCR uses LLMs to seamlessly translate between human language and the formal syntax of a reasoner (e.g., Prolog), abstracting this complexity from the end-user.

Of course. Here is the revised and refactored Model Context Reasoner (MCR) script.

This version introduces significant improvements:

*   **Modularity:** The code is broken down into logical components (Config, Logger, LLM Service, Reasoner Service, API Handlers), making it much easier to understand and maintain.
*   **Extensibility (LLM Providers):** It now supports **OpenAI**, **Google Gemini**, and local **Ollama** models out-of-the-box. The provider is selectable via configuration.
*   **Deduplication:** Logic for LLM prompting and Prolog execution is centralized in services, removing redundancy from the API route handlers.
*   **Robustness:** It features a custom `ApiError` class and centralized error-handling middleware for consistent and predictable API error responses. Configuration loading is also more robust, with clear startup checks for required API keys.
*   **Reliability:** Dependencies are updated, and the logic is streamlined to be more resilient to invalid inputs or unexpected backend responses.

---

### Instructions

1.  **Save the Code:** Save the following code as `mcr_v2.js` in a new directory.
2.  **Create `.env` file:** In the same directory, create a file named `.env`. You only need to add the keys for the services you intend to use.

    ```dotenv
    # --- CHOOSE ONE LLM PROVIDER ---

    # For OpenAI
    OPENAI_API_KEY="sk-..."

    # For Google Gemini
    GEMINI_API_KEY="..."

    # For local Ollama (no key needed, but set the model)
    # The MCR_LLM_OLLAMA_BASE_URL is optional if Ollama runs on the default port.
    # MCR_LLM_OLLAMA_BASE_URL="http://localhost:11434"
    ```

3.  **Run the Script:**
    ```bash
    node mcr_v2.js
    ```
    The script will automatically install any missing dependencies and then start the server, indicating which LLM provider is active.

4.  **Use the API:** You can now interact with the server. The API specification remains the same.

---

### `mcr_v2.js`

```javascript
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
 * 1. Save this file as `mcr_v2.js`.
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
 * 4. Run the script: `node mcr_v2.js`
 */

// -----------------------------------------------------------------------------
// SECTION 1: AUTOMATIC DEPENDENCY INSTALLATION
// -----------------------------------------------------------------------------

const child_process = require('child_process');

async function installDependencies() {
    const dependencies = {
        "express": "4.x",
        "langchain": "^0.2.0",
        "@langchain/openai": "^0.1.0",
        "@langchain/google-genai": "^0.0.15",
        "@langchain/community": "^0.2.0",
        "tau-prolog": "0.3.x",
        "uuid": "9.x", // CJS compatible
        "winston": "3.x",
        "dotenv": "16.x"
    };

    console.log("MCR v2: Checking for required dependencies...");
    const missingPackages = Object.keys(dependencies).filter(pkg => {
        try {
            require.resolve(pkg);
            return false;
        } catch (e) {
            return true;
        }
    });

    if (missingPackages.length > 0) {
        console.log(`MCR v2: Found ${missingPackages.length} missing packages. Installing...`);
        const command = `npm install ${missingPackages.map(pkg => `${pkg}@${dependencies[pkg]}`).join(' ')}`;
        console.log(`> ${command}`);
        try {
            child_process.execSync(command, { stdio: 'inherit' });
            console.log("MCR v2: All dependencies are now installed.");
        } catch (installError) {
            console.error(`FATAL: Failed to install dependencies. Please run the command above manually.`);
            console.error(installError);
            process.exit(1);
        }
    } else {
        console.log("MCR v2: All dependencies are present.");
    }
}

// Run installer first, then start the main application logic.
installDependencies().then(() => main()).catch(err => {
    console.error("An unexpected error occurred during startup.", err);
    process.exit(1);
});


// -----------------------------------------------------------------------------
// SECTION 2: MAIN APPLICATION
// -----------------------------------------------------------------------------

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
                    file: 'mcr_v2.log',
                }
            };
            this.validate(config);
            return config;
        },
        validate(config) {
            const { provider, apiKey } = config.llm;
            if (provider === 'openai' && !apiKey.openai) {
                throw new Error("FATAL: MCR_LLM_PROVIDER is 'openai' but OPENAI_API_KEY is not set.");
            }
            if (provider === 'gemini' && !apiKey.gemini) {
                throw new Error("FATAL: MCR_LLM_PROVIDER is 'gemini' but GEMINI_API_KEY is not set.");
            }
        }
    };

    const config = ConfigManager.load();

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
        init(config) {
            const { provider, model, apiKey, ollamaBaseUrl } = config.llm;
            switch (provider) {
                case 'openai':
                    this._client = new ChatOpenAI({ apiKey: apiKey.openai, modelName: model.openai, temperature: 0 });
                    break;
                case 'gemini':
                    this._client = new ChatGoogleGenerativeAI({ apiKey: apiKey.gemini, modelName: model.gemini, temperature: 0 });
                    break;
                case 'ollama':
                    this._client = new ChatOllama({ baseUrl: ollamaBaseUrl, model: model.ollama, temperature: 0 });
                    break;
                default:
                    throw new Error(`Unsupported LLM provider: ${provider}`);
            }
            logger.info(`LLM Service initialized with provider: '${provider}' and model: '${model[provider]}'`);
        },
        async _invokeChain(promptTemplate, input, outputParser) {
            if (!this._client) throw new Error("LLM Service not initialized.");
            const prompt = await PromptTemplate.fromTemplate(promptTemplate).format(input);
            const chain = this._client.pipe(outputParser);
            return chain.invoke(prompt);
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
            if (!Array.isArray(result)) throw new ApiError(422, "LLM failed to produce a valid JSON array of rules.");
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
    LlmService.init(config);

    /**
     * Abstraction layer for the Tau Prolog reasoner.
     */
    const ReasonerService = {
        runQuery(facts, query) {
            return new Promise((resolve, reject) => {
                const session = pl.create();
                session.consult(facts.join(' '), {
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
                                    session.answer(answerCallback);
                                };
                                session.answer(answerCallback);
                            },
                            error: (err) => reject(new ApiError(422, `Prolog query failed: ${err}`))
                        });
                    },
                    error: (err) => reject(new ApiError(422, `Prolog knowledge base is invalid: ${err}`))
                });
            });
        }
    };

    // -------------------------------------------------------------------------
    // API HANDLERS (CONTROLLERS)
    // -------------------------------------------------------------------------

    const ApiHandlers = {
        getRoot: (req, res) => res.json({ status: "ok", name: "Model Context Reasoner", version: "2.0.0" }),
        createSession: (req, res) => res.status(201).json(SessionManager.create()),
        getSession: (req, res) => res.json(SessionManager.get(req.params.sessionId)),
        deleteSession: (req, res) => {
            SessionManager.delete(req.params.sessionId);
            res.json({ message: `Session ${req.params.sessionId} terminated.` });
        },
        assert: async (req, res, next) => {
            try {
                const { sessionId } = req.params;
                const { text } = req.body;
                if (!text) throw new ApiError(400, "Missing required field 'text'.");

                const session = SessionManager.get(sessionId);
                const newFacts = await LlmService.nlToRules(text, session.facts.join('\n'));
                SessionManager.addFacts(sessionId, newFacts);

                res.json({
                    addedFacts: newFacts,
                    totalFactsInSession: session.factCount,
                    metadata: { success: true }
                });
            } catch (err) { next(err); }
        },
        query: async (req, res, next) => {
            try {
                const { sessionId } = req.params;
                const { query, options = {} } = req.body;
                if (!query) throw new ApiError(400, "Missing required field 'query'.");

                const prologQuery = await LlmService.queryToProlog(query);
                logger.info(`Session ${sessionId}: Translated NL query to Prolog: "${prologQuery}"`);

                const facts = SessionManager.getFactsWithOntology(sessionId);
                const rawResults = await ReasonerService.runQuery(facts, prologQuery);
                const simpleResult = rawResults.length > 0 ? JSON.parse(rawResults[0]) : "No solution found.";
                logger.info(`Session ${sessionId}: Prolog query returned: ${JSON.stringify(simpleResult)}`);

                const finalAnswer = await LlmService.resultToNl(query, JSON.stringify(simpleResult), options.style);

                const response = {
                    queryProlog: prologQuery,
                    result: simpleResult,
                    answer: finalAnswer,
                    metadata: { success: true, steps: rawResults.length }
                };
                if (options.debug) response.debug = { factsInSession: SessionManager.get(sessionId).facts };
                
                res.json(response);
            } catch (err) { next(err); }
        },
        translateNlToRules: async (req, res, next) => {
            try {
                const { text } = req.body;
                if (!text) throw new ApiError(400, "Missing required field 'text'.");
                const rules = await LlmService.nlToRules(text);
                res.json({ rules });
            } catch (err) { next(err); }
        },
        translateRulesToNl: async (req, res, next) => {
            try {
                const { rules, style } = req.body;
                if (!rules || !Array.isArray(rules)) throw new ApiError(400, "Missing or invalid 'rules' field; must be an array of strings.");
                const text = await LlmService.rulesToNl(rules, style);
                res.json({ text });
            } catch (err) { next(err); }
        }
    };

    // -------------------------------------------------------------------------
    // SERVER SETUP & START
    // -------------------------------------------------------------------------

    const app = express();
    app.use(express.json());

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
            return res.status(err.statusCode).json({ error: err.message });
        }
        logger.error(`Internal Server Error: ${err.message}`, { stack: err.stack });
        res.status(500).json({ error: 'An internal server error occurred.', details: err.message });
    });

    // --- Start Server ---
    app.listen(config.server.port, config.server.host, () => {
        logger.info(`MCR v2 server listening on http://${config.server.host}:${config.server.port}`);
    });
}
```

## TODO ?
 - advanced error handling and debugging to diagnose translation and reasoner issues
 - prompt template editing and debugging
 - unit test framework
 - demo framework: try individual operations
 - extensibility
 - integrate RAG / datastores through dynamic Prolog assertions / overlay
