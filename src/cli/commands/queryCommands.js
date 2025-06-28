/* eslint-disable no-console */
const readline = require('readline');
const { apiClient, API_BASE_URL, handleApiError } = require('../api');
const { readOntologyFile, handleCliOutput, printJson } = require('../utils'); // Added handleCliOutput
const axios = require('axios');

// Action signature: (arg1, ..., options, commandInstance)
async function assertFact(sessionId, text, options, commandInstance) {
  const programOpts = commandInstance.parent.opts();
  const response = await apiClient.post(`/sessions/${sessionId}/assert`, {
    text,
  });
  handleCliOutput(response.data, programOpts, null, 'Facts asserted:\n');
}

// querySession is called by an action. It needs programOpts.
async function querySession(sessionIdArg, questionArg, options, programOpts) {
  let currentSessionId = sessionIdArg;
  let ontologyContent = null;
  if (options.ontology) {
    ontologyContent = readOntologyFile(options.ontology);
    if (ontologyContent && !programOpts.json) {
      console.log(`Using ontology for query: ${options.ontology}`);
    }
  }

  try {
    const isInteractive = !sessionIdArg || !questionArg;

    if (isInteractive) {
      if (!currentSessionId) {
        const sessionResponse = await apiClient.post('/sessions');
        currentSessionId = sessionResponse.data.sessionId;
        if (!programOpts.json) {
          console.log(
            `New session created for interactive query. Session ID: ${currentSessionId}`
          );
        }
      } else {
        await apiClient.get(`/sessions/${currentSessionId}`); // Verify session
        if (!programOpts.json) {
          console.log(`Continuing session: ${currentSessionId}`);
        }
      }

      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: programOpts.json ? '' : 'Query> ', // Conditional prompt
      });

      if (!programOpts.json) rl.prompt(); // Only prompt if not in JSON mode

      rl.on('line', async (line) => {
        const questionInput = line.trim();
        if (
          questionInput.toLowerCase() === 'exit' ||
          questionInput.toLowerCase() === 'quit'
        ) {
          rl.close();
          return;
        }
        if (!questionInput) {
          rl.prompt();
          return;
        }

        try {
          const requestBody = {
            query: questionInput,
            options: { style: options.style, debug: options.debug },
          };
          // For interactive, ontologyContent is loaded once initially.
          // If options.ontology was provided to the initial 'query' command.
          if (ontologyContent) {
            requestBody.ontology = ontologyContent;
          }

          const response = await axios.post(
            `${API_BASE_URL}/sessions/${currentSessionId}/query`,
            requestBody
          );

          if (programOpts.json) {
            handleCliOutput(response.data, programOpts);
          } else {
            console.log('Query Result:');
            console.log(`  Prolog Query: ${response.data.queryProlog}`);
            process.stdout.write(`  Raw Result: `); // printJson adds newline, so use process.stdout.write for prefix
            printJson(response.data.result); // Pretty print if not raw json
            console.log(`  Answer: ${response.data.answer}`);
            if (response.data.debug) {
              process.stdout.write('  Debug Info: ');
              printJson(response.data.debug);
            }
          }
        } catch (error) {
          handleApiError(error, programOpts); // Pass programOpts
        }
        if (!programOpts.json) rl.prompt();
      }).on('close', async () => {
        if (currentSessionId) {
          try {
            // For CLI cleanup, don't use programOpts.json for output, always show termination message.
            const deleteResponse = await axios.delete(
              `${API_BASE_URL}/sessions/${currentSessionId}`
            );
            if (!programOpts.json) {
              console.log(
                deleteResponse.data.message ||
                  `Session ${currentSessionId} terminated.`
              );
            } else {
              // if --json, the main query output was JSON. This is just a side-effect log.
              // Keep it simple or suppress for pure JSON output of the query itself.
              // For now, let's still log it simply.
              console.log(
                JSON.stringify({
                  action: 'session_terminated',
                  sessionId: currentSessionId,
                  details: deleteResponse.data,
                })
              );
            }
          } catch (error) {
            console.error(
              `Failed to terminate session ${currentSessionId}:`,
              error.message
            );
          }
        }
        if (!programOpts.json) {
          console.log('Exiting interactive query.');
        }
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

      const response = await apiClient.post(
        `/sessions/${currentSessionId}/query`,
        requestBody
      );
      if (programOpts.json) {
        handleCliOutput(response.data, programOpts);
      } else {
        console.log('Query Result:');
        console.log(`  Prolog Query: ${response.data.queryProlog}`);
        process.stdout.write(`  Raw Result: `);
        printJson(response.data.result);
        console.log(`  Answer: ${response.data.answer}`);
        if (response.data.debug) {
          process.stdout.write('  Debug Info: ');
          printJson(response.data.debug);
        }
      }
    }
  } catch (error) {
    if (!error.response && !error.request && !programOpts.json) {
      console.error(`An unexpected error occurred: ${error.message}`);
    } else if (!error.response && !error.request && programOpts.json) {
      console.error(
        JSON.stringify({ error: 'unexpected_error', message: error.message })
      );
    } // API errors are handled by apiClient's interceptor which calls handleApiError (exits)
    process.exit(1);
  }
}

// Action signature: (arg1, ..., options, commandInstance)
async function explainQuery(sessionId, question, options, commandInstance) {
  const programOpts = commandInstance.parent.opts();
  const response = await apiClient.post(
    `/sessions/${sessionId}/explain-query`,
    { query: question }
  );
  if (programOpts.json) {
    handleCliOutput(response.data, programOpts);
  } else {
    console.log('Query Explanation:');
    console.log(`  Query: ${response.data.query}`);
    console.log(`  Explanation: ${response.data.explanation}`);
  }
}

module.exports = (program) => {
  program
    .command('assert <sessionId> <text>')
    .description('Assert natural language facts into a session')
    .action(assertFact);

  const queryCmd = program
    .command('query [sessionId] [question]')
    .description(
      'Query a session with a natural language question. Enters interactive mode if sessionId and question are omitted, or if only sessionId is provided.'
    )
    .option(
      '-s, --style <style>',
      'Answer style (e.g., conversational, formal)',
      'conversational'
    )
    .option('-d, --debug', 'Include debug information in the response')
    .option(
      '-o, --ontology <file>',
      'Specify an ontology file to use for this query.'
    );

  queryCmd.action(async (sessionId, question, options, command) => {
    // command is the 'query' command instance. Its parent is the main 'program'.
    const programOpts = command.parent.opts();
    await querySession(sessionId, question, options, programOpts);
  });

  program
    .command('explain-query <sessionId> <question>')
    .description('Get an explanation for a natural language query')
    .action(explainQuery);
};
