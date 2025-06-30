#!/usr/bin/env node

/**
 * Model Context Reasoner (MCR)
 * A Node.js server bridging LLMs and Prolog reasoners via a RESTful API.
 * Features stateful sessions, multi-provider LLM support, and modular design.
 */

const express = require('express');
const ConfigManager = require('./src/config');
const {
  logger,
  reconfigureLogger,
  initializeLoggerContext,
} = require('./src/logger');
const LlmService = require('./src/llmService');
const ApiError = require('./src/errors');
const setupRoutes = require('./src/routes');
const { v4: uuidv4 } = require('uuid');

const config = ConfigManager.get();
reconfigureLogger(config);
LlmService.init(config);

const app = express();

function setupApp(currentApp) {
  currentApp.use((req, res, next) => {
    req.correlationId = uuidv4();
    res.setHeader('X-Correlation-ID', req.correlationId);
    next();
  });
  currentApp.use(initializeLoggerContext);

  currentApp.use((req, res, next) => {
    req.startTime = Date.now();
    req.log.http(`Request received: ${req.method} ${req.originalUrl}`, {
      httpMethod: req.method,
      url: req.originalUrl,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.on('finish', () => {
      const durationMs = Date.now() - req.startTime;
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
    return next();
  });

  currentApp.use(express.json({ limit: '1mb' }));
  setupRoutes(currentApp);

  currentApp.use((err, req, res, next) => {
    const correlationId = req.correlationId || 'unknown';
    const durationMs = req.startTime ? Date.now() - req.startTime : undefined;

    if (err instanceof ApiError) {
      req.log.warn(
        `API Error (${err.statusCode}): ${err.message} for ${req.method} ${req.originalUrl}`,
        {
          statusCode: err.statusCode,
          errorMessage: err.message,
          errorType: err.name,
          errorCode: err.errorCode,
          requestPath: req.path,
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
        res.errLoggedByErrorHandler = true;
        res.status(err.statusCode).json(errorResponse);
      } else {
        next(err);
        return;
      }
    } else {
      req.log.error(
        `Internal Server Error: ${err.stack || err.message} for ${req.method} ${req.originalUrl}`,
        {
          errorMessage: err.message,
          errorStack: err.stack,
          requestPath: req.path,
          requestMethod: req.method,
          durationMs,
        }
      );
      if (!res.headersSent) {
        res.errLoggedByErrorHandler = true;
        res.status(500).json({
          error: {
            message: 'An internal server error occurred.',
            details:
              process.env.NODE_ENV === 'development'
                ? err.stack || err.message
                : undefined,
            type: 'InternalServerError',
            correlationId,
          },
        });
      } else {
        next(err);
        return;
      }
    }
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
