/* eslint-disable no-console */
const readline = require('readline');
const { apiClient, API_BASE_URL, handleApiError } = require('../api'); // handleApiError for readline
const { readOntologyFile } = require('../utils');
const axios = require('axios'); // For direct use in readline

async function startChat(options) {
  let sessionId = null;
  let ontologyContent = readOntologyFile(options.ontology); // Read once at the start

  try {
    const sessionResponse = await apiClient.post('/sessions');
    sessionId = sessionResponse.data.sessionId;
    console.log(`New chat session started. Session ID: ${sessionId}`);
    if (ontologyContent) {
        console.log(`Using ontology for this session: ${options.ontology}`);
    }

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: 'You> ',
    });

    rl.prompt();

    rl.on('line', async (line) => {
      const question = line.trim();
      if (question.toLowerCase() === 'exit' || question.toLowerCase() === 'quit') {
        rl.close();
        return;
      }
      if (!question) {
        rl.prompt();
        return;
      }

      try {
        const requestBody = {
          query: question,
          options: { style: 'conversational' }, // Chat is always conversational
        };
        if (ontologyContent) {
          requestBody.ontology = ontologyContent; // Add ontology to every query in the chat session
        }

        // Use axios directly here for readline-specific error handling
        const response = await axios.post(`${API_BASE_URL}/sessions/${sessionId}/query`, requestBody);
        console.log(`MCR> ${response.data.answer}`);
      } catch (error) {
        handleApiError(error); // Use the centralized API error handler
      }
      rl.prompt();
    }).on('close', async () => {
      if (sessionId) {
        try {
          await axios.delete(`${API_BASE_URL}/sessions/${sessionId}`);
          console.log(`Session ${sessionId} terminated.`);
        } catch (error) {
          // Log simple message, as handleApiError would exit the process
          console.error(`Failed to terminate session ${sessionId}: ${error.message}`);
        }
      }
      console.log('Exiting chat.');
      process.exit(0);
    });
  } catch (error) {
    // This catch is for errors outside the readline loop, e.g., initial session creation.
    // apiClient calls handleApiError, which exits. If it's another type of error:
     if (!error.response && !error.request) {
        console.error(`An unexpected error occurred: ${error.message}`);
        process.exit(1);
     }
  }
}

module.exports = (program) => {
  program
    .command('chat')
    .description('Start an interactive chat session with the MCR')
    .option('-o, --ontology <file>', 'Specify an ontology file to use for the entire chat session')
    .action(startChat);
};
