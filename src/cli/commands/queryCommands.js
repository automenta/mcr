
const readline = require('readline');
const path = require('path'); // For resolving ontology file path
const { apiClient } = require('../api');
const {
  readFileContent,
  handleCliOutput,
  printJson,
} = require('../../cliUtils'); // Added printJson

async function assertFactAsync(sessionId, text, options, commandInstance) {
  const programOpts = commandInstance.parent.opts();
  const responseData = await apiClient.post(
    `/sessions/${sessionId}/assert`,
    { text },
    programOpts
  );
  // Old README for POST /sessions/:sessionId/assert
  // Response: { "addedFacts": ["...", "..."], "totalFactsInSession": N, "metadata": { "success": true } }
  handleCliOutput(responseData, programOpts, null, 'Facts asserted:\n');
}

// Helper for custom non-JSON output for query results
function displayQueryResults(responseData) {
  console.log('Query Result:');
  if (responseData.queryProlog) {
    // Field from old README
    console.log(`  Prolog Query: ${responseData.queryProlog}`);
  }
  process.stdout.write(`  Raw Result: `);
  printJson(responseData.result); // 'result' field from old README
  if (responseData.answer) {
    // 'answer' field from old README
    console.log(`  Answer: ${responseData.answer}`);
  }
  if (responseData.zeroShotLmAnswer) {
    console.log(`  Zero-shot LLM Answer: ${responseData.zeroShotLmAnswer}`);
  }
  if (responseData.debug) {
    process.stdout.write('  Debug Info: ');
    printJson(responseData.debug);
  }
}

