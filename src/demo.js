#!/usr/bin/env node
require('@babel/register');

const { Command } = require('commander');
const apiClient = require('./cli/api'); // Corrected: Use the CLI API client functions
const ConfigManager = require('./config');
const { isServerAliveAsync, startMcrServerAsync } = require('./cli/tuiUtils/serverManager');
const { readFileContentSafe, delay } = require('./cli/utils');
const { logger } = require('./logger'); // Use the main logger

// --- Enhanced Demo Logger ---
const demoLogger = {
  heading: (text) => console.log(`\n🚀 \x1b[1m\x1b[34m${text}\x1b[0m`), // Bold Blue
  step: (text) => console.log(`\n➡️  \x1b[1m${text}\x1b[0m`), // Bold
  info: (label, data) => console.log(`   \x1b[36m${label}:\x1b[0m ${typeof data === 'object' ? JSON.stringify(data, null, 2) : data}`), // Cyan label
  nl: (label, text) => console.log(`   🗣️ \x1b[33m${label}:\x1b[0m "${text}"`), // Yellow NL
  logic: (label, text) => console.log(`   🧠 \x1b[35m${label}:\x1b[0m ${text}`), // Magenta Logic
  mcrResponse: (label, text) => console.log(`   🤖 \x1b[32m${label}:\x1b[0m ${text}`), // Green MCR
  success: (text) => console.log(`   ✅ \x1b[32m${text}\x1b[0m`), // Green
  error: (text, details) => {
    console.error(`   ❌ \x1b[31mError: ${text}\x1b[0m`); // Red
    if (details) {
      console.error(`      \x1b[90mDetails: ${typeof details === 'object' ? JSON.stringify(details, null, 2) : details}\x1b[0m`); // Dim details
    }
  },
  cleanup: (text) => console.log(`   🧹 \x1b[90m${text}\x1b[0m`), // Dim/Gray
  divider: () => console.log('\n' + '-'.repeat(60)),
};

// --- API Client Abstraction for Demos ---
// This simplifies calls and centralizes error handling for demo purposes.
async function callApi(apiFunctionName, ...args) {
  const apiFunction = apiClient[apiFunctionName];
  if (typeof apiFunction !== 'function') {
    demoLogger.error(`API function '${apiFunctionName}' not found in apiClient.`);
    throw new Error(`API function '${apiFunctionName}' not found.`);
  }
  try {
    const response = await apiFunction(...args);
    // demoLogger.success(`API call ${apiFunctionName} successful.`);
    // demoLogger.info('Raw API Response', response);
    return response;
  } catch (err) {
    // apiClient functions (from tuiApiClientInstance) don't auto-exit like the ones using handleApiError.
    // They throw errors that we catch here.
    const errorDetails = err.response ? JSON.stringify(err.response.data, null, 2) : err.message;
    const errorStatus = err.response ? err.response.status : 'N/A';
    demoLogger.error(`API call ${apiFunctionName} failed (Status: ${errorStatus})`, errorDetails);
    throw err; // Re-throw to allow demo to stop or handle
  }
}

// --- Server Management ---
async function ensureServerRunningAsync(programOpts) {
  const config = ConfigManager.get();
  const serverUrl = `http://${config.server.host}:${config.server.port}/`;
  const healthCheckUrl = serverUrl;

  if (!(await isServerAliveAsync(healthCheckUrl, 1, 100))) {
    demoLogger.step('MCR server not detected. Attempting to start it...');
    try {
      await startMcrServerAsync(programOpts); // serverManager now uses console.log
      logger.info('MCR server process potentially started by demo. Waiting for it to initialize...');
      await delay(2500); // Increased delay slightly
      if (!(await isServerAliveAsync(healthCheckUrl, 8, 500))) { // Increased retries
        demoLogger.error('Server process was started but did not become healthy in time.');
        return false;
      }
      demoLogger.success('MCR server is now running.');
      return true;
    } catch (serverStartError) {
      demoLogger.error('Failed to start MCR server', serverStartError.message);
      console.error('Please start the MCR server manually and try running the demo again.');
      return false;
    }
  }
  demoLogger.info('MCR Server Status', 'Already running or detected.');
  return true;
}

