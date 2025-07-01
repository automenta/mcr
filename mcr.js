#!/usr/bin/env node

/**
 * Model Context Reasoner (MCR)
 * Main entry point for both the server and CLI.
 */

// Server-specific requires
const express = require('express');
const ConfigManager =require('./src/config');
const {
  logger,
  reconfigureLogger,
  initializeLoggerContext,
} = require('./src/logger');
const LlmService = require('./src/llmService');
const ApiError = require('./src/errors');
const setupRoutes = require('./src/routes');
const { v4: uuidv4 } = require('uuid');

// CLI-specific requires
const { Command } = require('commander');

// Babel register for CLI commands
require('@babel/register');

// Import command modules for CLI
const registerSessionCommands = require('./src/cli/commands/sessionCommands');
const registerOntologyCommands = require('./src/cli/commands/ontologyCommands');
const registerTranslationCommands = require('./src/cli/commands/translationCommands');
const registerQueryCommands = require('./src/cli/commands/queryCommands');
const registerChatCommand = require('./src/cli/commands/chatCommand');
const registerStatusCommand = require('./src/cli/commands/statusCommands');
const { registerPromptCommands } = require('./src/cli/commands/promptCommands');
const registerDemoCommand = require('./src/demo');
const registerSandboxCommand = require('./src/sandbox');

// --- Configuration for both Server and CLI ---
const config = ConfigManager.get();
reconfigureLogger(config);

// --- CLI Setup ---
const program = new Command();

program
  .name('mcr')
  .description('CLI for the Model Context Reasoner (MCR) API and Server Control')
  .version('2.2.5') // Matched version from a previous successful overwrite
  .option('--json', 'Output raw JSON responses from the API (CLI mode)')
  .option('--config <path>', 'Path to a custom configuration file (Note: MCR_CONFIG_PATH env var also works)');

// --- Server Setup ---
const app = express();
let serverInstanceHttp = null;

function setupApp(expressApp) {
  expressApp.use((req, res, next) => {
    req.correlationId = uuidv4();
    res.setHeader('X-Correlation-ID', req.correlationId);
    next();
  });
  expressApp.use(initializeLoggerContext);
  expressApp.use((req, res, next) => {
    req.startTime = Date.now();
    res.on('finish', () => {
      const durationMs = Date.now() - req.startTime;
      if (!res.errLoggedByErrorHandler && req.log) {
        req.log.http(
          `Request completed: ${req.method} ${req.originalUrl} - Status ${res.statusCode}`,
          { httpMethod: req.method, url: req.originalUrl, statusCode: res.statusCode, durationMs }
        );
      }
    });
    return next();
  });
  expressApp.use(express.json({ limit: '1mb' }));
  setupRoutes(expressApp);
  expressApp.use((err, req, res, next) => {
    const correlationId = req.correlationId || 'unknown';
    if (err instanceof ApiError) {
      (req.log || logger).warn(`API Error (${err.statusCode}): ${err.message}`, { errorDetails: err });
      const errorResponse = { error: { message: err.message, type: err.name, correlationId } };
      if (err.errorCode) errorResponse.error.code = err.errorCode;
      if (!res.headersSent) {
        res.errLoggedByErrorHandler = true;
        res.status(err.statusCode).json(errorResponse);
      } else { next(err); }
    } else {
      (req.log || logger).error(`Internal Server Error: ${err.message}`, { errorDetails: err });
      if (!res.headersSent) {
        res.errLoggedByErrorHandler = true;
        res.status(500).json({
          error: { message: 'An internal server error occurred.', type: 'InternalServerError', correlationId },
        });
      } else { next(err); }
    }
  });
}

function startServerInstanceInternal(expressApp, serverConfig) {
  if (serverInstanceHttp && serverInstanceHttp.listening) {
    logger.info('Server is already running or starting.');
    return serverInstanceHttp;
  }
  LlmService.init(serverConfig);
  setupApp(expressApp);
  logger.info(`Attempting to start MCR server on http://${serverConfig.server.host}:${serverConfig.server.port}...`);
  try {
    serverInstanceHttp = expressApp
      .listen(serverConfig.server.port, serverConfig.server.host, () => {
        logger.info(`MCR server listening on http://${serverConfig.server.host}:${serverConfig.server.port}`);
        // Removed LLM provider logging from here as it's already in config log
      })
      .on('error', (error) => {
        logger.error(`Failed to start server listener: ${error.message}`);
        serverInstanceHttp = null;
        if (error.code === 'EADDRINUSE') {
          logger.error(`Port ${serverConfig.server.port} is already in use.`);
        }
      });
  } catch (e) {
    logger.error(`Exception during server listen setup: ${e.message}`);
    serverInstanceHttp = null;
    throw e;
  }
  return serverInstanceHttp;
}

