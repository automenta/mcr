/* eslint-disable no-console */
const readline = require('readline');
const { apiClient } = require('../api'); // Removed API_BASE_URL, handleApiError
const { readOntologyFile, handleCliOutput, printJson } = require('../utils');
// Removed axios

async function assertFactAsync(sessionId, text, options, commandInstance) {
  const programOpts = commandInstance.parent.opts();
  const response = await apiClient.post(`/sessions/${sessionId}/assert`, {
    text,
  });
  handleCliOutput(response.data, programOpts, null, 'Facts asserted:\n');
}

async function runInteractiveQueryModeAsync(
  initialSessionId,
  options,
  programOpts,
  ontologyContent,
  handleResponseCliFn
) {
  let currentSessionId = initialSessionId;

  if (!currentSessionId) {
    const sessionResponse = await apiClient.post('/sessions');
    currentSessionId = sessionResponse.data.sessionId;
    if (!programOpts.json) {
      console.log(
        `New session created for interactive query. Session ID: ${currentSessionId}`
      );
    }
  } else {
    try {
      await apiClient.get(`/sessions/${currentSessionId}`);
      if (!programOpts.json) {
        console.log(`Continuing session: ${currentSessionId}`);
      }
    } catch {
      // Removed unused 'error'
      console.error(
        `Error verifying session ${currentSessionId}. Please check the session ID and server.`
      );
      process.exit(1);
    }
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: programOpts.json ? '' : 'Query> ',
  });

  if (!programOpts.json) rl.prompt();

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
      if (!programOpts.json) rl.prompt();
      return;
    }

    try {
      const requestBody = {
        query: questionInput,
        options: { style: options.style, debug: options.debug },
      };
      if (ontologyContent) {
        requestBody.ontology = ontologyContent;
      }
      const response = await apiClient.post(
        `/sessions/${currentSessionId}/query`,
        requestBody
      );
      handleResponseCliFn(response);
    } catch (error) {
      if (!error.response && !programOpts.json) {
        console.error(`Error during query: ${error.message}`);
      } else if (!error.response && programOpts.json) {
        console.error(
          JSON.stringify({ error: 'query_failed', message: error.message })
        );
      }
    }
    if (!programOpts.json) rl.prompt();
  }).on('close', async () => {
    if (currentSessionId) {
      try {
        const deleteResponse = await apiClient.delete(
          `/sessions/${currentSessionId}`
        );
        if (!programOpts.json) {
          console.log(
            deleteResponse.data.message ||
              `Session ${currentSessionId} terminated.`
          );
        } else {
          console.log(
            JSON.stringify({
              action: 'session_terminated_interactive_query',
              sessionId: currentSessionId,
              details: deleteResponse.data,
            })
          );
        }
      } catch (error) {
        if (!programOpts.json) {
          console.error(
            `Failed to terminate session ${currentSessionId} during cleanup: ${error.message}`
          );
        } else {
          console.error(
            JSON.stringify({
              action: 'session_termination_failed_interactive_query',
              sessionId: currentSessionId,
              error: error.message,
            })
          );
        }
      }
    }
    if (!programOpts.json) {
      console.log('Exiting interactive query.');
    }
    process.exit(0);
  });
}

async function querySessionAsync(
  sessionIdArg,
  questionArg,
  options,
  programOpts
) {
  const currentSessionId = sessionIdArg;
  let ontologyContent = null;
  if (options.ontology) {
    ontologyContent = readOntologyFile(options.ontology);
    if (ontologyContent && !programOpts.json) {
      console.log(`Using ontology for query: ${options.ontology}`);
    }
  }

  function handleResponseCli(response) {
    if (programOpts.json) {
      handleCliOutput(response.data, programOpts);
    } else {
      handleResponse(response);
    }
  }

  function handleResponse(response) {
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

  try {
    const isInteractive = !sessionIdArg || !questionArg;

    if (isInteractive) {
      await runInteractiveQueryModeAsync(
        currentSessionId,
        options,
        programOpts,
        ontologyContent,
        handleResponseCli
      );
    } else {
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
      handleResponseCli(response);
    }
  } catch (error) {
    if (!error.response && !error.request && !programOpts.json) {
      console.error(`An unexpected error occurred: ${error.message}`);
    } else if (!error.response && !error.request && programOpts.json) {
      console.error(
        JSON.stringify({ error: 'unexpected_error', message: error.message })
      );
    }
    process.exit(1);
  }
}

async function explainQueryAsync(
  sessionId,
  question,
  options,
  commandInstance
) {
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
    .action(assertFactAsync);

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
    const programOpts = command.parent.opts();
    await querySessionAsync(sessionId, question, options, programOpts);
  });

  program
    .command('explain-query <sessionId> <question>')
    .description('Get an explanation for a natural language query')
    .action(explainQueryAsync);
};
