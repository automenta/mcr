// src/cli/tuiUtils/chatDemos.js
async function runSimpleQADemoAsync(tuiContext) {
  const {
    addMessage,
    setIsDemoRunning,
    delay,
    agentApiCreateSession,
    agentApiAssertFacts,
    agentApiQuery,
    agentApiDeleteSession,
  } = tuiContext;

  setIsDemoRunning(true);
  addMessage('system', '🚀 Starting Simple Q&A Demo...');
  await delay(500);
  let demoSessionId;
  try {
    addMessage('system', '1. Creating a new session...');
    const sessionResponse = await agentApiCreateSession();
    demoSessionId = sessionResponse.sessionId;
    addMessage('output', {
      action: 'Create Session',
      response: sessionResponse,
    });
    if (!demoSessionId) throw new Error('Failed to create session for demo.');

    addMessage('system', `2. Asserting facts into session ${demoSessionId}...`);
    const factsToAssert = 'The sky is blue. Grass is green.';
    addMessage('output', `   - "${factsToAssert}"`);
    const assertResponse = await agentApiAssertFacts(
      demoSessionId,
      factsToAssert
    );
    addMessage('output', {
      action: 'Assert Facts',
      request: { factsToAssert },
      response: assertResponse,
    });

    addMessage('system', `3. Querying session ${demoSessionId}...`);
    let question = 'What color is the sky?';
    addMessage('output', `   ❓ Question: "${question}"`);
    let queryResponse = await agentApiQuery(demoSessionId, question);
    addMessage('output', {
      action: 'Query',
      request: { question },
      response: queryResponse,
    });

    question = 'What color is the grass?';
    addMessage('output', `   ❓ Question: "${question}"`);
    queryResponse = await agentApiQuery(demoSessionId, question);
    addMessage('output', {
      action: 'Query',
      request: { question },
      response: queryResponse,
    });
  } catch (error) {
    addMessage('error', `Error during Simple Q&A Demo: ${error.message}`);
    if (error.response?.data)
      addMessage('output', { serverError: error.response.data });
  } finally {
    if (demoSessionId) {
      addMessage(
        'system',
        `4. Cleaning up: Deleting demo session ${demoSessionId}...`
      );
      try {
        const deleteResponse = await agentApiDeleteSession(demoSessionId);
        addMessage('output', {
          action: 'Delete Session',
          response: deleteResponse,
        });
      } catch (cleanupError) {
        addMessage(
          'error',
          `Failed to delete demo session ${demoSessionId}: ${cleanupError.message}`
        );
      }
    }
    addMessage('system', '🏁 Simple Q&A Demo Finished.');
    setIsDemoRunning(false);
  }
}

async function runFamilyOntologyDemoAsync(tuiContext) {
  const {
    addMessage,
    setIsDemoRunning,
    delay,
    agentApiCreateSession,
    agentApiAssertFacts,
    agentApiQuery,
    agentApiDeleteSession,
    agentApiAddOntology,
    agentApiDeleteOntology,
    readFileContentSafe,
  } = tuiContext;

  setIsDemoRunning(true);
  addMessage('system', '🚀 Starting Family Ontology Demo...');
  await delay(500);
  let demoSessionId;
  const ontologyName = 'tui_family_demo';
  const ontologyFilePath = 'ontologies/family.pl';

  try {
    addMessage(
      'system',
      `1. Adding '${ontologyName}' ontology from '${ontologyFilePath}'...`
    );
    try {
      await agentApiDeleteOntology(ontologyName, true);
    } catch {
      /* ignore */
    }
    const rules = readFileContentSafe(
      ontologyFilePath,
      addMessage,
      'Family ontology file'
    );
    if (!rules) throw new Error(`Failed to read ${ontologyFilePath} for demo.`);
    const ontologyResponse = await agentApiAddOntology(ontologyName, rules);
    addMessage('output', {
      action: 'Add Ontology',
      request: { ontologyName, filePath: ontologyFilePath },
      response: ontologyResponse,
    });

    addMessage('system', '2. Creating a new session with default ontology...');
    const sessionResponse = await agentApiCreateSession();
    demoSessionId = sessionResponse.sessionId;
    addMessage('output', {
      action: 'Create Session',
      response: sessionResponse,
    });
    if (!demoSessionId) throw new Error('Failed to create session for demo.');

    addMessage(
      'system',
      `3. Asserting family facts into session ${demoSessionId}...`
    );
    const factsToAssert =
      'father(john, mary). mother(jane, mary). father(peter, john).';
    addMessage('output', `   - "${factsToAssert}"`);
    const assertResponse = await agentApiAssertFacts(
      demoSessionId,
      factsToAssert
    );
    addMessage('output', {
      action: 'Assert Facts',
      request: { factsToAssert },
      response: assertResponse,
    });

    addMessage(
      'system',
      `4. Querying session ${demoSessionId} using family ontology...`
    );
    let question = 'Who is marys father?';
    addMessage('output', `   ❓ Question: "${question}"`);
    let queryResponse = await agentApiQuery(demoSessionId, question);
    addMessage('output', {
      action: 'Query',
      request: { question },
      response: queryResponse,
    });

    question = 'Who is marys grandparent?';
    addMessage('output', `   ❓ Question: "${question}"`);
    queryResponse = await agentApiQuery(demoSessionId, question);
    addMessage('output', {
      action: 'Query',
      request: { question },
      response: queryResponse,
    });
  } catch (error) {
    addMessage('error', `Error during Family Ontology Demo: ${error.message}`);
    if (error.response?.data)
      addMessage('output', { serverError: error.response.data });
  } finally {
    if (demoSessionId) {
      addMessage(
        'system',
        `5. Cleaning up: Deleting demo session ${demoSessionId}...`
      );
      try {
        await agentApiDeleteSession(demoSessionId);
      } catch (e) {
        addMessage('error', `Failed to delete demo session: ${e.message}`);
      }
    }
    addMessage(
      'system',
      `6. Cleaning up: Deleting ontology '${ontologyName}'...`
    );
    try {
      await agentApiDeleteOntology(ontologyName, true);
    } catch (e) {
      addMessage('error', `Failed to delete demo ontology: ${e.message}`);
    }
    addMessage('system', '🏁 Family Ontology Demo Finished.');
    setIsDemoRunning(false);
  }
}

module.exports = {
  runSimpleQADemoAsync,
  runFamilyOntologyDemoAsync,
};
