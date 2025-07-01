#!/usr/bin/env node

// Enable runtime transpilation for JSX/modern JS features if any are used (though less likely here)
require('@babel/register');

const { Command } = require('commander');
const api = require('./apiHandlers');
const ConfigManager = require('./config');
const {
  isServerAliveAsync,
  startMcrServerAsync,
} = require('./cli/tuiUtils/serverManager');
const chatDemos = require('./cli/tuiUtils/chatDemos');
const {
  readFileContentSafe,
  delay,
  parseTuiCommandArgs,
} = require('./cli/utils');

const program = new Command(); // This is the 'demo' command group

const demoContext = {
  logMessage: (type, text) => {
    const messageText =
      typeof text === 'object' && text !== null
        ? JSON.stringify(text, null, 2)
        : text;
    console.log(`[${type.toUpperCase()}] ${messageText}`);
  },
  // Replaced console.log with logger for demoContext.logMessage
  logMessage: (type, text) => {
    const messageText =
      typeof text === 'object' && text !== null
        ? JSON.stringify(text, null, 2)
        : text;
    // Assuming a simple logger is sufficient here, or pass a real logger instance
    require('./logger').logger.info(`[${type.toUpperCase()}] ${messageText}`);
  },
  agentApiCreateSession: api.createSession,
  agentApiAssertFacts: api.assertFacts,
  agentApiQuery: api.query,
  agentApiDeleteSession: api.deleteSession,
  agentApiAddOntology: api.addOntology,
  agentApiDeleteOntology: api.deleteOntology,
  delay,
  readFileContentSafe,
  parseTuiCommandArgs,
  setIsDemoRunning: (_isRunning) => {},
  getCurrentSessionId: () => null,
  getInitialOntologyPath: () => null,
};

async function ensureServerRunningAsync(programOpts) {
  const config = ConfigManager.get();
  const serverUrl = `http://${config.server.host}:${config.server.port}/`;
  const healthCheckUrl = serverUrl;

  if (!(await isServerAliveAsync(healthCheckUrl, 1, 100))) {
    console.log('MCR server not detected. Attempting to start it...');
    try {
      await startMcrServerAsync(programOpts);
      console.log(
        'MCR server process started. Waiting a moment for it to initialize...'
      );
      await new Promise((resolve) => setTimeout(resolve, 2000));
      if (!(await isServerAliveAsync(healthCheckUrl, 5, 1000))) {
        console.error(
          'Server process was started but did not become healthy in time.'
        );
        return false;
      }
      console.log('MCR server is now running.');
      return true;
    } catch (serverStartError) {
      console.error(
        `Critical: Failed to start MCR server: ${serverStartError.message}.`
      );
      console.error('Please start it manually and try again.');
      return false;
    }
  }
  return true;
}

// Correct signature for action handler: individual args, then options object, then command object
async function runDemoAsync(demoName, options, command) {
  // Global options are on the 'command' object, which is the 'run' command instance.
  // optsWithGlobals() correctly traverses up to the main program options.
  const programOpts = command.optsWithGlobals();

  if (!(await ensureServerRunningAsync(programOpts))) {
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
      console.log('\nAvailable demos are: simpleQA, family');
    }
  } catch (error) {
    demoContext.logMessage(
      'error',
      `An unexpected error occurred while running demo ${demoName}: ${error.message}`
    );
    if (error.stack) {
      console.error(error.stack);
    }
  } finally {
    demoContext.logMessage('system', 'Demo execution finished.');
  }
}

// Define the 'run' subcommand for the 'demo' command group
program
  .command('run <demoName>')
  .description('Run a specific demo. Available: simpleQA, family')
  .action(runDemoAsync); // runDemoAsync is the action handler for 'run'

const registerDemoCommandAsync = (mainProgram) => {
  mainProgram.addCommand(
    program // 'program' is the 'demo' command group, now with 'run' as its subcommand
      .name('demo')
      .description('Run predefined demos (e.g., demo run simpleQA)')
  );
};

if (require.main === module) {
  // Standalone execution logic for `node src/demo.js run simpleQA`
  const standaloneProgram = new Command();
  standaloneProgram
    .description('MCR Demo Runner (Standalone)')
    .option(
      '--config <path>',
      'Path to a custom configuration file for server start'
    );

  // The 'program' defined above is the 'demo' command object.
  // For standalone, we want `node src/demo.js run <demoName>`.
  // So, we need a 'run' command at the top level of standaloneProgram.
  standaloneProgram
    .command('run <demoName>')
    .description('Run a specific demo. Available: simpleQA, family')
    .action(async (demoName, options, command) => {
      // Correct signature
      // 'command' here is the standalone 'run' command.
      // 'command.optsWithGlobals()' will get --config if provided.
      // The 'options' parameter will contain any options specific to this standalone 'run' command (none defined here).
      await runDemoAsync(demoName, options, command);
    });

  standaloneProgram.parseAsync(process.argv); // Changed to parseAsync
} else {
  module.exports = registerDemoCommandAsync;
}