// --- Simple Q&A Demo ---
async function runSimpleQADemoAsync() {
  demoLogger.heading('Simple Question & Answering Demo');
  demoLogger.info('Goal', 'Demonstrate basic session creation, fact assertion, and querying.');
  let sessionId;

  try {
    // 1. Create Session
    demoLogger.step('1. Creating a new reasoning session');
    const sessionData = await callApi('createSession');
    sessionId = sessionData.sessionId;
    demoLogger.success(`Session created successfully!`);
    demoLogger.info('Session ID', sessionId);
    demoLogger.info('Initial Session State', sessionData);
    await delay(500);

    // 2. Assert Facts
    demoLogger.step('2. Asserting facts into the session');
    const fact1_nl = "The sky is blue.";
    const fact2_nl = "Grass is green.";
    demoLogger.nl('Fact 1 (NL)', fact1_nl);
    let assertResponse = await callApi('assertFacts', sessionId, fact1_nl);
    demoLogger.logic('Added Facts (Prolog)', assertResponse.addedFacts);
    demoLogger.info('Total Facts in Session', assertResponse.totalFactsInSession);

    await delay(500);
    demoLogger.nl('Fact 2 (NL)', fact2_nl);
    assertResponse = await callApi('assertFacts', sessionId, fact2_nl);
    demoLogger.logic('Added Facts (Prolog)', assertResponse.addedFacts);
    demoLogger.info('Total Facts in Session', assertResponse.totalFactsInSession);
    demoLogger.success('Facts asserted successfully!');
    await delay(500);

    // 3. Query 1
    demoLogger.step('3. Querying: "What color is the sky?"');
    const query1_nl = "What color is the sky?";
    demoLogger.nl('Query (NL)', query1_nl);
    const query1_response = await callApi('query', sessionId, query1_nl, { debug: true });
    demoLogger.logic('Generated Prolog Query', query1_response.queryProlog);
    demoLogger.logic('Reasoner Result (Simplified)', query1_response.result);
    demoLogger.mcrResponse('MCR Answer (NL)', query1_response.answer);
    demoLogger.mcrResponse('Zero-shot LLM Answer (for comparison)', query1_response.zeroShotLmAnswer);
    if (query1_response.debug) demoLogger.info('Debug Info', query1_response.debug);
    demoLogger.success('Query 1 processed!');
    await delay(500);

    // 4. Query 2
    demoLogger.step('4. Querying: "Is grass green?"');
    const query2_nl = "Is grass green?";
    demoLogger.nl('Query (NL)', query2_nl);
    const query2_response = await callApi('query', sessionId, query2_nl);
    demoLogger.logic('Generated Prolog Query', query2_response.queryProlog);
    demoLogger.logic('Reasoner Result (Simplified)', query2_response.result);
    demoLogger.mcrResponse('MCR Answer (NL)', query2_response.answer);
    demoLogger.mcrResponse('Zero-shot LLM Answer (for comparison)', query2_response.zeroShotLmAnswer);
    demoLogger.success('Query 2 processed!');

  } catch (err) {
    // Error already logged by callApi
    demoLogger.error("Simple Q&A Demo failed prematurely.", "See API call error above.");
  } finally {
    if (sessionId) {
      demoLogger.divider();
      demoLogger.step('Cleaning up: Deleting session');
      try {
        await callApi('deleteSession', sessionId);
        demoLogger.cleanup(`Session ${sessionId} deleted.`);
      } catch (cleanupError) {
        demoLogger.error(`Failed to delete session ${sessionId}`, cleanupError.message);
      }
    }
    demoLogger.heading('Simple Q&A Demo Finished');
  }
}