// Interactive query mode function
async function runInteractiveQueryModeAsync(
  initialSessionId,
  queryOptions, // { style, debug }
  programOpts, // { json }
  ontologyContent // string or null
) {
  let currentSessionId = initialSessionId;
  let sessionCreatedInternally = false;

  if (!currentSessionId) {
    try {
      const sessionResponse = await apiClient.post(
        '/sessions',
        {},
        programOpts
      );
      currentSessionId = sessionResponse.sessionId; // Assuming response is { sessionId: "..." }
      sessionCreatedInternally = true;
      if (!programOpts.json) {
        console.log(
          `New session created for interactive query. Session ID: ${currentSessionId}`
        );
      } else {
        // For JSON output, we might want to log the session creation too
        printJson(
          { event: 'session_created_interactive', sessionId: currentSessionId },
          true
        );
      }
    } catch (e) {
      // apiClient already handles errors by exiting, so this catch might not be strictly needed
      // unless apiClient is changed to not exit.
      console.error(`Could not start interactive session: ${e.message}`);
      process.exit(1);
    }
  } else {
    // Verify existing session
    try {
      await apiClient.get(`/sessions/${currentSessionId}`, null, programOpts);
      if (!programOpts.json) {
        console.log(`Continuing session: ${currentSessionId}`);
      }
    } catch (e) {
      // apiClient handles exit, this is more for local console message if we change that
      console.error(
        `Error verifying session ${currentSessionId}. It may not exist or server is down.`
      );
      process.exit(1); // Ensure exit if apiClient didn't (e.g. if it's changed)
    }
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: programOpts.json ? '' : `Query (${currentSessionId})> `,
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
        options: { style: queryOptions.style, debug: queryOptions.debug },
      };
      if (ontologyContent) {
        requestBody.ontology = ontologyContent; // Dynamic RAG context
      }
      const responseData = await apiClient.post(
        `/sessions/${currentSessionId}/query`,
        requestBody,
        programOpts
      );

      if (programOpts.json) {
        handleCliOutput(responseData, programOpts);
      } else {
        displayQueryResults(responseData);
      }
    } catch (error) {
      // apiClient.post should handle errors and exit.
      // If it doesn't, or for non-API errors:
      if (!programOpts.json) {
        console.error(`Error during query: ${error.message}`);
      } else {
        printJson(
          { error: 'query_failed_interactive', message: error.message },
          true
        );
      }
    }
    if (!programOpts.json) rl.prompt();
  }).on('close', async () => {
    if (currentSessionId && sessionCreatedInternally) {
      try {
        const deleteResponse = await apiClient.delete(
          `/sessions/${currentSessionId}`,
          programOpts
        );
        if (!programOpts.json) {
          console.log(
            deleteResponse.message || `Session ${currentSessionId} terminated.`
          );
        } else {
          printJson(
            {
              event: 'session_terminated_interactive',
              sessionId: currentSessionId,
              details: deleteResponse,
            },
            true
          );
        }
      } catch (error) {
        // Error handled by apiClient.delete or local console
        if (!programOpts.json) {
          console.error(
            `Failed to terminate session ${currentSessionId}: ${error.message}`
          );
        } else {
          printJson(
            {
              event: 'session_termination_failed_interactive',
              sessionId: currentSessionId,
              error: error.message,
            },
            true
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
  commandInstance
) {
  const programOpts = commandInstance.parent.opts();
  let ontologyContent = null;

  if (options.ontology) {
    ontologyContent = readFileContent(
      options.ontology,
      'Ontology file for query context'
    );
    if (ontologyContent && !programOpts.json) {
      console.log(
        `Using ontology for query: ${path.resolve(options.ontology)}`
      );
    }
  }

  const isInteractive = !sessionIdArg || !questionArg; // Enter interactive if session OR question is missing

  if (isInteractive) {
    if (!programOpts.json) {
      console.log('Entering interactive query mode...');
      if (sessionIdArg && !questionArg)
        console.log(`Session ID for interactive mode: ${sessionIdArg}`);
    }
    await runInteractiveQueryModeAsync(
      sessionIdArg,
      options,
      programOpts,
      ontologyContent
    );
  } else {
    // Single-shot query
    const requestBody = {
      query: questionArg,
      options: { style: options.style, debug: options.debug },
    };
    if (ontologyContent) {
      requestBody.ontology = ontologyContent;
    }
    const responseData = await apiClient.post(
      `/sessions/${sessionIdArg}/query`,
      requestBody,
      programOpts
    );
    if (programOpts.json) {
      handleCliOutput(responseData, programOpts);
    } else {
      displayQueryResults(responseData);
    }
  }
}

async function explainQueryAsync(
  sessionId,
  question,
  options,
  commandInstance
) {
  const programOpts = commandInstance.parent.opts();
  // Old README for POST /sessions/:sessionId/explain-query
  // Request: { "query": "Who are Mary's grandparents?" }
  // Response: { "query": "...", "explanation": "..." }
  const responseData = await apiClient.post(
    `/sessions/${sessionId}/explain-query`,
    { query: question },
    programOpts
  );

  if (programOpts.json) {
    handleCliOutput(responseData, programOpts);
  } else {
    console.log('Query Explanation:');
    console.log(`  Query: ${responseData.query}`); // Matches old README response field
    console.log(`  Explanation: ${responseData.explanation}`); // Matches old README response field
  }
}

module.exports = (program) => {
  program
    .command('assert <sessionId> <text>')
    .description('Assert natural language facts into a session')
    .action(assertFactAsync);

  program
    .command('query [sessionId] [question]')
    .description(
      'Query a session with NL. Enters interactive mode if question is omitted, or if both sessionId and question are omitted.'
    )
    .option(
      '-s, --style <style>',
      'Answer style (e.g., conversational, formal)',
      'conversational'
    )
    .option('-d, --debug', 'Include debug information in the response')
    .option(
      '-o, --ontology <file>',
      'Path to an ontology file for dynamic query context (RAG)'
    )
    .action(querySessionAsync);

  program
    .command('explain-query <sessionId> <question>')
    .description(
      'Get an explanation for a natural language query against a session'
    )
    .action(explainQueryAsync);
};
