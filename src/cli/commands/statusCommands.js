const axios = require('axios'); // Import axios directly
const { handleCliOutput } = require('../utils');
const ConfigManager = require('../../config');
const { logger: cmdLogger } = require('../../logger');

async function getServerStatusCliAsync(_options, commandInstance) {
  const programOpts = commandInstance.parent.opts();
  const config = ConfigManager.get();
  const apiUrl = `http://${config.server.host}:${config.server.port}/`; // Ensure trailing slash for root

  try {
    const response = await axios.get(apiUrl, { timeout: 3000 }); // Added timeout
    // For CLI, we use handleCliOutput for successful status
    handleCliOutput(response.data, programOpts, null, '✅ MCR API Status (Online):\n');
  } catch (error) {
    const isJsonOutput = programOpts.json;
    let outputMessage;

    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || error.isAxiosError && !error.response) {
      // Network error or server not running
      outputMessage = {
        status: 'offline',
        message: `MCR API server not reachable at ${apiUrl}.`,
        details: error.message,
      };
      if (isJsonOutput) {
        process.stdout.write(JSON.stringify(outputMessage) + '\n');
      } else {
        cmdLogger.info(`🔌 MCR API server not reachable at ${apiUrl}. Status: Offline`);
      }
    } else if (error.response) {
      // Server responded with an error status code
      outputMessage = {
        status: 'error_response',
        message: `💥 Server at ${apiUrl} responded with HTTP status ${error.response.status}.`,
        details: error.response.data,
        httpStatus: error.response.status,
      };
      if (isJsonOutput) {
        process.stdout.write(JSON.stringify(outputMessage) + '\n');
      } else {
        cmdLogger.info(
          `💥 MCR API server at ${apiUrl} responded with HTTP status ${error.response.status}. Status: Error Response`
        );
      }
    } else {
      // Other types of errors (e.g., request setup issues)
      outputMessage = {
        status: 'client_error',
        message: `❓ Failed to get status from ${apiUrl}: ${error.message}`,
      };
      if (isJsonOutput) {
        process.stdout.write(JSON.stringify(outputMessage) + '\n');
      } else {
        cmdLogger.info(
          `❓ Failed to determine MCR API server status at ${apiUrl}: ${error.message}. Status: Unknown Client Error`
        );
      }
    }
    // The 'status' command should report the status and exit 0,
    // as it successfully determined and reported the server's state (even if offline).
  }
  process.exit(0); // Ensure process exits cleanly after reporting status.
}

module.exports = (program) => {
  program
    .command('status')
    .description('Get the MCR server status and information')
    .action(getServerStatusCliAsync);
};

// No need for module.exports.internal if getServerStatus from api.js is sufficient
