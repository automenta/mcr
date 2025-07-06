// new/demo.js
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
const logger = require('./src/logger'); // Using the same logger
const { demoLogger } = require('./src/demos/demoUtils');
const { checkAndStartServer } = require('./src/cliUtils');
const config = require('./src/config');

const API_BASE_URL = `http://${config.server.host}:${config.server.port}/api/v1`;

// Base class for all demos
class Example {
  constructor(apiBaseUrl, globalLogger, demoUtilsLogger) {
    this.apiBaseUrl = apiBaseUrl;
    this.logger = globalLogger; // for general script logging
    this.dLog = demoUtilsLogger; // for colorful demo step logging
    this.sessionId = null;
  }

  getName() {
    throw new Error("Method 'getName()' must be implemented.");
  }

  getDescription() {
    throw new Error("Method 'getDescription()' must be implemented.");
  }

  async run() {
    throw new Error("Method 'run()' must be implemented.");
  }

  async createSession() {
    this.dLog.step('Creating a new session...');
    try {
      // Dynamically import axios only when needed
      const axios = (await import('axios')).default;

      const sessionPayload = {};
      if (this.strategyToUse) { // strategyToUse will be set on the instance
        sessionPayload.strategy = this.strategyToUse;
        this.dLog.info(`Requesting session with strategy`, this.strategyToUse);
      }

      const createResponse = await axios.post(
        `${this.apiBaseUrl}/sessions`,
        sessionPayload, // Send payload which might include strategy
        { timeout: 30000 } // 30 second timeout
      );
      this.sessionId = createResponse.data.id;
      if (createResponse.data.activeStrategy) {
        this.dLog.info('Session confirmed with active strategy', createResponse.data.activeStrategy);
      }
      this.dLog.success(`Session created successfully. ID: ${this.sessionId}`);
      this.logger.info(
        `[${this.getName()}] Session created: ${this.sessionId}`
      );
      return this.sessionId;
    } catch (error) {
      this.handleApiError(error, 'Failed to create session');
      throw error; // Re-throw to stop the demo if session creation fails
    }
  }

  async assertFact(fact, type = 'text') { // Added type parameter, defaults to 'text'
    const isProlog = type === 'prolog';
    const logMessage = isProlog ? 'Asserting Prolog code' : 'Asserting fact';
    // For Prolog, log only a snippet as it can be very long
    const factSnippet = isProlog ? fact.substring(0, 200) + (fact.length > 200 ? '...' : '') : fact;
    this.dLog.info(logMessage, factSnippet);

    try {
      const axios = (await import('axios')).default;
      // Always use the 'text' property for the fact, regardless of type.
      // The 'type' or 'isProlog' can be used for logging or other client-side logic if needed.
      const payload = { text: fact };
      const assertResponse = await axios.post(
        `${this.apiBaseUrl}/sessions/${this.sessionId}/assert`,
        payload,
        // Increased timeout for potentially large ontologies, though direct Prolog should be fast.
        // The original timeout was likely due to LLM involvement.
        { timeout: isProlog ? 60000 : 30000 }
      );
      this.dLog.mcrResponse(`Server`, assertResponse.data.message);
      if (
        assertResponse.data.addedFacts &&
        assertResponse.data.addedFacts.length > 0
      ) {
        assertResponse.data.addedFacts.forEach((f) =>
          this.dLog.logic(`Added to KB`, f)
        );
      }
      this.logger.info(
        `[${this.getName()}] Asserted: "${fact}", Server response: ${assertResponse.data.message}`
      );
      return assertResponse.data;
    } catch (error) {
      this.handleApiError(error, `Failed to assert fact: "${fact}"`);
      return null; // Allow demo to continue if possible
    }
  }

  async query(question) {
    this.dLog.info(`Querying`, question);
    try {
      const axios = (await import('axios')).default;
      const queryResponse = await axios.post(
        `${this.apiBaseUrl}/sessions/${this.sessionId}/query`,
        { query: question },
        { timeout: 30000 } // 30 second timeout
      );
      this.dLog.mcrResponse(`MCR Answer`, queryResponse.data.answer);
      this.logger.info(
        `[${this.getName()}] Question: "${question}", Answer: "${queryResponse.data.answer}"`
      );

      // Display KB query and results if available in debugInfo
      if (queryResponse.data.debugInfo) {
        this.logger.debug( // Keep detailed debug log for file
          `[${this.getName()}] Query Debug Info:`,
          queryResponse.data.debugInfo
        );
        if (queryResponse.data.debugInfo.prologQuery) {
          this.dLog.logic('Prolog Query Sent to KB', queryResponse.data.debugInfo.prologQuery);
        }
        if (queryResponse.data.debugInfo.kbResults && queryResponse.data.debugInfo.kbResults.length > 0) {
          this.dLog.logic('Raw KB Results', queryResponse.data.debugInfo.kbResults.join('; '));
        } else if (queryResponse.data.debugInfo.kbResults) { // if kbResults exists but might be empty
          this.dLog.logic('Raw KB Results', '(empty or no solution from KB)');
        }
      }
      return queryResponse.data;
    } catch (error) {
      this.handleApiError(error, `Failed to query: "${question}"`);
      return null; // Allow demo to continue
    }
  }

