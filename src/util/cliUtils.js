// Adapted from old/src/cli/utils.js and old/src/cli/api.js

/**
 * Prints data to the console. If isRawJson is true, it prints the full JSON.
 * Otherwise, it prints a formatted JSON string.
 * @param {*} data The data to print.
 * @param {boolean} isRawJson If true, print non-pretty JSON. Otherwise, pretty print.
 */
const printJson = (data, isRawJson = false) => {
  if (isRawJson) {
    console.log(JSON.stringify(data));
  } else {
    // Special handling for 'rules' field if it's a string, to make Prolog more readable
    if (
      typeof data === 'object' &&
      data !== null &&
      typeof data.rules === 'string' &&
      data.rules.includes('\\n') // Check for escaped newlines if that's how server sends it, or direct newlines
    ) {
      const { rules, ...restOfData } = data;
      if (Object.keys(restOfData).length > 0) {
        console.log(JSON.stringify(restOfData, null, 2));
      }
      const rulesLabel =
        Object.keys(restOfData).length > 0 ? '  rules:' : 'rules:';
      console.log(rulesLabel);
      rules.split(/\\n|\n/).forEach((line) => {
        // Handle both escaped and direct newlines
        const trimmedLine = line.trim();
        if (trimmedLine.length > 0) {
          console.log(`    ${trimmedLine}`);
        }
      });
    } else {
      console.log(JSON.stringify(data, null, 2));
    }
  }
};

/**
 * Handles CLI output, printing either a custom message or JSON data.
 * @param {*} data - The full data object from the API response.
 * @param {object} cliOptions - Commander options object (e.g., program.opts() or command.opts()).
 * @param {string} [messageKey] - Optional key to extract a simple message from data (e.g., 'message' or 'answer').
 * @param {string} [defaultMessagePrefix] - Optional prefix for the simple message.
 */
const handleCliOutput = (
  data,
  cliOptions,
  messageKey,
  defaultMessagePrefix = ''
) => {
  const programOpts = cliOptions || {}; // Ensure cliOptions is an object

  if (programOpts.json) {
    printJson(data, true); // Print raw JSON if --json is used
  } else if (messageKey && data && typeof data[messageKey] === 'string') {
    console.log(`${defaultMessagePrefix}${data[messageKey]}`);
  } else if (typeof data === 'string') {
    console.log(`${defaultMessagePrefix}${data}`);
  } else {
    if (defaultMessagePrefix) console.log(defaultMessagePrefix);
    printJson(data);
  }
};

/**
 * Centralized error handler for CLI commands.
 * Formats the error output based on whether JSON output is requested and then exits the process.
 * @param {Error} error - The error object, typically from an Axios request.
 * @param {object} [programOptions={}] - Commander program options, used to check for `--json` flag.
 */
const handleApiError = (error, programOptions = {}) => {
  const isJsonOutput = programOptions.json || false;

  if (error.response) {
    // Error from server (status code received)
    const errorData = error.response.data?.error ||
      error.response.data || {
        message: error.response.statusText || 'Unknown server error',
      };
    const correlationId = error.response.headers?.['x-correlation-id'];
    const status = error.response.status;

    const errOutput = {
      error: {
        status: status,
        message:
          errorData.message ||
          (typeof errorData === 'string'
            ? errorData
            : 'Unknown error structure'),
        type: errorData.type,
        code: errorData.code,
        correlationId: correlationId || errorData.correlationId,
        details: errorData.details,
      },
    };

    if (isJsonOutput) {
      console.error(JSON.stringify(errOutput, null, 2));
    } else {
      console.error(`Error ${status}: ${errOutput.error.message}`);
      if (errOutput.error.type) console.error(`Type: ${errOutput.error.type}`);
      if (errOutput.error.code) console.error(`Code: ${errOutput.error.code}`);
      if (errOutput.error.correlationId)
        console.error(`CorrelationId: ${errOutput.error.correlationId}`);
      if (errOutput.error.details)
        console.error(`Details: ${JSON.stringify(errOutput.error.details)}`);
      // Add more user-friendly suggestions based on status code as in old/src/cli/api.js if desired
    }
  } else if (error.request) {
    // Request made but no response received
    const apiBaseUrl = programOptions.apiBaseUrl || 'http://localhost:PORT'; // Get from config or pass in
    const message = `Connection Issue: No response received from MCR API server at ${apiBaseUrl}. Ensure it's running and accessible.`;
    if (isJsonOutput) {
      console.error(
        JSON.stringify(
          {
            error: { message, type: 'ConnectionError', targetHost: apiBaseUrl },
          },
          null,
          2
        )
      );
    } else {
      console.error(message);
    }
  } else {
    // Other errors (e.g., setup issue)
    const message = `Client Setup Error: ${error.message}`;
    if (isJsonOutput) {
      console.error(
        JSON.stringify(
          { error: { message, type: 'ClientSetupError' } },
          null,
          2
        )
      );
    } else {
      console.error(message);
    }
  }
  process.exit(1);
};

