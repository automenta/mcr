#!/usr/bin/env node

require('@babel/register');

const { Command } = require('commander');
const inquirer = require('inquirer');
const api = require('./apiHandlers');
const ConfigManager = require('./config');
const { isServerAliveAsync, startMcrServerAsync, stopMcrServer } = require('./cli/tuiUtils/serverManager');
const { delay } = require('./cli/utils');

const sandboxProgram = new Command();

let mcrServerProcess = null; // To keep track of the server process if started by sandbox
let serverStartedBySandbox = false;

/**
 * Ensures the MCR server is running, starting it if necessary.
 * @param {object} programOpts - Commander program options.
 * @returns {Promise<boolean>} True if the server is running, false otherwise.
 */
async function ensureServerRunning(programOpts) {
  const config = ConfigManager.get();
  const serverUrl = `http://${config.server.host}:${config.server.port}/`;
  const healthCheckUrl = serverUrl;

  if (!(await isServerAliveAsync(healthCheckUrl, 1, 100))) {
    console.log('MCR server not detected. Attempting to start it...');
    try {
      mcrServerProcess = await startMcrServerAsync(programOpts);
      serverStartedBySandbox = true;
      console.log('MCR server process started. Waiting a moment for it to initialize...');
      await delay(2000); // Wait for server to boot
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

async function sandboxLoop(cmdObj) {
  const programOpts = cmdObj.optsWithGlobals(); // Access global options like --json from main 'mcr' command

  if (!await ensureServerRunning(programOpts)) {
    process.exit(1);
  }

  let sessionId = null;
  try {
    console.log('Creating sandbox session...');
    const sessionData = await api.createSession();
    sessionId = sessionData.sessionId;
    console.log(`Sandbox session created: ${sessionId}`);
    console.log('---');

    let keepGoing = true;
    while (keepGoing) {
      const { nlQuery } = await inquirer.prompt([
        {
          type: 'input',
          name: 'nlQuery',
          message: 'Enter your Natural Language query (or type "exit" to quit):',
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
          const response = await api.query(sessionId, nlQuery, { style: 'verbose', debug: true });

          console.log('\n=== Sandbox Output ===');
          console.log(`NL Input: ${nlQuery}`);
          console.log('---');

          if (response.translation) {
            console.log('Input (Logic - Translation):');
            console.log(JSON.stringify(response.translation, null, 2));
            console.log('---');
          }

          // The 'query' in debug might represent the structured/logic query
          if (response.debug?.query) {
            console.log('Query (Logic - Processed):');
            console.log(JSON.stringify(response.debug.query, null, 2));
            console.log('---');
          }

          if (response.prologOutput && response.prologOutput.length > 0) {
            console.log('Results (Logic - Prolog Output):');
            response.prologOutput.forEach(out => console.log(out));
            console.log('---');
          } else if (response.debug?.solutions) {
            console.log('Results (Logic - Solutions):');
            console.log(JSON.stringify(response.debug.solutions, null, 2));
            console.log('---');
          }

          console.log('Result (NL):');
          console.log(response.answer || 'No NL answer provided.');
          console.log('======================\n');

        } catch (error) {
          const errorMessage = error.response?.data?.error?.message ||
                             error.response?.data?.message ||
                             error.message ||
                             'Unknown error during query processing.';
          console.error(`Query Error: ${errorMessage}`);
          if (error.response?.data) {
            console.error('Details:', JSON.stringify(error.response.data, null, 2));
          }
        }
      } else {
        console.log('Query cancelled.');
      }
      console.log('---');
    }
  } catch (error) {
    console.error(`Sandbox Error: ${error.message}`);
    if (error.stack) console.error(error.stack);
  } finally {
    if (sessionId) {
      try {
        console.log(`\nDeleting sandbox session: ${sessionId}...`);
        await api.deleteSession(sessionId);
        console.log('Sandbox session deleted.');
      } catch (e) {
        console.error(`Error deleting session ${sessionId}: ${e.message}`);
      }
    }
    if (serverStartedBySandbox && mcrServerProcess) {
      console.log('Stopping MCR server started by sandbox...');
      // serverManager's stopMcrServer expects the process object
      await stopMcrServer(mcrServerProcess);
    }
    console.log('Exiting sandbox.');
  }
}


const registerSandboxCommand = (mainProgram) => {
  mainProgram
    .command('sandbox')
    .description('Experimental sandbox for MCR. Starts the server if not running.')
    // Add any sandbox specific options here if needed in the future
    // .option('-s, --sessionId <id>', 'Use an existing session ID') // Example
    .action(sandboxLoop);
};

// If this script is run directly (node src/sandbox.js)
if (require.main === module) {
  sandboxProgram
    .name("mcr-sandbox")
    .description('Experimental sandbox for MCR (Standalone). Starts the server if not running.')
    .version('1.0.0')
    // Add global options if necessary, e.g., for server config path
    .option('--config <path>', 'Path to a custom configuration file for server start')
    .action(async (options, command) => { // Standalone action calls sandboxLoop directly
      await sandboxLoop(command); // Pass the command object itself
    });
  sandboxProgram.parse(process.argv);
} else {
  // Export the registration function for the main CLI
  module.exports = registerSandboxCommand;
}
