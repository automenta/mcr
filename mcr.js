#!/usr/bin/env node

/**
 * Model Context Reasoner (MCR)
 * A Node.js server bridging LLMs and Prolog reasoners via a RESTful API.
 * Features stateful sessions, multi-provider LLM support, and modular design.
 */

const express = require('express');
const ConfigManager = require('./src/config');
const { logger, reconfigureLogger, initializeLoggerContext } = require('./src/logger');
const LlmService = require('./src/llmService');
const ApiError = require('./src/errors');
const setupRoutes = require('./src/routes');

const config = ConfigManager.get(); // Use get() to ensure config is loaded and validated
reconfigureLogger(config); // Reconfigure logger with loaded config
LlmService.init(config); // Pass config to LlmService.init()

const { v4: uuidv4 } = require('uuid');
// const appLogger = require('./src/logger').logger; // This was unused, req.log is preferred

const app = express();

function setupApp(currentApp) {
  // Assign Correlation ID and initialize logger context early
  currentApp.use((req, res, next) => {
    req.correlationId = uuidv4();
    res.setHeader('X-Correlation-ID', req.correlationId);
    next();
  });
  currentApp.use(initializeLoggerContext); // This adds req.log

  // Log request start and setup response logging
  currentApp.use((req, res, next) => {
    req.startTime = Date.now();
    // Use req.log which is initialized by initializeLoggerContext with correlationId
    req.log.http(`Request received: ${req.method} ${req.originalUrl}`, {
      httpMethod: req.method,
      url: req.originalUrl,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.on('finish', () => {
      // This event fires for both successful responses and error responses handled before this point
      // (e.g. if an error occurs and response is sent before this middleware in chain).
      // However, our error handler is *after* routes, so 'finish' will log for successful route handling.
      const durationMs = Date.now() - req.startTime;
      // Check if an error was handled by our error middleware (which would set err.loggedByErrorHandler)
      // to avoid double logging the "completion" of an error response.
      if (!res.errLoggedByErrorHandler) {
        req.log.http(
          `Request completed: ${req.method} ${req.originalUrl} - Status ${res.statusCode}`,
          {
            httpMethod: req.method,
            url: req.originalUrl,
            statusCode: res.statusCode,
            durationMs,
          }
        );
      }
    });
    next();
  });

  currentApp.use(express.json({ limit: '1mb' }));
  setupRoutes(currentApp);

  // Centralized Error Handling Middleware - MUST be last if it sends responses.
  currentApp.use((err, req, res, next) => {
    // Express needs all 4 args for error handler signature
    const correlationId = req.correlationId || 'unknown'; // Should be set
    const durationMs = req.startTime ? Date.now() - req.startTime : undefined;

    if (err instanceof ApiError) {
      req.log.warn(
        `API Error (${err.statusCode}): ${err.message} for ${req.method} ${req.originalUrl}`, // Use originalUrl
        {
          // correlationId is already part of req.log context
          statusCode: err.statusCode,
          errorMessage: err.message,
          errorType: err.name,
          errorCode: err.errorCode,
          requestPath: req.path, // originalUrl might be better
          requestMethod: req.method,
          durationMs,
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
        errorResponse.error.code = err.errorCode;
      }
      if (!res.headersSent) {
        res.status(err.statusCode).json(errorResponse);
      } else {
        // If headers already sent, delegate to default Express error handler
        return next(err);
      }
    } else {
      // For non-ApiError (unexpected internal errors)
      req.log.error(
        `Internal Server Error: ${err.stack || err.message} for ${req.method} ${req.originalUrl}`, // Use originalUrl
        {
          // correlationId is already part of req.log context
          errorMessage: err.message,
          errorStack: err.stack,
          requestPath: req.path, // originalUrl might be better
          requestMethod: req.method,
          durationMs,
        }
      );
      if (!res.headersSent) {
        res.status(500).json({
          error: {
            message: 'An internal server error occurred.',
            // Avoid leaking stack trace in production response by default for security
            // details: process.env.NODE_ENV === 'development' ? err.message : undefined,
            type: 'InternalServerError',
            correlationId,
          },
        });
      } else {
        return next(err);
      }
    }
    res.errLoggedByErrorHandler = true; // Mark that this error was logged here
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
