const mcrService = require('../mcrService');
const ontologyService = require('../ontologyService'); // For ontology CRUD
const { demoLogger, delay, readFileContentSafe } = require('./demoUtils');
const { ApiError } = require('../errors'); // For checking specific error types

async function runFamilyOntologyDemoAsync() {
  demoLogger.heading('Family Ontology Demo');
  demoLogger.info('Goal', 'Demonstrate using a predefined ontology for complex queries and asserting additional facts.');
  let sessionId;
  const ontologyName = 'demo_family_relations';
  const ontologyFilePath = 'ontologies/family.pl'; // Relative to project root

  try {
    // LLM Provider Info logged by calling command

    // 1. Load Ontology
    demoLogger.step(`1. Loading '${ontologyName}' ontology from '${ontologyFilePath}'`);
    const ontologyRules = readFileContentSafe(ontologyFilePath, 'Family Ontology File');
    if (!ontologyRules) {
      demoLogger.error(`Demo cannot proceed without ontology file: ${ontologyFilePath}.`);
      return;
    }

    try {
      // Attempt to delete if it exists, to ensure a clean state for the demo
      // ontologyService.deleteOntology is async
      await ontologyService.deleteOntology(ontologyName);
      demoLogger.cleanup(`Attempted to delete pre-existing ontology '${ontologyName}', if it existed.`);
    } catch (e) {
      if (e instanceof ApiError && e.statusCode === 404) {
        demoLogger.info(`Info: Pre-existing ontology '${ontologyName}' not found. No deletion needed.`);
      } else {
        demoLogger.error(`Warning: Could not delete pre-existing ontology '${ontologyName}'. Proceeding with loading.`, e.message);
        if (e.stack && !(e instanceof ApiError)) console.error(e.stack); // Don't log stack for expected ApiErrors
      }
    }

    // ontologyService.createOntology is async
    const loadedOntology = await ontologyService.createOntology(ontologyName, ontologyRules);
    demoLogger.success(`Ontology '${ontologyName}' loaded successfully!`);
    demoLogger.info('Loaded Ontology Details', loadedOntology);
    await delay(500);

    // 2. Create Session
    demoLogger.step('2. Creating a new reasoning session');
    const sessionData = mcrService.createSession(); // Synchronous
    sessionId = sessionData.sessionId;
    demoLogger.success(`Session created successfully!`);
    demoLogger.info('Session ID', sessionId);
    await delay(500);

    // 3. Assert Additional Family Facts
    demoLogger.step('3. Asserting additional family facts');
    const family_facts_nl = "Arthur is the father of William. Guinevere is the mother of William. William is the father of Lancelot. Igraine is the mother of Arthur.";
    demoLogger.nl('Facts (NL)', family_facts_nl);
    const assertResult = await mcrService.assertNLToSession(sessionId, family_facts_nl); // Async
    if (!assertResult.success) {
        demoLogger.error('Failed to assert family facts', assertResult.message || assertResult.error);
        throw new Error(assertResult.message || assertResult.error || 'Family fact assertion failed');
    }
    demoLogger.logic('Added Facts (Prolog)', assertResult.addedFacts);
    demoLogger.success('Family facts asserted!');
    await delay(500);

    // 4. Query: Who is William's father?
    demoLogger.step("4. Querying: \"Who is William's father?\"");
    let query_nl = "Who is William's father?";
    demoLogger.nl('Query (NL)', query_nl);
    // Pass ontology content dynamically to ensure it's used for this query.
    // mcrService.querySessionWithNL takes dynamicOntology in its options
    let query_response = await mcrService.querySessionWithNL(sessionId, query_nl, { debug: true, dynamicOntology: ontologyRules });
    if (!query_response.success) {
        demoLogger.error("Query for William's father failed", query_response.message || query_response.error);
        throw new Error(query_response.message || query_response.error || "Query for William's father failed");
    }
    demoLogger.logic('Generated Prolog Query', query_response.debugInfo?.prologQuery);
    demoLogger.logic('Reasoner Result (Simplified)', query_response.debugInfo?.prologResults);
    demoLogger.mcrResponse('MCR Answer (NL)', query_response.answer);
    if (query_response.debugInfo) demoLogger.info('Debug Info', query_response.debugInfo);
    demoLogger.success("Query for William's father processed!");
    await delay(500);

    // 5. Query: Who is Lancelot's grandfather?
    demoLogger.step("5. Querying: \"Who is Lancelot's grandfather?\"");
    query_nl = "Who is Lancelot's grandfather?";
    demoLogger.nl('Query (NL)', query_nl);
    query_response = await mcrService.querySessionWithNL(sessionId, query_nl, { debug: true, dynamicOntology: ontologyRules });
     if (!query_response.success) {
        demoLogger.error("Query for Lancelot's grandfather failed", query_response.message || query_response.error);
        throw new Error(query_response.message || query_response.error || "Query for Lancelot's grandfather failed");
    }
    demoLogger.logic('Generated Prolog Query', query_response.debugInfo?.prologQuery);
    demoLogger.logic('Reasoner Result (Simplified)', query_response.debugInfo?.prologResults);
    demoLogger.mcrResponse('MCR Answer (NL)', query_response.answer);
    if (query_response.debugInfo) demoLogger.info('Debug Info', query_response.debugInfo);
    demoLogger.success("Query for Lancelot's grandfather processed!");
    await delay(500);

    // 6. Query: Who is Arthur's mother?
    demoLogger.step("6. Querying: \"Who is Arthur's mother?\"");
    query_nl = "Who is Arthur's mother?";
    demoLogger.nl('Query (NL)', query_nl);
    query_response = await mcrService.querySessionWithNL(sessionId, query_nl, { debug: true, dynamicOntology: ontologyRules });
    if (!query_response.success) {
        demoLogger.error("Query for Arthur's mother failed", query_response.message || query_response.error);
        throw new Error(query_response.message || query_response.error || "Query for Arthur's mother failed");
    }
    demoLogger.logic('Generated Prolog Query', query_response.debugInfo?.prologQuery);
    demoLogger.logic('Reasoner Result (Simplified)', query_response.debugInfo?.prologResults);
    demoLogger.mcrResponse('MCR Answer (NL)', query_response.answer);
    if (query_response.debugInfo) demoLogger.info('Debug Info', query_response.debugInfo);
    demoLogger.success("Query for Arthur's mother processed!");

  } catch (err) {
    const errorDetails = err.message || 'Unknown error during demo.';
    demoLogger.error("Family Ontology Demo failed prematurely.", errorDetails);
    if (err.stack && !err.message?.includes('failed')) { // Avoid double stack for known errors
        console.error(err.stack);
    }
  } finally {
    demoLogger.divider();
    if (sessionId) {
      demoLogger.step('Cleaning up: Deleting session');
      try {
        const deleteSessResp = mcrService.deleteSession(sessionId); // Synchronous
        demoLogger.cleanup(deleteSessResp.message || `Session ${sessionId} deleted.`);
      } catch (cleanupError) {
        demoLogger.error(`Failed to delete session ${sessionId}`, cleanupError.message);
        if (cleanupError.stack) console.error(cleanupError.stack);
      }
    }
    demoLogger.step(`Cleaning up: Deleting ontology '${ontologyName}'`);
    try {
      await ontologyService.deleteOntology(ontologyName); // Async
      demoLogger.cleanup(`Ontology '${ontologyName}' deleted.`);
    } catch (cleanupError) {
      if (cleanupError instanceof ApiError && cleanupError.statusCode === 404) {
         demoLogger.info(`Info: Ontology '${ontologyName}' not found during cleanup. No deletion needed.`);
      } else {
        demoLogger.error(`Failed to delete ontology '${ontologyName}' during cleanup`, cleanupError.message);
        if (cleanupError.stack && !(cleanupError instanceof ApiError)) console.error(cleanupError.stack);
      }
    }
    demoLogger.heading('Family Ontology Demo Finished');
  }
}

module.exports = { runFamilyOntologyDemoAsync };
