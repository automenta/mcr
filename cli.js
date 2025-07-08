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
// const { runEvaluatorTui } = require('./src/cli/evaluatorTui'); // Moved to dynamic import
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
  .action(async () => { // Changed to async to support dynamic import
    logger.info('Launching Performance Dashboard TUI...');
    try {
      // Dynamically import runEvaluatorTui when the command is actually run
      const { runEvaluatorTui } = await import('./src/cli/evaluatorTui.js'); // Assuming .js if it's ESM
      runEvaluatorTui();
    } catch (err) {
      logger.error('Failed to load or run Performance Dashboard TUI:', err);
      process.exit(1);
    }
  });

// Server control commands
program
  .command('start-server')
  .description('Start the MCR server.')
  .action(async () => {
    // This action will effectively do what `mcr.js` (root) does.
    // We can either require and run mcr.js or duplicate its server start logic.
    // For simplicity and to keep mcr.js as the single source of truth for server startup,
    // We will now import and use the startServer function from mcr.js
    const { startServer } = require('./mcr'); // Corrected path
    const logger = require('./src/logger'); // logger is still useful for CLI messages

    try {
      logger.info('Attempting to start MCR server via mcr.js module...');
      startServer();
      // The startServer function in mcr.js now handles all server setup,
      // including logging, signal handling, and error handling.
      // No need to duplicate that logic here.
      // logger.info('MCR server started successfully via CLI using mcr.js.');
      // Note: startServer() in mcr.js logs "Server is running", so this ^ might be redundant.
    } catch (error) {
      logger.error('Failed to start MCR server via CLI using mcr.js:', error);
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
