#!/usr/bin/env node

/**
 * Model Context Reasoner (MCR)
 * A Node.js server bridging LLMs and Prolog reasoners via a RESTful API.
 * Features stateful sessions, multi-provider LLM support, and modular design.
 */

const express = require('express');
const ConfigManager = require('./src/config');
const logger = require('./src/logger');
const LlmService = require('./src/llmService');
const ApiError = require('./src/errors');
const setupRoutes = require('./src/routes');

const config = ConfigManager.get(); // Use get() to ensure config is loaded and validated
LlmService.init(config); // Pass config to LlmService.init()

const { v4: uuidv4 } = require('uuid');
const { initializeLoggerContext } = require('./src/logger');

const app = express();

function setupApp(currentApp) {
  currentApp.use((req, res, next) => {
    req.correlationId = uuidv4();
    res.setHeader('X-Correlation-ID', req.correlationId);
    next();
  });

  currentApp.use(initializeLoggerContext);
  currentApp.use(express.json({ limit: '1mb' }));
  setupRoutes(currentApp);

  currentApp.use((err, req, res, _next) => {
    const correlationId = req.correlationId || 'unknown';
    if (err instanceof ApiError) {
      logger.warn(
        `API Error (${err.statusCode}): ${err.message} for ${req.method} ${req.path}`,
        {
          correlationId,
          statusCode: err.statusCode,
          errorMessage: err.message,
          errorType: err.name,
          errorCode: err.errorCode, // Log errorCode
          requestPath: req.path,
          requestMethod: req.method,
        }
      );
      const errorResponse = {
        error: {
          message: err.message,
          type: err.name,
          correlationId,
        },
      };
      if (err.errorCode) {
        errorResponse.error.code = err.errorCode; // Add errorCode to response
      }
      return res.status(err.statusCode).json(errorResponse);
    }
    logger.error(
      `Internal Server Error: ${err.stack || err.message} for ${req.method} ${req.path}`,
      {
        correlationId,
        errorMessage: err.message,
        errorStack: err.stack,
        requestPath: req.path,
        requestMethod: req.method,
      }
    );
    return res.status(500).json({
      error: {
        message: 'An internal server error occurred.',
        details: err.message,
        type: 'InternalServerError',
        correlationId,
      },
    });
  });
}

setupApp(app);

function startServer(currentApp, currentConfig) {
  return currentApp
    .listen(currentConfig.server.port, currentConfig.server.host, () => {
      logger.info(
        `MCR server listening on http://${currentConfig.server.host}:${currentConfig.server.port}`
      );
      logger.info(`LLM Provider: ${currentConfig.llm.provider}`);
      const llmModel = currentConfig.llm.model[currentConfig.llm.provider];
      logger.info(`LLM Model: ${llmModel}`);
      if (currentConfig.llm.provider === 'ollama') {
        logger.info(`Ollama Base URL: ${currentConfig.llm.ollamaBaseUrl}`);
      }
    })
    .on('error', (error) => {
      logger.error(`Failed to start server: ${error.message}`);
      if (error.code === 'EADDRINUSE') {
        logger.error(`Port ${currentConfig.server.port} is already in use.`);
      }
      process.exit(1);
    });
}

if (require.main === module) {
  startServer(app, config);
}

module.exports = { app, startServer, config };