const fs = require('fs');
const path = require('path');

/**
 * Reads the content of a specified file.
 * Exits the process if the file is not found or other error occurs.
 * @param {string} filePath - The path to the file.
 * @param {string} fileDescription - A description of the file type (e.g., "Ontology file", "Rules file").
 * @returns {string} The content of the file.
 */
const readFileContent = (filePath, fileDescription = 'File') => {
  try {
    const resolvedPath = path.resolve(filePath);
    if (!fs.existsSync(resolvedPath)) {
      console.error(`Error: ${fileDescription} not found: ${resolvedPath}`);
      console.error(
        `Suggestion: Please ensure the file path is correct and the file exists at that location.`
      );
      process.exit(1);
    }
    return fs.readFileSync(resolvedPath, 'utf8');
  } catch (error) {
    console.error(
      `Error reading ${fileDescription} "${filePath}": ${error.message}`
    );
    process.exit(1);
  }
};

const config = require('../config'); // To get server URL for health check
const {
  isServerAliveAsync,
  startMcrServerAsync,
} = require('../cli/tuiUtils/serverManager');
const logger = require('./logger'); // For logging

/**
 * Checks if the MCR server is alive. If not, attempts to start it.
 * @param {object} programOpts - Commander program options (optional).
 * @returns {Promise<boolean>} True if the server is alive or successfully started, false otherwise.
 */
async function checkAndStartServer(programOpts = {}) {
  const healthCheckUrl = `http://${config.server.host}:${config.server.port}/`;

  logger.info(
    `[cliUtils] Attempting health check for server at ${healthCheckUrl}...`
  );
  let alive = await isServerAliveAsync(healthCheckUrl, 2, 300); // Quick check: 2 retries, 300ms delay

  if (alive) {
    logger.info('[cliUtils] MCR server is already running and healthy.');
    return true;
  } else {
    logger.info(
      '[cliUtils] MCR server not detected or not healthy. Attempting to start it...'
    );
    try {
      logger.debug(
        '[cliUtils] Calling startMcrServerAsync to launch server process...'
      );
      await startMcrServerAsync(programOpts);
      logger.info(
        '[cliUtils] startMcrServerAsync call completed (server process should be launched).'
      );

      const initialWait = 1500; // 1.5 seconds initial wait for server to boot
      logger.debug(
        `[cliUtils] Waiting ${initialWait}ms for server to initialize after launch command...`
      );
      await new Promise((resolve) => setTimeout(resolve, initialWait));

      logger.info(
        '[cliUtils] Initial startup period passed. Verifying server status with new health checks...'
      );
      // Verification retries: 3 retries, 300ms delay
      alive = await isServerAliveAsync(healthCheckUrl, 3, 300);

      if (alive) {
        logger.info(
          '[cliUtils] MCR server started and confirmed healthy by cliUtils.'
        );
        return true;
      } else {
        logger.error(
          '[cliUtils] Failed to confirm server is running and healthy after automated start attempt by cliUtils. Check server logs (stdout/stderr from previous messages).'
        );
        return false;
      }
    } catch (error) {
      // This catch is for errors from startMcrServerAsync itself (e.g., process spawn error or initial health check within it failing)
      logger.error(
        `[cliUtils] Error during automated server start process (startMcrServerAsync itself failed): ${error.message}`
      );
      return false;
    }
  }
}

module.exports = {
  printJson,
  handleCliOutput,
  handleApiError,
  readFileContent,
  checkAndStartServer,
};
