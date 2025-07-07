#!/usr/bin/env node

require('@babel/register')({
  extensions: ['.js', '.jsx', '.ts', '.tsx'],
  // Ignore node_modules, except for specific modules if necessary
  ignore: [/node_modules/],
  // Optionally, specify a cache directory for Babel
  // cache: true,
});

const { Command } = require('commander');
const { version } = require('./package.json'); // To get version from package.json
// const ConfigManager = require('./src/config'); // We'll use the new config directly
const { logger } = require('./src/logger'); // For CLI specific logging if needed, reconfigureLogger was unused

// TODO: Potentially initialize config and logger for CLI context if needed
// Example:
// const config = ConfigManager.load(); // Or however new config is loaded
// reconfigureLogger(config, 'cli'); // May need a way to specify CLI context for logger

const program = new Command();

program
  .name('mcr-cli') // Changed name slightly to distinguish from 'mcr' server script if both are linked
  .description('CLI for the Model Context Reasoner (MCR)')
  .version(version) // Use version from package.json
  .option('--json', 'Output raw JSON responses (for applicable commands)')
  .option(
    '--config <path>',
    'Path to a custom configuration file (Note: MCR_CONFIG_PATH env var also works)'
  );

const registerSessionCommands = require('./src/cli/commands/sessionCommands');
const registerOntologyCommands = require('./src/cli/commands/ontologyCommands');
const registerTranslationCommands = require('./src/cli/commands/translationCommands');
const registerQueryCommands = require('./src/cli/commands/queryCommands');
const registerStatusCommand = require('./src/cli/commands/statusCommands');
const registerPromptCommands = require('./src/cli/commands/promptCommands');
const registerChatCommand = require('./src/cli/commands/chatCommand');
const registerDemoCommand = require('./src/cli/commands/demoCommands');
const registerSandboxCommand = require('./src/cli/commands/sandboxCommands');
const registerStrategyCommands = require('./src/cli/commands/strategyCommands'); // New
const { runEvaluatorTui } = require('./src/cli/evaluatorTui'); // Added for perf-dashboard
// ... etc.

registerSessionCommands(program);
registerOntologyCommands(program);
registerTranslationCommands(program);
registerQueryCommands(program);
registerStatusCommand(program);
registerPromptCommands(program);
registerStrategyCommands(program); // New
registerChatCommand(program);
registerDemoCommand(program);
registerSandboxCommand(program);

// Perf Dashboard command
program
  .command('perf-dashboard')
  .description('Launch the Performance Dashboard and Database Explorer TUI.')
  .action(() => {
    logger.info('Launching Performance Dashboard TUI...');
    runEvaluatorTui();
  });

// Server control commands
program
  .command('start-server')
  .description('Start the MCR server.')
  .action(async () => {
    // This action will effectively do what `mcr.js` (root) does.
    // We can either require and run mcr.js or duplicate its server start logic.
    // For simplicity and to keep mcr.js as the single source of truth for server startup,
    // we can try to import and run its main logic if modularized, or spawn it as a child process.
    // Let's try to adapt the server starting logic here directly for now.

    // console.log('Attempting to start MCR server...'); // Use logger once configured
    // const logger = require('./src/logger'); // Ensure logger is available

    try {
      // The logic from mcr.js (root file)
      const app = require('./src/app');
      const config = require('./src/config');
      const logger = require('./src/logger'); // Assuming logger is configured by just requiring it

      const PORT = config.server.port;
      const HOST = config.server.host;

      const server = app.listen(PORT, HOST, () => {
        logger.info(
          `MCR Streamlined server listening on http://${HOST}:${PORT} (started via CLI)`
        );
        logger.info(`Current LLM provider: ${config.llm.provider}`);
        logger.info(`Current Reasoner provider: ${config.reasoner.provider}`);
        logger.info(`Log level set to: ${config.logLevel}`);
      });

      // Graceful shutdown logic (copied from mcr.js, might need to be centralized)
      const shutdown = (signal) => {
        logger.info(`${signal} signal received: closing HTTP server`);
        server.close(() => {
          logger.info('HTTP server closed');
          process.exit(0);
        });
      };

      process.on('SIGTERM', () => shutdown('SIGTERM'));
      process.on('SIGINT', () => shutdown('SIGINT'));

      // Note: Unhandled rejection and uncaught exception handlers are process-wide.
      // If cli.js is the main entry point for the server, they should be here or in a shared module.
      // If mcr.js is run directly, it has its own.
      // For now, let's assume these are handled if the server is started directly.
      // If this `start-server` command makes the CLI the *only* way to start, then they are needed here.
    } catch (error) {
      (console || logger).error('Failed to start MCR server via CLI:', error);
      process.exit(1);
    }
  });

async function main() {
  // Global option handling (e.g., for --config) could go here
  // For example, if program.opts().config is set, load that config.

  try {
    await program.parseAsync(process.argv);
  } catch (error) {
    // Commander typically handles its own errors and exits.
    // This catch is for unexpected errors during parsing or command execution.
    // (logger || console).error(`CLI Error: ${error.message}`);
    console.error(`CLI Error: ${error.message}`); // Use console if logger isn't configured for CLI yet
    process.exit(1);
  }

  // If no command was specified, Commander shows help by default.
  // Add any post-execution logic here if needed.
}

if (require.main === module) {
  main();
}

module.exports = program; // Export for testing or if other scripts need to extend it