// --- Family Ontology Demo ---
async function runFamilyOntologyDemoAsync() {
  demoLogger.heading('Family Ontology Demo');
  demoLogger.info('Goal', 'Demonstrate using a predefined ontology for complex queries and asserting additional facts.');
  let sessionId;
  const ontologyName = 'demo_family_relations';
  const ontologyFilePath = 'ontologies/family.pl'; // Standard path

  // Wrapper for demoLogger.error to match readFileContentSafe's expected callback signature
  const logFileReadError = (type, text) => { // type will be 'error' from readFileContentSafe
    demoLogger.error(text); // Pass only the main message
  };

  try {
    // 1. Load Ontology
    demoLogger.step(`1. Loading '${ontologyName}' ontology from '${ontologyFilePath}'`);
    const ontologyRules = readFileContentSafe(ontologyFilePath, logFileReadError, 'Family Ontology File');
    if (!ontologyRules) {
      // Error already logged by logFileReadError via readFileContentSafe
      demoLogger.error(`Demo cannot proceed without ontology file: ${ontologyFilePath}.`);
      return;
    }
    try { // Attempt to delete if it exists, to ensure a clean state for the demo
      await callApi('deleteOntology', ontologyName);
      demoLogger.cleanup(`Pre-existing ontology '${ontologyName}' deleted if it existed.`);
    } catch (e) { /* Ignore if not found */ }

    const loadedOntology = await callApi('addOntology', ontologyName, ontologyRules);
    demoLogger.success(`Ontology '${ontologyName}' loaded successfully!`);
    demoLogger.info('Loaded Ontology Details', loadedOntology);
    await delay(500);

    // 2. Create Session
    demoLogger.step('2. Creating a new reasoning session');
    // For this demo, we'll rely on the session using global ontologies.
    // Or, if we wanted to be specific, the query call would include the ontology content dynamically.
    // For simplicity, this demo will assume the global ontology is picked up or used in NL->Rules translation.
    const sessionData = await callApi('createSession');
    sessionId = sessionData.sessionId;
    demoLogger.success(`Session created successfully!`);
    demoLogger.info('Session ID', sessionId);
    await delay(500);

    // 3. Assert Additional Family Facts
    demoLogger.step('3. Asserting additional family facts');
    const family_facts_nl = "Arthur is the father of William. Guinevere is the mother of William. William is the father of Lancelot. Igraine is the mother of Arthur.";
    demoLogger.nl('Facts (NL)', family_facts_nl);
    const assertResponse = await callApi('assertFacts', sessionId, family_facts_nl);
    demoLogger.logic('Added Facts (Prolog)', assertResponse.addedFacts);
    demoLogger.success('Family facts asserted!');
    await delay(500);

    // 4. Query: Who is William's father? (Direct fact)
    demoLogger.step("4. Querying: \"Who is William's father?\"");
    let query_nl = "Who is William's father?";
    demoLogger.nl('Query (NL)', query_nl);
    // Pass ontology content dynamically to ensure it's used for this query.
    // This demonstrates the RAG-like capability.
    let query_response = await callApi('query', sessionId, query_nl, { debug: true }, ontologyRules);
    demoLogger.logic('Generated Prolog Query', query_response.queryProlog);
    demoLogger.logic('Reasoner Result (Simplified)', query_response.result);
    demoLogger.mcrResponse('MCR Answer (NL)', query_response.answer);
    if (query_response.debug) demoLogger.info('Debug Info', query_response.debug);
    demoLogger.success("Query for William's father processed!");
    await delay(500);

    // 5. Query: Who is Lancelot's grandfather? (Requires ontology rules + asserted facts)
    demoLogger.step("5. Querying: \"Who is Lancelot's grandfather?\"");
    query_nl = "Who is Lancelot's grandfather?";
    demoLogger.nl('Query (NL)', query_nl);
    query_response = await callApi('query', sessionId, query_nl, { debug: true }, ontologyRules);
    demoLogger.logic('Generated Prolog Query', query_response.queryProlog);
    demoLogger.logic('Reasoner Result (Simplified)', query_response.result);
    demoLogger.mcrResponse('MCR Answer (NL)', query_response.answer);
    if (query_response.debug) demoLogger.info('Debug Info', query_response.debug);
    demoLogger.success("Query for Lancelot's grandfather processed!");
    await delay(500);

    // 6. Query: Who is Arthur's mother? (Requires asserted facts)
    demoLogger.step("6. Querying: \"Who is Arthur's mother?\"");
    query_nl = "Who is Arthur's mother?";
    demoLogger.nl('Query (NL)', query_nl);
    query_response = await callApi('query', sessionId, query_nl, { debug: true }, ontologyRules);
    demoLogger.logic('Generated Prolog Query', query_response.queryProlog);
    demoLogger.logic('Reasoner Result (Simplified)', query_response.result);
    demoLogger.mcrResponse('MCR Answer (NL)', query_response.answer);
    if (query_response.debug) demoLogger.info('Debug Info', query_response.debug);
    demoLogger.success("Query for Arthur's mother processed!");


  } catch (err) {
    demoLogger.error("Family Ontology Demo failed prematurely.", "See API call error above.");
  } finally {
    demoLogger.divider();
    if (sessionId) {
      demoLogger.step('Cleaning up: Deleting session');
      try {
        await callApi('deleteSession', sessionId);
        demoLogger.cleanup(`Session ${sessionId} deleted.`);
      } catch (cleanupError) {
        demoLogger.error(`Failed to delete session ${sessionId}`, cleanupError.message);
      }
    }
    demoLogger.step(`Cleaning up: Deleting ontology '${ontologyName}'`);
    try {
      await callApi('deleteOntology', ontologyName);
      demoLogger.cleanup(`Ontology '${ontologyName}' deleted.`);
    } catch (cleanupError) {
      demoLogger.error(`Failed to delete ontology '${ontologyName}'`, cleanupError.message);
    }
    demoLogger.heading('Family Ontology Demo Finished');
  }
}