  async cleanupSession() {
    if (this.sessionId) {
      this.dLog.cleanup(`Deleting session ${this.sessionId}...`);
      try {
        const axios = (await import('axios')).default;
        await axios.delete(`${this.apiBaseUrl}/sessions/${this.sessionId}`, {
          timeout: 30000, // 30 second timeout
        });
        this.dLog.success(`Session ${this.sessionId} deleted successfully.`);
        this.logger.info(
          `[${this.getName()}] Session deleted: ${this.sessionId}`
        );
      } catch (error) {
        this.handleApiError(error, 'Failed to delete session');
      }
    }
  }

  handleApiError(error, message) {
    this.dLog.error(message, error.message);
    if (error.response) {
      this.dLog.error(
        `API Error Status`,
        error.response.status
      );
      this.dLog.error(
        `API Error Data`,
        error.response.data
      );
      this.logger.error(`[${this.getName()}] ${message} - API Error:`, {
        status: error.response.status,
        data: error.response.data,
        originalError: error.message,
      });
    } else {
      this.logger.error(
        `[${this.getName()}] ${message} - Error:`,
        error.message
      );
    }
  }

  async assertCondition(condition, successMessage, failureMessage) {
    if (condition) {
      this.dLog.success(`Assertion PASSED: ${successMessage}`);
      // this.logger.info(`[${this.getName()}] Assertion PASSED: ${successMessage}`); // Removed for console clarity
    } else {
      this.dLog.error(`Assertion FAILED: ${failureMessage}`);
      this.logger.error(`[${this.getName()}] Assertion FAILED: ${failureMessage}`); // Keep error in main log
    }
  }

  async printKnowledgeBase() {
    if (!this.sessionId) {
      this.dLog.warn('No session ID available, cannot print knowledge base.');
      return;
    }
    this.dLog.step('Fetching current knowledge base...');
    try {
      const axios = (await import('axios')).default;
      const response = await axios.get(`${this.apiBaseUrl}/sessions/${this.sessionId}`);
      const sessionData = response.data;
      if (sessionData && sessionData.facts) {
        this.dLog.heading(`Knowledge Base for Session ${this.sessionId}:`);
        if (sessionData.facts.length > 0) {
          // Use console.log directly for multiline raw output, dLog might prefix each line.
          console.log(chalk.magenta(sessionData.facts.join('\n')));
        } else {
          this.dLog.info('KB Status', '(empty)');
        }
      } else {
        this.dLog.warn('Could not retrieve facts from session data.');
      }
    } catch (error) {
      this.handleApiError(error, 'Failed to fetch knowledge base for printing');
    }
  }
}

// Function to discover examples
function loadExamples() {
  const exampleBlueprints = {}; // Stores { key: { Class, defaultInstance (for info) } }
  const demosDir = path.join(__dirname, 'src', 'demos');
  const files = fs.readdirSync(demosDir);

  files.forEach((file) => {
    if (file.endsWith('Demo.js') && file !== 'demoUtils.js') {
      const exampleName = path.basename(file, '.js');
      try {
        const LoadedClass = require(path.join(demosDir, file));
        let ExampleClassToUse = null;

        if (typeof LoadedClass === 'function' && LoadedClass.prototype instanceof Example) {
          ExampleClassToUse = LoadedClass;
        } else if (typeof LoadedClass.default === 'function' && LoadedClass.default.prototype instanceof Example) {
          ExampleClassToUse = LoadedClass.default;
        }

        if (ExampleClassToUse) {
          // Create a temporary instance just to get name/description for listing
          const tempInstance = new ExampleClassToUse(API_BASE_URL, logger, demoLogger);
          const key = tempInstance.getName().toLowerCase().replace(/\s+/g, '-');
          exampleBlueprints[key] = { Class: ExampleClassToUse, defaultInstance: tempInstance };
        }
      } catch (err) {
        console.error(chalk.red(`Error loading demo blueprint ${exampleName}: ${err.message}`));
        logger.error(`Failed to load demo blueprint ${exampleName}: ${err.stack}`);
      }
    }
  });
  return exampleBlueprints;
}


