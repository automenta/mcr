/* eslint-disable no-console */
const readline = require('readline');
const { apiClient, API_BASE_URL, handleApiError } = require('../api'); // handleApiError for readline
const { readOntologyFile, printJson } = require('../utils');
const axios = require('axios'); // For direct use in readline to avoid double error handling

async function assertFact(sessionId, text) {
  const response = await apiClient.post(`/sessions/${sessionId}/assert`, { text });
  console.log('Facts asserted:');
  printJson(response.data);
}

async function querySession(sessionIdArg, questionArg, options) {
  let currentSessionId = sessionIdArg;
  let ontologyContent = readOntologyFile(options.ontology);

  try {
    if (!currentSessionId || !questionArg) {
      // Interactive mode
      if (!currentSessionId) {
        const sessionResponse = await apiClient.post('/sessions');
        currentSessionId = sessionResponse.data.sessionId;
        console.log(`New session created for interactive query. Session ID: ${currentSessionId}`);
      } else {
        // Verify existing session for interactive mode
        await apiClient.get(`/sessions/${currentSessionId}`);
        console.log(`Continuing session: ${currentSessionId}`);
      }

      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: 'Query> ',
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
            options: { style: options.style, debug: options.debug },
          };
          if (ontologyContent && !options.ontology) { // Use global ontology if not overridden by query
             requestBody.ontology = ontologyContent;
          } else if (options.ontology && readOntologyFile(options.ontology)) { // Per-query ontology
             requestBody.ontology = readOntologyFile(options.ontology);
          }


          // Use axios directly here to use the readline-specific error handling
          const response = await axios.post(`${API_BASE_URL}/sessions/${currentSessionId}/query`, requestBody);
          console.log('Query Result:');
          console.log(`  Prolog Query: ${response.data.queryProlog}`);
          console.log(`  Raw Result: ${JSON.stringify(response.data.result, null, 2)}`);
          console.log(`  Answer: ${response.data.answer}`);
          if (response.data.debug) {
            console.log('  Debug Info:', JSON.stringify(response.data.debug, null, 2));
          }
        } catch (error) {
          handleApiError(error); // Use the centralized API error handler
        }
        rl.prompt();
      }).on('close', async () => {
        if (currentSessionId) {
          try {
            await axios.delete(`${API_BASE_URL}/sessions/${currentSessionId}`);
            console.log(`Session ${currentSessionId} terminated.`);
          } catch (error) {
            console.error(`Failed to terminate session ${currentSessionId}:`, error.message);
          }
        }
        console.log('Exiting interactive query.');
        process.exit(0);
      });
    } else {
      // Single query mode
      const requestBody = {
        query: questionArg,
        options: { style: options.style, debug: options.debug },
      };
      if (ontologyContent) {
        requestBody.ontology = ontologyContent;
      }

      const response = await apiClient.post(`/sessions/${currentSessionId}/query`, requestBody);
      console.log('Query Result:');
      console.log(`  Prolog Query: ${response.data.queryProlog}`);
      console.log(`  Raw Result:`);
      printJson(response.data.result)
      console.log(`  Answer: ${response.data.answer}`);
      if (response.data.debug) {
        console.log('  Debug Info:');
        printJson(response.data.debug);
      }
    }
  } catch (error) {
    // This catch is for errors outside the readline loop, like initial session creation.
    // apiClient already calls handleApiError, so this might be redundant unless there are other error types.
     if (!error.response && !error.request) { // only log if not already handled by handleApiError
        console.error(`An unexpected error occurred: ${error.message}`);
        process.exit(1);
     }
  }
}

async function explainQuery(sessionId, question) {
  const response = await apiClient.post(`/sessions/${sessionId}/explain-query`, { query: question });
  console.log('Query Explanation:');
  console.log(`  Query: ${response.data.query}`);
  console.log(`  Explanation: ${response.data.explanation}`);
}

module.exports = (program) => {
  program
    .command('assert <sessionId> <text>')
    .description('Assert natural language facts into a session')
    .action(assertFact);

  const queryCmd = program.command('query [sessionId] [question]')
    .description('Query a session with a natural language question. Enters interactive mode if sessionId and question are omitted, or if only sessionId is provided.')
    .option('-s, --style <style>', 'Answer style (e.g., conversational, formal)', 'conversational')
    .option('-d, --debug', 'Include debug information in the response')
    .option('-o, --ontology <file>', 'Specify an ontology file to use for this query (overrides global ontology for this query)');

  // Add the global ontology option to the parent program so it can be accessed by query and chat
  // This might be better placed in mcr-cli.js if it's truly global for all commands that might use it
  // For now, query and chat are the main users.
  // program.option('--global-ontology <file>', 'Specify a global ontology file to use for relevant commands');
  // No, commander doesn't easily allow options of parent command to be passed to action of subcommand directly like this.
  // Instead, the global option should be on `program` and then individual commands can access `program.opts().ontology`.
  // However, the original CLI had -o as a per-command option. Let's stick to that for query and chat.

  queryCmd.action(async (sessionId, question, options) => {
    // const globalOntologyFile = program.opts().ontology; // if we had a global option
    // let effectiveOntologyFile = options.ontology || globalOntologyFile;
    // For now, query's -o is specific to it.
    await querySession(sessionId, question, options);
  });

  program
    .command('explain-query <sessionId> <question>')
    .description('Get an explanation for a natural language query')
    .action(explainQuery);
};