// --- CLI Setup for Demos ---
const demoProgram = new Command();

async function runDemoAction(demoName, options, command) {
  const programOpts = command.parent.optsWithGlobals(); // Get global options from main program

  // If run as `node src/demo.js demo run simpleQA --config path/to/conf`
  // then programOpts would include the --config from the immediate parent.
  // If this script is attached to mcr.js, it will inherit global options from there.

  if (!(await ensureServerRunningAsync(programOpts))) {
    process.exit(1);
  }

  demoLogger.info('Global CLI Options (for server start)', programOpts);
  demoLogger.info('Demo Specific Options', options);


  if (demoName === 'simpleQA' || demoName === 'simpleqa') {
    await runSimpleQADemoAsync();
  } else if (
    demoName === 'family' ||
    demoName === 'familyOntology' ||
    demoName === 'familyontology'
  ) {
    await runFamilyOntologyDemoAsync();
  } else {
    demoLogger.error(`Unknown demo: ${demoName}. Available: simpleQA, family`);
    console.log('\nAvailable demos are: simpleQA, family');
    process.exit(1);
  }
}

// This function will be exported and called by mcr.js
const registerDemoCommand = (mainProgram) => {
  const cmd = mainProgram.command('demo')
    .description('Run predefined MCR demos');

  cmd.command('run <demoName>')
    .description('Run a specific demo. Available: simpleQA, family')
    .action(runDemoAction); // Attach the consolidated action
};


// Standalone execution: node src/demo.js run simpleQA
if (require.main === module) {
  const standaloneProgram = new Command();
  standaloneProgram
    .version('1.0.0') // Version for standalone runner
    .description('MCR Standalone Demo Runner. Use: node src/demo.js run <demoName>')
    .option('--config <path>', 'Path to a custom MCR configuration file (for starting server if needed)');

  standaloneProgram.command('run <demoName>')
    .description('Run a specific demo. Available: simpleQA, family')
    .action(async (demoName, options, command) => {
        // command.parent.opts() should give --config if provided directly to `node src/demo.js --config ... run ...`
        // However, Commander parses options based on where they are defined.
        // For `node src/demo.js run simpleQA --config path/to/conf`, --config is an unknown option for the 'run' command.
        // It's better to make --config a global option for the standaloneProgram.
        await runDemoAction(demoName, options, command); // Pass command to access global opts via optsWithGlobals
    });

  standaloneProgram.parseAsync(process.argv).catch(err => {
    console.error("Standalone demo runner failed:", err);
    process.exit(1);
  });
}

module.exports = registerDemoCommand; // Export the registration function for mcr.js
