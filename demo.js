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
      const createResponse = await axios.post(
        `${this.apiBaseUrl}/sessions`,
        {}, // Empty body for POST if not sending data
        { timeout: 30000 } // 30 second timeout
      );
      this.sessionId = createResponse.data.id;
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

  async assertFact(fact) {
    this.dLog.info(`Asserting fact`, fact);
    try {
      const axios = (await import('axios')).default;
      const assertResponse = await axios.post(
        `${this.apiBaseUrl}/sessions/${this.sessionId}/assert`,
        { text: fact },
        { timeout: 30000 } // 30 second timeout
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
      if (queryResponse.data.debugInfo) {
        this.logger.debug(
          `[${this.getName()}] Query Debug Info:`,
          queryResponse.data.debugInfo
        );
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
      this.logger.info(`[${this.getName()}] Assertion PASSED: ${successMessage}`);
    } else {
      this.dLog.error(`Assertion FAILED: ${failureMessage}`);
      this.logger.error(`[${this.getName()}] Assertion FAILED: ${failureMessage}`);
    }
  }
}

// Function to discover examples
function loadExamples() {
  const examples = {};
  const demosDir = path.join(__dirname, 'src', 'demos');
  const files = fs.readdirSync(demosDir);

  files.forEach((file) => {
    if (file.endsWith('Demo.js') && file !== 'demoUtils.js') {
      const exampleName = path.basename(file, '.js');
      try {
        const ExampleClass = require(path.join(demosDir, file));
        if (typeof ExampleClass === 'function' && ExampleClass.prototype instanceof Example) {
          const instance = new ExampleClass(API_BASE_URL, logger, demoLogger);
          examples[instance.getName().toLowerCase().replace(/\s+/g, '-')] = instance;
        } else if (typeof ExampleClass.default === 'function' && ExampleClass.default.prototype instanceof Example) {
          // Handle ES modules default export
          const instance = new ExampleClass.default(API_BASE_URL, logger, demoLogger);
          examples[instance.getName().toLowerCase().replace(/\s+/g, '-')] = instance;
        }
      } catch (err) {
        console.error(chalk.red(`Error loading demo ${exampleName}: ${err.message}`));
        logger.error(`Failed to load demo ${exampleName}: ${err.stack}`);
      }
    }
  });
  return examples;
}


async function main() {
  const examples = loadExamples();

  const argv = yargs(hideBin(process.argv))
    .command('$0 [exampleName]', 'Run a specific MCR demo example', (y) => {
      y.positional('exampleName', {
        describe: 'Name of the example to run',
        type: 'string',
        choices: Object.keys(examples).length > 0 ? Object.keys(examples) : undefined, // Only provide choices if examples loaded
      });
    })
    .option('list', {
      alias: 'l',
      type: 'boolean',
      description: 'List available examples',
    })
    .help()
    .alias('help', 'h')
    .strict() // Enforce strict command parsing
    .argv;

  demoLogger.heading('MCR Demo Runner');
  demoLogger.info('API Target', API_BASE_URL);

  if (argv.list || (!argv.exampleName && Object.keys(examples).length > 0) ) {
    demoLogger.step('Available Examples:');
    if (Object.keys(examples).length === 0) {
      demoLogger.info('Status', 'No examples found. Check src/demos directory.');
      return;
    }
    Object.values(examples).forEach((ex) => {
      console.log(
        `  ${chalk.bold.cyan(ex.getName().toLowerCase().replace(/\s+/g, '-'))}: ${chalk.italic(ex.getDescription())}`
      );
    });
    return;
  }

  if (Object.keys(examples).length === 0 && !argv.exampleName) {
     demoLogger.error('No examples found and no example specified.');
     console.log(chalk.yellow('Please create demo files in src/demos/ ending with "Demo.js" and implementing the Example class.'));
     return;
  }


  const exampleKey = argv.exampleName;
  const exampleToRun = examples[exampleKey];

  if (!exampleToRun) {
    demoLogger.error(`Example "${exampleKey}" not found.`);
    if (Object.keys(examples).length > 0) {
        console.log(chalk.yellow('Use --list to see available examples.'));
    } else {
        console.log(chalk.yellow('No examples are currently available.'));
    }
    return;
  }

  const serverReady = await checkAndStartServer();
  if (!serverReady) {
    demoLogger.error(
      'Demo aborted: Failed to connect to or start the MCR server.'
    );
    console.log(
      chalk.yellow(
        'Please check server logs and configuration. You might need to start it manually: node mcr.js'
      )
    );
    return; // Exit if server cannot be started
  }
  console.log(''); // Newline for cleaner output

  demoLogger.heading(`Running Demo: ${exampleToRun.getName()}`);
  console.log(chalk.gray(`Description: ${exampleToRun.getDescription()}`));
  demoLogger.divider();

  try {
    await exampleToRun.run();
  } catch (error) {
    demoLogger.error(`Critical error during demo "${exampleToRun.getName()}"`, error.message);
    logger.error(
      `Critical error in demo "${exampleToRun.getName()}": ${error.stack}`
    );
  } finally {
    await exampleToRun.cleanupSession();
    demoLogger.divider();
    demoLogger.heading(`Demo ${exampleToRun.getName()} Finished`);
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
