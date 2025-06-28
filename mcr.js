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

const express = require('express');
const ConfigManager = require('./src/config');
const logger = require('./src/logger');
const LlmService = require('./src/llmService');
const ApiError = require('./src/errors');
const setupRoutes = require('./src/routes');

// Load configuration
const config = ConfigManager.load();

// Initialize LLM Service
LlmService.init();

// -----------------------------------------------------------------------------
// SECTION 2: MAIN APPLICATION
// -----------------------------------------------------------------------------

function main() {
    const app = express();
    app.use(express.json({ limit: '1mb' }));

    // Setup API routes
    setupRoutes(app);

    // Centralized Error Handling Middleware
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