async function main() {
  const exampleBlueprints = loadExamples();

  const argv = yargs(hideBin(process.argv))
    .command('$0 [exampleName]', 'Run a specific MCR demo example', (y) => {
      y.positional('exampleName', {
        describe: 'Name of the example to run',
        type: 'string',
        choices: Object.keys(exampleBlueprints).length > 0 ? Object.keys(exampleBlueprints) : undefined,
      });
    })
    .option('list', {
      alias: 'l',
      type: 'boolean',
      description: 'List available examples',
    })
    .option('strategy', {
      alias: 's',
      type: 'string',
      description: 'Specify the translation strategy to use (e.g., SIR-R1) or "all" to run with all available strategies. Server default is used if not specified.',
      default: null,
    })
    .help()
    .alias('help', 'h')
    .strict()
    .argv;

  demoLogger.heading('MCR Demo Runner');
  demoLogger.info('API Target', API_BASE_URL);

  if (argv.list || (!argv.exampleName && Object.keys(exampleBlueprints).length > 0) ) {
    demoLogger.step('Available Examples:');
    if (Object.keys(exampleBlueprints).length === 0) {
      demoLogger.info('Status', 'No examples found. Check src/demos directory.');
      return;
    }
    Object.values(exampleBlueprints).forEach((bp) => {
      console.log(
        `  ${chalk.bold.cyan(bp.defaultInstance.getName().toLowerCase().replace(/\s+/g, '-'))}: ${chalk.italic(bp.defaultInstance.getDescription())}`
      );
    });
    return;
  }

  if (Object.keys(exampleBlueprints).length === 0 && !argv.exampleName) {
     demoLogger.error('No examples found and no example specified.');
     console.log(chalk.yellow('Please create demo files in src/demos/ ending with "Demo.js" and implementing the Example class.'));
     return;
  }

  const exampleKey = argv.exampleName;
  const blueprint = exampleBlueprints[exampleKey];

  if (!blueprint) {
    demoLogger.error(`Example "${exampleKey}" not found.`);
    if (Object.keys(exampleBlueprints).length > 0) {
        console.log(chalk.yellow('Use --list to see available examples.'));
    } else {
        console.log(chalk.yellow('No examples are currently available.'));
    }
    return;
  }

  // Strategies: Hardcoded for now. TODO: Fetch from server or config.
  const KNOWN_STRATEGIES = ['Direct-S1', 'SIR-R1', 'SIR-R2-FewShot', 'SIR-R3-DetailedGuidance'];
  // Also allow the one potentially set in config as default, to make sure it's "known" if user specifies it.
  if (config.translationStrategy && !KNOWN_STRATEGIES.includes(config.translationStrategy)) {
    KNOWN_STRATEGIES.push(config.translationStrategy);
  }

  let strategiesToRun = [];
  if (argv.strategy) {
    if (argv.strategy.toLowerCase() === 'all') {
      strategiesToRun = [...KNOWN_STRATEGIES];
      if (strategiesToRun.length === 0) {
        demoLogger.warn('"--strategy all" was specified, but no strategies are hardcoded/known. Using server default.');
        strategiesToRun.push(null); // Represents server default
      }
    } else {
      // Allow any string for strategy; server will validate.
      // This is simpler than trying to perfectly validate client-side without an API call.
      strategiesToRun.push(argv.strategy);
      if (!KNOWN_STRATEGIES.includes(argv.strategy)) {
        demoLogger.warn(`Strategy "${argv.strategy}" is not in the client-side known list (${KNOWN_STRATEGIES.join(', ')}). Attempting to use it anyway.`);
      }
    }
  } else {
    strategiesToRun.push(null); // Run with server's default strategy (or explicit default from config if server uses that)
  }

  const serverReady = await checkAndStartServer();
  if (!serverReady) {
    demoLogger.error('Demo aborted: Failed to connect to or start the MCR server.');
    console.log(chalk.yellow('Please check server logs and configuration. You might need to start it manually: node mcr.js'));
    return;
  }
  console.log('');

  for (let i = 0; i < strategiesToRun.length; i++) {
    const strategyName = strategiesToRun[i];
    const exampleToRun = new blueprint.Class(API_BASE_URL, logger, demoLogger);
    exampleToRun.strategyToUse = strategyName; // Pass strategy to instance for createSession

    const runId = `Run ${i + 1}/${strategiesToRun.length}`;
    const strategyLabel = strategyName ? `Strategy: ${strategyName}` : 'Server Default Strategy';

    demoLogger.heading(`Running Demo: ${exampleToRun.getName()} (${runId} - ${strategyLabel})`);
    console.log(chalk.gray(`Description: ${exampleToRun.getDescription()}`));
    demoLogger.divider();

    try {
      await exampleToRun.run();
    } catch (error) {
      demoLogger.error(`Critical error during demo "${exampleToRun.getName()}" with ${strategyLabel}`, error.message);
      logger.error(
        `Critical error in demo "${exampleToRun.getName()}" with ${strategyLabel}: ${error.stack}`
      );
    } finally {
      await exampleToRun.printKnowledgeBase(); // Call it before cleanup
      await exampleToRun.cleanupSession();
      demoLogger.divider();
      demoLogger.heading(`Demo ${exampleToRun.getName()} (${strategyLabel}) Finished`);
      if (strategiesToRun.length > 1 && i < strategiesToRun.length - 1) {
        console.log('\n\n'); // Add more space between multi-strategy runs
      }
    }
  }
}

// Make sure Example class is available for demos to import/extend
module.exports = { Example };


// Run the main function only if this script is executed directly
if (require.main === module) {
  main().catch((error) => {
    demoLogger.error('Unhandled critical error in demo runner', error.message);
    logger.error(`Unhandled critical error in demo runner: ${error.stack}`);
    process.exit(1);
  });
}
