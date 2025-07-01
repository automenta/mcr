#!/usr/bin/env node

require('@babel/register');

const { Command } = require('commander');
const inquirer = require('inquirer');
// const api = require('./apiHandlers'); // Removed
const ConfigManager = require('./config');
const mcrCore = require('./mcrCore'); // Added
// const {
//   isServerAliveAsync,
//   startMcrServerAsync,
//   stopMcrServer,
// } = require('./cli/tuiUtils/serverManager'); // Removed
// const { delay } = require('./cli/utils'); // delay is not used anymore it seems

const sandboxProgram = new Command();

// let mcrServerProcess = null; // Removed
// let serverStartedBySandbox = false; // Removed

// Removed ensureServerRunning function

async function sandboxLoop(cmdObj) {
  // const programOpts = cmdObj.optsWithGlobals(); // programOpts was for server starting, not needed directly by sandbox logic now

  console.log('Initializing MCR Core for Sandbox...');
  const config = ConfigManager.get({ exitOnFailure: true });
  try {
    await mcrCore.init(config);
    if (mcrCore.LlmService) {
        const providerName = mcrCore.LlmService.getActiveProviderName();
        const modelName = mcrCore.LlmService.getActiveModelName();
        console.log(`MCR Core Initialized. Using LLM Provider: ${providerName}, Model: ${modelName || 'N/A'}`);
    } else {
        console.error('MCR Core initialized, but LlmService is not available.');
    }
  } catch (initError) {
    console.error(`MCR Core Initialization Failed: ${initError.message}. Sandbox cannot run.`);
    if (initError.stack) {
        console.error(initError.stack);
    }
    process.exit(1);
  }
  console.log('---');

  let sessionId = null;
  try {
    console.log('Creating sandbox session...');
    const sessionData = mcrCore.createSession(); // Direct call
    sessionId = sessionData.sessionId;
    console.log(`Sandbox session created: ${sessionId}`);
    console.log('---');

    let keepGoing = true;
    while (keepGoing) {
      const { nlQuery } = await inquirer.prompt([
        {
          type: 'input',
          name: 'nlQuery',
          message:
            'Enter your Natural Language query (or type "exit" to quit):',
        },
      ]);

      if (nlQuery.toLowerCase() === 'exit') {
        keepGoing = false;
        continue;
      }

      if (!nlQuery.trim()) {
        console.log('Query cannot be empty.');
        console.log('---');
        continue;
      }

      const { confirmQuery } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirmQuery',
          message: `Submit query: "${nlQuery}"?`,
          default: true,
        },
      ]);

      if (confirmQuery) {
        console.log('Processing query...');
        try {
          // Request debug information to get more details
          const response = await mcrCore.query(sessionId, nlQuery, { // Direct call
            style: 'verbose', // Or any other style you prefer for sandbox
            debug: true,
          });

          console.log('\n=== Sandbox Output ===');
          console.log(`NL Input: ${nlQuery}`);
          console.log('---');

          // The mcrCore.query response structure matches the API structure
          if (response.debug?.prologQueryGenerated) {
            console.log('Query (Logic - Generated Prolog):');
            console.log(response.debug.prologQueryGenerated);
            console.log('---');
          }

          if (response.result) {
            console.log('Results (Logic - Simplified):');
            console.log(JSON.stringify(response.result, null, 2));
            console.log('---');
          }

          if (response.debug?.rawReasonerResults) {
            console.log('Results (Logic - Raw Reasoner Output):');
            response.debug.rawReasonerResults.forEach((out) => console.log(out));
            console.log('---');
          }

          console.log('Result (NL - MCR):');
          console.log(response.answer || 'No NL answer provided by MCR.');
          console.log('---');
          console.log('Result (NL - Zero-shot LLM for comparison):');
          console.log(response.zeroShotLmAnswer || 'No zero-shot NL answer provided.');
          console.log('======================\n');

        } catch (error) {
          // Error from mcrCore call
          const errorMessage = error.message || 'Unknown error during query processing.';
          console.error(`Query Error: ${errorMessage}`);
          if (error.stack) console.error(error.stack);
          // If ApiError and has details:
          if (error.errorCode || error.details) {
            console.error('Details:', JSON.stringify({ code: error.errorCode, details: error.details }, null, 2));
          }
        }
      } else {
        console.log('Query cancelled.');
      }
      console.log('---');
    }
  } catch (error) { // Catch errors from session creation or other general sandbox logic
    console.error(`Sandbox Error: ${error.message}`);
    if (error.stack) console.error(error.stack);
  } finally {
    if (sessionId) {
      try {
        console.log(`\nDeleting sandbox session: ${sessionId}...`);
        mcrCore.deleteSession(sessionId); // Direct call
        console.log('Sandbox session deleted.');
      } catch (e) {
        console.error(`Error deleting session ${sessionId}: ${e.message}`);
        if (e.stack) console.error(e.stack);
      }
    }
    // Removed server stopping logic as server is not started by sandbox anymore
    console.log('Exiting sandbox.');
  }
}

const registerSandboxCommand = (mainProgram) => {
  mainProgram
    .command('sandbox')
    .description(
      'Experimental sandbox for MCR. Starts the server if not running.'
    )
    // Add any sandbox specific options here if needed in the future
    // .option('-s, --sessionId <id>', 'Use an existing session ID') // Example
    .action(sandboxLoop);
};

// If this script is run directly (node src/sandbox.js)
if (require.main === module) {
  sandboxProgram
    .name('mcr-sandbox')
    .description(
      'Experimental sandbox for MCR (Standalone). Starts the server if not running.'
    )
    .version('1.0.0')
    // Add global options if necessary, e.g., for server config path
    .option(
      '--config <path>',
      'Path to a custom configuration file for server start'
    )
    .action(async (options, command) => {
      // Standalone action calls sandboxLoop directly
      await sandboxLoop(command); // Pass the command object itself
    });
  sandboxProgram.parse(process.argv);
} else {
  // Export the registration function for the main CLI
  module.exports = registerSandboxCommand;
}
