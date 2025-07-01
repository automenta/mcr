#!/usr/bin/env node

// Enable runtime transpilation for JSX/modern JS features in CLI commands
// This needs to be at the top before other modules are required.
require('@babel/register');

/**
 * Model Context Reasoner (MCR)
 * A Node.js server bridging LLMs and Prolog reasoners via a RESTful API,
 * and a CLI for interacting with the server.
 * Features stateful sessions, multi-provider LLM support, and modular design.
 */

const express = require('express');
const { Command } = require('commander');
const { v4: uuidv4 } = require('uuid');

const ConfigManager = require('./src/config');
const {
  logger,
  reconfigureLogger,
  initializeLoggerContext,
} = require('./src/logger');
const LlmService = require('./src/llmService');
const ApiError = require('./src/errors');
const setupRoutes = require('./src/routes');

// CLI Command Imports (paths adjusted from src/cli.js)
const registerSessionCommands = require('./src/cli/commands/sessionCommands');
const registerOntologyCommands = require('./src/cli/commands/ontologyCommands');
const registerTranslationCommands = require('./src/cli/commands/translationCommands');
const registerQueryCommands = require('./src/cli/commands/queryCommands');
const registerChatCommand = require('./src/cli/commands/chatCommand');
const registerStatusCommand = require('./src/cli/commands/statusCommands');
const { registerPromptCommands } = require('./src/cli/commands/promptCommands');

const config = ConfigManager.get();
reconfigureLogger(config); // Reconfigure logger early, before server/CLI specific logging
LlmService.init(config); // Initialize LLM Service

const app = express(); // Express app instance for the server

// --- Server Setup ---
function setupApp(expressApp) {
  expressApp.use((req, res, next) => {
    req.correlationId = uuidv4();
    res.setHeader('X-Correlation-ID', req.correlationId);
    next();
  });
  expressApp.use(initializeLoggerContext);

  expressApp.use((req, res, next) => {
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

  expressApp.use(express.json({ limit: '1mb' }));
  setupRoutes(expressApp); // Setup API routes

  expressApp.use((err, req, res, next) => {
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
      }
    }
  });
}

setupApp(app); // Configure the Express app

function startServerAndLog(expressAppInstance, serverConfig) {
  logger.info('Attempting to start MCR server...');
  return expressAppInstance
    .listen(serverConfig.server.port, serverConfig.server.host, () => {
      logger.info(
        `MCR server listening on http://${serverConfig.server.host}:${serverConfig.server.port}`
      );
      logger.info(`LLM Provider: ${serverConfig.llm.provider}`);
      const llmModel = serverConfig.llm.model[serverConfig.llm.provider];
      logger.info(`LLM Model: ${llmModel}`);
      if (serverConfig.llm.provider === 'ollama') {
        logger.info(`Ollama Base URL: ${serverConfig.llm.ollamaBaseUrl}`);
      }
    })
    .on('error', (error) => {
      logger.error(`Failed to start server: ${error.message}`);
      if (error.code === 'EADDRINUSE') {
        logger.error(
          `Port ${serverConfig.server.port} is already in use. Is another instance of MCR running?`
        );
      }
      process.exit(1); // Exit if server fails to start
    });
}

// --- CLI Setup ---
const program = new Command();

program
  .name('mcr')
  .description('Model Context Reasoner (MCR) CLI and Server')
  .version('2.1.0') // Keep version consistent
  .option('--json', 'Output raw JSON responses from the API (CLI mode)');

// Server command
program
  .command('server')
  .description('Start the MCR API server (default action if no command is given)')
  .action(() => {
    logger.info('Received "server" command. Starting MCR server...');
    startServerAndLog(app, config);
  });

// Register other CLI commands
registerSessionCommands(program);
registerOntologyCommands(program);
registerTranslationCommands(program);
registerQueryCommands(program);
registerChatCommand(program); // This includes the TUI logic
registerStatusCommand(program);
registerPromptCommands(program);


// --- Main Execution Logic ---
if (require.main === module) {
  const originalCliArgs = process.argv.slice(2);

  // If no command is specified (e.g., just 'node mcr.js'), default to starting the server.
  if (originalCliArgs.length === 0) {
    logger.info('No command specified, defaulting to start server.');
    startServerAndLog(app, config);
  } else {
    // Logic to default to 'chat' if no *other* command is specified,
    // but options like --json might be present.
    // This is complex because 'server' is also a command.
    // Commander's default behavior when a command isn't found is to show help.
    // We want 'mcr --json' to become 'mcr chat --json'.
    // We also want 'mcr' to become 'mcr server'. (Handled by the length === 0 check above)

    // Logic to handle cases like `mcr --json` defaulting to `mcr chat --json`
    // without interfering with `mcr --json status` or `mcr status --json`.

    let actualCommandFound = false;
    for (const arg of originalCliArgs) {
        // Check if arg is a known command name or alias
        if (program.commands.some(c => c.name() === arg || c.aliases().includes(arg))) {
            actualCommandFound = true;
            break;
        }
    }

    const helpOrVersionArg = originalCliArgs.find(
      (arg) => arg === '--help' || arg === '-h' || arg === '--version' || arg === '-V'
    );

    // If --json is present, but no actual command was found, and it's not help/version,
    // then we prepend 'chat' to the arguments.
    if (originalCliArgs.includes('--json') && !actualCommandFound && !helpOrVersionArg) {
      logger.info("No specific command found with --json option, defaulting to 'chat' command.");
      // Find the index of mcr.js in process.argv to correctly insert 'chat'
      // process.argv is like [ 'node', '/path/to/mcr.js', '--json', ... ]
      const scriptPathIndex = process.argv.findIndex(arg => arg.endsWith('mcr.js'));
      if (scriptPathIndex !== -1) {
        process.argv.splice(scriptPathIndex + 1, 0, 'chat');
      } else {
        // Fallback if script path isn't found as expected (should not happen with node execution)
        process.argv.splice(2, 0, 'chat');
      }
    }

    program.parse(process.argv);
  }
}

// Export for testing or programmatic use (server components)
module.exports = { app, startServer: startServerAndLog, config, program };
