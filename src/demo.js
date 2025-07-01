#!/usr/bin/env node
require('@babel/register');

const { Command } = require('commander');
// const apiClient = require('./cli/api'); // Removed
const ConfigManager = require('./config');
const mcrCore = require('./mcrCore'); // Added
// const { isServerAliveAsync, startMcrServerAsync } = require('./cli/tuiUtils/serverManager'); // Removed
const { readFileContent, delay } = require('./cli/utils'); // Changed readFileContentSafe to readFileContent
const { logger } = require('./logger'); // Use the main logger
// ApiError will be needed for specific error checking if mcrCore throws them
const ApiError = require('./errors');

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

// Removed callApi and ensureServerRunningAsync functions

// --- Simple Q&A Demo ---
async function runSimpleQADemoAsync() {
  demoLogger.heading('Simple Question & Answering Demo');
  demoLogger.info('Goal', 'Demonstrate basic session creation, fact assertion, and querying.');
  let sessionId;

  try {
    // LLM Provider Info is logged during mcrCore.init by runDemoAction

    // 1. Create Session
    demoLogger.step('1. Creating a new reasoning session');
    const sessionData = mcrCore.createSession(); // Direct call
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
    let assertResponse = await mcrCore.assertFacts(sessionId, fact1_nl); // Direct call
    demoLogger.logic('Added Facts (Prolog)', assertResponse.addedFacts);
    demoLogger.info('Total Facts in Session', assertResponse.totalFactsInSession);

    await delay(500);
    demoLogger.nl('Fact 2 (NL)', fact2_nl);
    assertResponse = await mcrCore.assertFacts(sessionId, fact2_nl); // Direct call
    demoLogger.logic('Added Facts (Prolog)', assertResponse.addedFacts);
    demoLogger.info('Total Facts in Session', assertResponse.totalFactsInSession);
    demoLogger.success('Facts asserted successfully!');
    await delay(500);

    // 3. Query 1
    demoLogger.step('3. Querying: "What color is the sky?"');
    const query1_nl = "What color is the sky?";
    demoLogger.nl('Query (NL)', query1_nl);
    const query1_response = await mcrCore.query(sessionId, query1_nl, { debug: true }); // Direct call
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
    // Example of query without debug, options is an optional param for mcrCore.query
    const query2_response = await mcrCore.query(sessionId, query2_nl); // Direct call
    demoLogger.logic('Generated Prolog Query', query2_response.queryProlog);
    demoLogger.logic('Reasoner Result (Simplified)', query2_response.result);
    demoLogger.mcrResponse('MCR Answer (NL)', query2_response.answer);
    demoLogger.mcrResponse('Zero-shot LLM Answer (for comparison)', query2_response.zeroShotLmAnswer);
    demoLogger.success('Query 2 processed!');

  } catch (err) {
    // Catch errors from mcrCore calls
    const errorDetails = err.response ? JSON.stringify(err.response.data, null, 2) : err.message;
    demoLogger.error("Simple Q&A Demo failed prematurely.", errorDetails);
    if (err.stack) console.error(err.stack);
  } finally {
    if (sessionId) {
      demoLogger.divider();
      demoLogger.step('Cleaning up: Deleting session');
      try {
        mcrCore.deleteSession(sessionId); // Direct call
        demoLogger.cleanup(`Session ${sessionId} deleted.`);
      } catch (cleanupError) {
        demoLogger.error(`Failed to delete session ${sessionId}`, cleanupError.message);
        if (cleanupError.stack) console.error(cleanupError.stack);
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

  try {
    // LLM Provider Info is logged during mcrCore.init by runDemoAction

    // 1. Load Ontology
    demoLogger.step(`1. Loading '${ontologyName}' ontology from '${ontologyFilePath}'`);
    // readFileContent will exit on error, so no need for logFileReadError or explicit null check for demo.
    const ontologyRules = readFileContent(ontologyFilePath, 'Family Ontology File');
    // if (!ontologyRules) { // This check is no longer needed as readFileContent exits on failure
    //   demoLogger.error(`Demo cannot proceed without ontology file: ${ontologyFilePath}.`);
    //   return;
    // }

    try { // Attempt to delete if it exists, to ensure a clean state for the demo
      // mcrCore.deleteOntology is synchronous based on SessionManager.deleteOntology
      mcrCore.deleteOntology(ontologyName);
      demoLogger.cleanup(`Attempted to delete pre-existing ontology '${ontologyName}', if it existed.`);
    } catch (e) {
      // Check if the error is a 404 (Not Found) from ApiError
      if (e instanceof ApiError && e.statusCode === 404) {
        demoLogger.info(`Info: Pre-existing ontology '${ontologyName}' not found. No deletion needed.`);
      } else {
        demoLogger.error(`Warning: Could not delete pre-existing ontology '${ontologyName}'. Proceeding with loading.`, e.message);
        if (e.stack) console.error(e.stack);
      }
    }

    // mcrCore.addOntology is synchronous based on SessionManager.addOntology
    const loadedOntology = mcrCore.addOntology(ontologyName, ontologyRules);
    demoLogger.success(`Ontology '${ontologyName}' loaded successfully!`);
    demoLogger.info('Loaded Ontology Details', loadedOntology);
    await delay(500);

    // 2. Create Session
    demoLogger.step('2. Creating a new reasoning session');
    const sessionData = mcrCore.createSession(); // Direct call
    sessionId = sessionData.sessionId;
    demoLogger.success(`Session created successfully!`);
    demoLogger.info('Session ID', sessionId);
    await delay(500);

    // 3. Assert Additional Family Facts
    demoLogger.step('3. Asserting additional family facts');
    const family_facts_nl = "Arthur is the father of William. Guinevere is the mother of William. William is the father of Lancelot. Igraine is the mother of Arthur.";
    demoLogger.nl('Facts (NL)', family_facts_nl);
    const assertResponse = await mcrCore.assertFacts(sessionId, family_facts_nl); // Direct call
    demoLogger.logic('Added Facts (Prolog)', assertResponse.addedFacts);
    demoLogger.success('Family facts asserted!');
    await delay(500);

    // 4. Query: Who is William's father? (Direct fact)
    demoLogger.step("4. Querying: \"Who is William's father?\"");
    let query_nl = "Who is William's father?";
    demoLogger.nl('Query (NL)', query_nl);
    // Pass ontology content dynamically to ensure it's used for this query.
    let query_response = await mcrCore.query(sessionId, query_nl, { debug: true }, ontologyRules); // Direct call
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
    query_response = await mcrCore.query(sessionId, query_nl, { debug: true }, ontologyRules); // Direct call
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
    query_response = await mcrCore.query(sessionId, query_nl, { debug: true }, ontologyRules); // Direct call
    demoLogger.logic('Generated Prolog Query', query_response.queryProlog);
    demoLogger.logic('Reasoner Result (Simplified)', query_response.result);
    demoLogger.mcrResponse('MCR Answer (NL)', query_response.answer);
    if (query_response.debug) demoLogger.info('Debug Info', query_response.debug);
    demoLogger.success("Query for Arthur's mother processed!");

  } catch (err) {
    const errorDetails = err.response ? JSON.stringify(err.response.data, null, 2) : err.message;
    demoLogger.error("Family Ontology Demo failed prematurely.", errorDetails);
    if (err.stack) console.error(err.stack);
  } finally {
    demoLogger.divider();
    if (sessionId) {
      demoLogger.step('Cleaning up: Deleting session');
      try {
        mcrCore.deleteSession(sessionId); // Direct call
        demoLogger.cleanup(`Session ${sessionId} deleted.`);
      } catch (cleanupError) {
        demoLogger.error(`Failed to delete session ${sessionId}`, cleanupError.message);
        if (cleanupError.stack) console.error(cleanupError.stack);
      }
    }
    demoLogger.step(`Cleaning up: Deleting ontology '${ontologyName}'`);
    try {
      mcrCore.deleteOntology(ontologyName); // Direct call
      demoLogger.cleanup(`Ontology '${ontologyName}' deleted.`);
    } catch (cleanupError) {
      // Log specific 404 for ontology deletion if it's not found during cleanup, otherwise general error
      if (cleanupError instanceof ApiError && cleanupError.statusCode === 404) {
         demoLogger.info(`Info: Ontology '${ontologyName}' not found during cleanup. No deletion needed.`);
      } else {
        demoLogger.error(`Failed to delete ontology '${ontologyName}' during cleanup`, cleanupError.message);
        if (cleanupError.stack) console.error(cleanupError.stack);
      }
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

  // Initialize MCR Core for the demo
  demoLogger.step('Initializing MCR Core for Demo...');
  const config = ConfigManager.get({ exitOnFailure: true }); // Ensure demo exits if config is bad

  // Temporarily adjust log level for cleaner demo output
  const originalLogLevel = config.logging.level;
  config.logging.level = 'warn'; // Suppress info and debug logs from core services during demo

  // The global logger instance should pick up any level changes from config passed to mcrCore.init.
  // mcrCore.init will log details about LLM provider.
  try {
    await mcrCore.init(config); // Pass modified config
    // Log active LLM provider and model using mcrCore getters
    if (mcrCore.LlmService) { // Check if LlmService was successfully set in mcrCore
        const providerName = mcrCore.LlmService.getActiveProviderName();
        const modelName = mcrCore.LlmService.getActiveModelName();
        demoLogger.success('MCR Core Initialized successfully.');
        demoLogger.info('LLM Used', `Provider: ${providerName}, Model: ${modelName || 'N/A (Check Config)'}`);
    } else {
        // This case should ideally be caught by mcrCore.init() throwing an error
        demoLogger.error('MCR Core initialized, but LlmService is not available. Cannot determine LLM info.');
    }
  } catch (initError) {
    // Restore log level in case of init error before exiting
    config.logging.level = originalLogLevel;
    // If mcrCore.init reconfigures the global logger directly, we might need to reconfigure it back here.
    // Assuming mcrCore.init uses the passed config for its own logger instances or a temporary global change.
    // For safety, if reconfigureLogger is accessible and affects the global logger:
    // const { reconfigureLogger: reconfigureGlobalLogger } = require('./logger');
    // reconfigureGlobalLogger(config); // This would set it back globally if needed.
    // However, the current `reconfigureLogger` in `logger.js` updates the shared `logger` instance.
    // So, the change to `config.logging.level` and subsequent `mcrCore.init(config)`
    // (which calls `reconfigureLogger` internally or its equivalent) will affect the global logger.
    // We MUST restore it in a finally block.

    demoLogger.error('MCR Core Initialization Failed. Demo cannot run.', initError.message);
    if (initError.stack) {
        console.error(initError.stack);
    }
    process.exit(1);
  } finally {
    // Restore the original log level for the global logger
    // This is crucial because mcrCore.init(config) would have called reconfigureLogger,
    // affecting the global logger instance.
    if (originalLogLevel) {
      const currentGlobalConfig = ConfigManager.get(); // Get current global config state
      currentGlobalConfig.logging.level = originalLogLevel; // Set the desired original level

      const { logger: globalLoggerInstance, reconfigureLogger: reconfigureGlobalLogger } = require('./logger');

      // Log *before* changing, if current level permits
      globalLoggerInstance.info(`Attempting to restore global log level to: ${originalLogLevel} (from demo)`);

      reconfigureGlobalLogger(currentGlobalConfig); // Apply the restoration

      // Log *after* changing to confirm, if the new (original) level permits
      // This message will only show if originalLogLevel is 'info' or 'debug'
      globalLoggerInstance.info(`Global log level now restored to: ${currentGlobalConfig.logging.level} (from demo)`);
    }
  }

  // demoLogger.info('Global CLI Options (potentially for server start, now unused by demo itself)', programOpts);
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
