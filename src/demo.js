#!/usr/bin/env node

// Enable runtime transpilation for JSX/modern JS features if any are used (though less likely here)
require('@babel/register');

const { Command } = require('commander'); // Removed extraneous underscore
const api = require('./apiHandlers'); // Assuming API handlers are in apiHandlers.js at src level
const ConfigManager = require('./config');
const { isServerAliveAsync, startMcrServerAsync } = require('./cli/tuiUtils/serverManager');
const chatDemos = require('./cli/tuiUtils/chatDemos');
const { readFileContentSafe, delay, parseTuiCommandArgs } = require('./cli/utils'); // Common utilities

// Create a new Commander program instance for the demo command
const program = new Command();

// Context object for demo functions
const demoContext = {
  logMessage: (type, text) => {
    const messageText =
      typeof text === 'object' && text !== null
        ? JSON.stringify(text, null, 2)
        : text;
    console.log(`[${type.toUpperCase()}] ${messageText}`);
  },
  // API functions - these will be direct calls to the api module
  agentApiCreateSession: api.createSession,
  agentApiAssertFacts: api.assertFacts,
  agentApiQuery: api.query,
  agentApiDeleteSession: api.deleteSession,
  agentApiAddOntology: api.addOntology,
  agentApiDeleteOntology: api.deleteOntology,
  // Utilities
  delay,
  readFileContentSafe,
  parseTuiCommandArgs, // Though likely not used by demos directly, included for completeness
  // Demo specific state setters - not needed for console version
  setIsDemoRunning: (_isRunning) => {}, // No-op for console demos
  // Functions to get state - not applicable here or will be handled differently
  getCurrentSessionId: () => null, // Demos manage their own session IDs
  getInitialOntologyPath: () => null, // Demos specify paths directly if needed
  // Other TUI specific things that demos might have used via tuiContext
  // These need to be no-ops or handled if a demo relies on them.
  // For now, assuming demos primarily use logMessage, API calls, and utils.
};

/**
 * Ensures the MCR server is running, starting it if necessary.
 * @param {object} programOpts - Commander program options.
 * @returns {Promise<boolean>} True if the server is running, false otherwise.
 */
async function ensureServerRunning(programOpts) {
  const config = ConfigManager.get();
  const serverUrl = `http://${config.server.host}:${config.server.port}/`;
  const healthCheckUrl = serverUrl; // Or specific health endpoint

  if (!(await isServerAliveAsync(healthCheckUrl, 1, 100))) {
    console.log('MCR server not detected. Attempting to start it...');
    try {
      await startMcrServerAsync(programOpts); // serverManager now handles the process
      console.log('MCR server process started. Waiting a moment for it to initialize...');
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for server to boot
      if (!(await isServerAliveAsync(healthCheckUrl, 5, 1000))) {
        console.error('Server process was started but did not become healthy in time.');
        return false;
      }
      console.log('MCR server is now running.');
      return true;
    } catch (serverStartError) {
      console.error(`Critical: Failed to start MCR server: ${serverStartError.message}.`);
      console.error('Please start it manually and try again.');
      return false;
    }
  }
  // console.log('Existing MCR server detected.');
  return true;
}

async function runDemo(demoName, cmdObj) {
  const programOpts = cmdObj.parent.parent.opts(); // Access global options if needed

  if (!await ensureServerRunning(programOpts)) {
    process.exit(1);
  }

  demoContext.logMessage('system', `Attempting to run demo: ${demoName}`);

  try {
    if (demoName === 'simpleQA' || demoName === 'simpleqa') {
      await chatDemos.runSimpleQADemo(demoContext);
    } else if (
      demoName === 'family' ||
      demoName === 'familyOntology' ||
      demoName === 'familyontology'
    ) {
      await chatDemos.runFamilyOntologyDemo(demoContext);
    } else {
      demoContext.logMessage(
        'error',
        `Unknown demo: ${demoName}. Available: simpleQA, family`
      );
      console.log("\nAvailable demos are: simpleQA, family");
    }
  } catch (error) {
    demoContext.logMessage('error', `An unexpected error occurred while running demo ${demoName}: ${error.message}`);
    if (error.stack) {
      console.error(error.stack);
    }
  } finally {
    // If server was started by this script, ideally it should be stopped.
    // However, serverManager doesn't easily expose this control back here yet.
    // For now, demos will leave the server running.
    demoContext.logMessage('system', 'Demo execution finished.');
  }
}

// Define the demo command
program
  .command('run <demoName>')
  .description('Run a specific demo. Available: simpleQA, family')
  .action(runDemo);


// This module will be imported by the main cli.js, which will call program.addCommand(demoCommand)
// So, we export the program instance configured with the 'run' subcommand.
// However, to make this file executable on its own (e.g. `node src/demo.js run simpleQA`),
// we need to parse arguments if it's the main module.

// This function will be called by the main cli.js to integrate the 'demo' command
const registerDemoCommand = (mainProgram) => {
  mainProgram.addCommand(
    program // 'program' here is the Command instance for 'demo'
      .name('demo')
      .description('Run predefined demos (e.g., demo run simpleQA)')
      // .executableDir(__dirname) // Not needed if action handlers are JS functions
  );
};


// If this script is run directly:
if (require.main === module) {
  // This setup is for standalone execution: `node src/demo.js run simpleQA`
  // It needs its own top-level program definition if we want global options like --json
  const standaloneProgram = new Command();
  standaloneProgram
    .version('1.0.0') // Demo runner version
    .description("MCR Demo Runner (Standalone)")
    // Add global options if necessary, e.g., for server config path
    .option('--config <path>', 'Path to a custom configuration file');

  // Add the 'run' command (which is 'program' defined above) as a subcommand to standaloneProgram
  // To make `node src/demo.js run simpleQA` work, 'program' needs to be the 'run' command itself
  // and not a parent 'demo' command.

  // Let's redefine for standalone:
  const standaloneDemoRunner = new Command();
  standaloneDemoRunner
    .name("mcr-demo") // Name for `node src/demo.js --help`
    .description('Run predefined MCR demos. Starts the server if not running.')
    .version('1.0.0')
    .option('--config <path>', 'Path to custom MCR config file (for server start)') // Example global opt
    .command('run <demoName>')
    .description('Run a specific demo. Available: simpleQA, family. Example: mcr-demo run simpleQA')
    .action(async (demoName, cmdObj) => {
      // cmdObj.parent.opts() would get global options like --config
      await runDemo(demoName, cmdObj);
    });

  standaloneDemoRunner.parse(process.argv);

} else {
  // Export the registration function for the main CLI
  module.exports = registerDemoCommand;
}
