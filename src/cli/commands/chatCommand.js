/* eslint-disable no-console */
const readline = require('readline');
const { apiClient, API_BASE_URL, handleApiError } = require('../api');
const { readOntologyFile, handleCliOutput } = require('../utils'); // Added handleCliOutput
const axios = require('axios');

// chat command has options, no direct arguments. Action: (options, command)
async function startChatAsync(options, command) {
  // Renamed
  const programOpts = command.parent.opts(); // Global program options
  let sessionId = null;
  let ontologyContent = null;

  if (options.ontology) {
    ontologyContent = readOntologyFile(options.ontology);
    if (ontologyContent && !programOpts.json) {
      console.log(`Using ontology for chat session: ${options.ontology}`);
    }
  }

  try {
    const sessionResponse = await apiClient.post('/sessions');
    sessionId = sessionResponse.data.sessionId;
    if (!programOpts.json) {
      console.log(`New chat session started. Session ID: ${sessionId}`);
    } else {
      // If --json, we should output the session creation details as JSON
      // However, chat is interactive, so --json for the *entire chat flow* is weird.
      // Let's assume --json primarily affects the output of each query *within* the chat.
      // The initial session message could be conditional.
      // For now, let's make chat output JSON for each response if --json is set.
    }

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: programOpts.json ? '' : 'You> ', // No prompt if raw JSON output
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

        // Pass programOpts to handleCliOutput
        // For chat, messageKey is 'answer'. Prefix is 'MCR> ' only if not json.
        const prefix = programOpts.json ? '' : 'MCR> ';
        handleCliOutput(response.data, programOpts, 'answer', prefix);
      } catch (error) {
        handleApiError(error, programOpts); // Pass programOpts
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
            // Output a JSON message for session termination if --json was active
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
      process.exit(0);
    });
  } catch (error) {
    if (!error.response && !error.request && !programOpts.json) {
      console.error(`An unexpected error occurred: ${error.message}`);
    } else if (!error.response && !error.request && programOpts.json) {
      console.error(
        JSON.stringify({
          error: 'chat_start_failed_unexpected',
          message: error.message,
        })
      );
    } // API errors from initial session creation are handled by apiClient
    process.exit(1);
  }
}

module.exports = (program) => {
  program
    .command('chat')
    .description('Start an interactive chat session with the MCR')
    .option(
      '-o, --ontology <file>',
      'Specify an ontology file to use for the entire chat session'
    )
    .action(startChatAsync); // Renamed
};