// --- Main Execution Logic ---
async function main() {
  const originalUserArgs = process.argv.slice(2);
  let argvForParsing = [...process.argv];
  let actionHandlerCalled = false; // Flag to track if a command's action handler was invoked

  // Wrapper for action handlers to set the flag
  const wrapAction = (handler) => {
    const wrappedAction = async function(...args) {
      actionHandlerCalled = true;
      return handler.apply(this, args);
    };
    wrappedAction.isWrapped = true; // Mark as wrapped
    return wrappedAction;
  };

  // Register all module-based CLI commands first
  registerSessionCommands(program);
  registerOntologyCommands(program);
  registerTranslationCommands(program);
  registerQueryCommands(program);
  registerChatCommand(program); // This one might also try to start server
  registerStatusCommand(program);
  registerPromptCommands(program);
  registerDemoCommand(program);   // This one might also try to start server
  registerSandboxCommand(program); // This one might also try to start server

  // Add the explicit 'start-server' command
  program
    .command('start-server')
    .description('Start the MCR server explicitly.')
    .action(wrapAction(async () => { // Ensure this action is also wrapped
      logger.info('Executing "start-server" command...');
      try {
        startServerInstanceInternal(app, config);
        // If successful, the server keeps the process alive.
      } catch (e) {
        logger.error(`Failed to start server via 'start-server' command: ${e.message}`);
        process.exit(1);
      }
    }));

  // IMPORTANT: Wrap actions for all registered commands (including those from modules and subcommands)
  // This ensures `actionHandlerCalled` is set correctly.
  function recursiveWrap(command) {
      if (command._actionHandler && !command._actionHandler.isWrapped) {
          const originalHandler = command._actionHandler;
          // Preserve the original number of arguments expected by the handler
          command._actionHandler = async function(...args) {
              actionHandlerCalled = true;
              return originalHandler.apply(this, args);
          };
          command._actionHandler.isWrapped = true;
      }
      command.commands.forEach(subCmd => recursiveWrap(subCmd));
  }
  program.commands.forEach(cmd => recursiveWrap(cmd));


  // Default 'chat' command logic:
  // If first arg is an option (e.g. --json) AND it's not help/version AND no known command is specified.
  if (originalUserArgs.length > 0 && originalUserArgs[0].startsWith('-')) {
    const isHelpOrVersion = originalUserArgs.includes('--help') || originalUserArgs.includes('-h') ||
                            originalUserArgs.includes('--version') || originalUserArgs.includes('-V');
    if (!isHelpOrVersion) {
        // Check if a known command is already present
        let knownCommandPresent = false;
        for(const arg of originalUserArgs) {
            if (!arg.startsWith('-')) { // First non-option argument
                if (program.commands.find(cmd => cmd.name() === arg || cmd.aliases().includes(arg))) {
                    knownCommandPresent = true;
                }
                break;
            }
        }
        if (!knownCommandPresent) {
            const optionIndex = argvForParsing.findIndex(arg => arg.startsWith('-'));
            // Ensure 'chat' is inserted at the correct position relative to script name and options
            const scriptPathIndex = argvForParsing.findIndex(arg => arg.includes('mcr.js')); // or simply index 1
            const insertAtIndex = Math.max(scriptPathIndex + 1, optionIndex); // Insert after script or before first option
            argvForParsing.splice(insertAtIndex, 0, 'chat');
        }
    }
  }

  try {
    await program.parseAsync(argvForParsing);
  } catch (error) {
    // Commander often handles its own errors by printing help and exiting.
    // This catch is for other unexpected parsing errors.
    logger.error(`Error during command parsing: ${error.message}`);
    process.exit(1);
  }

  const globalOpts = program.opts();

  // If no arguments were provided by the user at all (e.g., just `node mcr.js`)
  // AND no command action handler was called (actionHandlerCalled is false)
  // AND it wasn't a help or version request (which Commander handles by exiting),
  // THEN default to starting the server.
  if (!actionHandlerCalled && originalUserArgs.length === 0 && !globalOpts.help && !globalOpts.version) {
    logger.info('No user-specified CLI arguments or default command action. Defaulting to start MCR server...');
    try {
      startServerInstanceInternal(app, config);
    } catch (e) {
      logger.error(`Failed to start server by default: ${e.message}`);
      process.exit(1); // Exit if default server start fails
    }
  }
  // If actionHandlerCalled is true, a command's action has run.
  // - If 'start-server' ran, the server is running.
  // - If another command ran (e.g., 'demo run', 'chat'), it either completed and the process will exit,
  //   or it started its own server (like 'chat' can) which will keep the process alive.
  // If it was help/version, Commander should have exited the process already.
}

if (require.main === module) {
  main().catch(err => {
    const log = typeof logger !== 'undefined' ? logger : console;
    log.error('Unhandled error in main execution:', err);
    process.exit(1);
  });
}
