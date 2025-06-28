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

// UUID for request correlation
const { v4: uuidv4 } = require('uuid');
const { initializeLoggerContext } = require('./src/logger'); // Import the new middleware

// -----------------------------------------------------------------------------
// SECTION 2: MAIN APPLICATION
// -----------------------------------------------------------------------------

const app = express(); // Define app here so it can be exported

function setupApp(currentApp) {
    // Correlation ID Middleware (generates ID and sets header)
    currentApp.use((req, res, next) => {
        req.correlationId = uuidv4();
        res.setHeader('X-Correlation-ID', req.correlationId);
        next();
    });

    // Logger Context Middleware (makes correlationId available to logger via AsyncLocalStorage)
    currentApp.use(initializeLoggerContext);

    currentApp.use(express.json({ limit: '1mb' }));

    // Setup API routes
    setupRoutes(currentApp);

    // Centralized Error Handling Middleware
    currentApp.use((err, req, res, next) => {
        const correlationId = req.correlationId || 'unknown';
        // Ensure all logger calls within error handling include correlationId
        if (err instanceof ApiError) {
            logger.warn(`API Error (${err.statusCode}): ${err.message} for ${req.method} ${req.path}`, {
                correlationId,
                statusCode: err.statusCode,
                errorMessage: err.message,
                errorType: err.name,
                requestPath: req.path,
                requestMethod: req.method,
            });
            return res.status(err.statusCode).json({
                error: {
                    message: err.message,
                    type: err.name,
                    correlationId
                }
            });
        }
        logger.error(`Internal Server Error: ${err.stack || err.message } for ${req.method} ${req.path}`, {
            correlationId,
            errorMessage: err.message,
            errorStack: err.stack,
            requestPath: req.path,
            requestMethod: req.method,
        });
        res.status(500).json({
            error: {
                message: 'An internal server error occurred.',
                details: err.message, // In production, you might want to hide err.message for non-ApiErrors
                type: 'InternalServerError',
                correlationId
            }
        });
    });
}

setupApp(app); // Configure the app

function startServer(currentApp, currentConfig) {
    return currentApp.listen(currentConfig.server.port, currentConfig.server.host, () => {
        logger.info(`MCR server listening on http://${currentConfig.server.host}:${currentConfig.server.port}`);
        logger.info(`LLM Provider: ${currentConfig.llm.provider}`);
        const llmModel = currentConfig.llm.model[currentConfig.llm.provider];
        logger.info(`LLM Model: ${llmModel}`);
        if (currentConfig.llm.provider === 'ollama') {
            logger.info(`Ollama Base URL: ${currentConfig.llm.ollamaBaseUrl}`);
        }
    }).on('error', (error) => {
        logger.error(`Failed to start server: ${error.message}`);
        if (error.code === 'EADDRINUSE') {
            logger.error(`Port ${currentConfig.server.port} is already in use.`);
        }
        process.exit(1); // Exit if server fails to start
    });
}

// --- Main Execution Block ---
// This code runs if the script is executed directly: `node mcr.js`
if (require.main === module) {
    startServer(app, config); // Initialize and start the application
}

module.exports = { app, startServer, config }; // Export app for testing and server control