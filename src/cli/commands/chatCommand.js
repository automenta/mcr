/* eslint-disable no-console */
const readline = require('readline');
const { apiClient, API_BASE_URL, handleApiError } = require('../api');
const { readOntologyFile, handleCliOutput } = require('../utils');
const axios = require('axios');
const { spawn } = require('child_process');
const path = require('path');
const ConfigManager = require('../../config'); // To get port and host

let serverProcess = null;

// Function to check if server is alive
async function isServerAlive(url, retries = 5, delay = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      await axios.get(url, { timeout: 500 }); // Simple GET to root
      return true;
    } catch (error) {
      if (i < retries - 1) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        // Log last attempt error if verbose or similar flag
        // console.error(`Server check failed after ${retries} attempts: ${error.message}`);
      }
    }
  }
  return false;
}

// Function to start the MCR server
function startMcrServer(programOpts) {
  return new Promise((resolve, reject) => {
    if (!programOpts.json) {
      console.log('Starting MCR server...');
    }
    const mcrScriptPath = path.resolve(__dirname, '../../../mcr.js');
    const server = spawn('node', [mcrScriptPath], {
      detached: true, // Allows parent to exit independently
      stdio: 'ignore', // 'inherit' for debugging server output
    });
    serverProcess = server;

    server.on('error', (err) => {
      if (!programOpts.json) {
        console.error('Failed to start MCR server:', err);
      }
      reject(err);
    });

    // Unref if you want the parent process to be able to exit independently of the child.
    server.unref();

    // Give the server some time to start
    const config = ConfigManager.get();
    const healthCheckUrl = `http://${config.server.host}:${config.server.port}/`;

    isServerAlive(healthCheckUrl, 10, 500) // Check more frequently for faster startup
      .then((alive) => {
        if (alive) {
          if (!programOpts.json) {
            console.log('MCR server started successfully.');
          }
          resolve();
        } else {
          if (!programOpts.json) {
            console.error(
              'MCR server did not become available in time. Check server logs.'
            );
          }
          reject(new Error('Server failed to start or become healthy.'));
        }
      })
      .catch(reject);
  });
}

async function startChatAsync(options, command) {
  const programOpts = command.parent.opts();
  let sessionId = null;
  let ontologyContent = null;
  let serverStartedByChat = false;

  if (options.ontology) {
    ontologyContent = readOntologyFile(options.ontology);
    if (ontologyContent && !programOpts.json) {
      console.log(`Using ontology for chat session: ${options.ontology}`);
    }
  }

  try {
    const config = ConfigManager.get();
    const serverUrl = `http://${config.server.host}:${config.server.port}/`;

    if (!(await isServerAlive(serverUrl, 1, 100))) { // Quick check first
      try {
        await startMcrServer(programOpts);
        serverStartedByChat = true;
      } catch (serverStartError) {
        if (!programOpts.json) {
          console.error('Could not start MCR server. Please start it manually.');
        } else {
          console.error(JSON.stringify({ error: 'server_start_failed', message: serverStartError.message }));
        }
        process.exit(1);
      }
    } else {
      if (!programOpts.json) {
        console.log('Using existing MCR server.');
      }
    }

    const sessionResponse = await apiClient.post('/sessions');
    sessionId = sessionResponse.data.sessionId;
    if (!programOpts.json) {
      console.log(`New chat session started. Session ID: ${sessionId}`);
    }

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: programOpts.json ? '' : 'You> ',
    });

    if (!programOpts.json) rl.prompt();

    rl.on('line', async (line) => {
      const question = line.trim();
      if (
        question.toLowerCase() === 'exit' ||
        question.toLowerCase() === 'quit'
      ) {
        rl.close();
        return;
      }
      if (!question) {
        if (!programOpts.json) rl.prompt();
        return;
      }

      try {
        const requestBody = {
          query: question,
          options: { style: 'conversational' },
        };
        if (ontologyContent) {
          requestBody.ontology = ontologyContent;
        }

        const response = await axios.post(
          `${API_BASE_URL}/sessions/${sessionId}/query`,
          requestBody
        );

        const prefix = programOpts.json ? '' : 'MCR> ';
        handleCliOutput(response.data, programOpts, 'answer', prefix);
      } catch (error) {
        handleApiError(error, programOpts);
      }
      if (!programOpts.json) rl.prompt();
    }).on('close', async () => {
      if (sessionId) {
        try {
          const deleteResponse = await axios.delete(
            `${API_BASE_URL}/sessions/${sessionId}`
          );
          if (!programOpts.json) {
            console.log(
              deleteResponse.data.message || `Session ${sessionId} terminated.`
            );
          } else {
            console.log(
              JSON.stringify({
                action: 'chat_session_terminated',
                sessionId: sessionId,
                details: deleteResponse.data,
              })
            );
          }
        } catch (error) {
          if (!programOpts.json) {
            console.error(
              `Failed to terminate session ${sessionId}:`,
              error.message
            );
          } else {
            console.error(
              JSON.stringify({
                action: 'chat_session_termination_failed',
                sessionId: sessionId,
                error: error.message,
              })
            );
          }
        }
      }
      if (!programOpts.json) {
        console.log('Exiting chat.');
      }
      if (serverProcess && serverStartedByChat) {
        if (!programOpts.json) {
          console.log('Stopping MCR server...');
        }
        // Detached processes might not be killable this way if they are truly independent.
        // For robust cleanup, especially on Windows, more complex solutions might be needed.
        // On POSIX, process.kill should work if serverProcess.pid is valid.
        try {
            if (serverProcess.pid) {
                 process.kill(serverProcess.pid, 'SIGTERM'); // or 'SIGINT'
            }
        } catch (e) {
            if (!programOpts.json) {
                console.warn("Could not send kill signal to server process. It might have already exited or requires manual termination.", e.message);
            }
        }
        serverProcess = null;
      }
      process.exit(0);
    });
  } catch (error) {
    // Check if the error is due to connection refused (server not running or initial check failed)
    if (error.code === 'ECONNREFUSED' || (error.response && error.response.status === undefined && error.request)) {
        if (!programOpts.json) {
            console.error(`Error connecting to MCR server: ${error.message}. Please ensure the server is running or check configuration.`);
        } else {
            console.error(JSON.stringify({ error: 'connection_failed', message: error.message }));
        }
    } else if (!error.response && !error.request && !programOpts.json) {
      console.error(`An unexpected error occurred: ${error.message}`);
    } else if (!error.response && !error.request && programOpts.json) {
      console.error(
        JSON.stringify({
          error: 'chat_start_failed_unexpected',
          message: error.message,
        })
      );
    } else if (error.response) { // Handle regular API errors if server was reached
        handleApiError(error, programOpts);
    }
    // If serverProcess exists and we are exiting due to an error, try to kill it.
    if (serverProcess && serverStartedByChat) {
        if (!programOpts.json) {
          console.log('Attempting to stop MCR server due to error...');
        }
        try {
            if (serverProcess.pid) {
                process.kill(serverProcess.pid, 'SIGTERM');
            }
        } catch (e) {
             if (!programOpts.json) {
                console.warn("Could not send kill signal to server process during error exit.", e.message);
            }
        }
        serverProcess = null;
    }
    process.exit(1);
  }
}

module.exports = (program) => {
  program
    .command('chat')
    .description('Start an interactive chat session with the MCR. Starts the server if not running.')
    .option(
      '-o, --ontology <file>',
      'Specify an ontology file to use for the entire chat session'
    )
    .action(startChatAsync);
};
