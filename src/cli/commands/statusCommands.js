const { getServerStatus } = require('../api'); // Use the version that doesn't auto-exit
const { handleCliOutput } = require('../utils');
const ConfigManager = require('../../config');

// This function is intended for CLI command execution via Commander
async function getServerStatusCliAsync(options, commandInstance) {
  const programOpts = commandInstance.parent.opts();
  const config = ConfigManager.get(); // Get config for API URL
  const apiUrl = `http://${config.server.host}:${config.server.port}`;

  try {
    const statusData = await getServerStatus(); // This uses tuiApiClientInstance
    // For CLI, we use handleCliOutput for successful status
    handleCliOutput(statusData, programOpts, null, 'MCR API Status:\n');
    // process.exit(0); // Command successful
  } catch (error) {
    // Error here means the server is likely not running or unreachable
    const isJsonOutput = programOpts.json;

    if (error.isAxiosError && !error.response) {
      // This typically means connection refused or DNS error etc.
      if (isJsonOutput) {
        console.log(
          JSON.stringify({
            status: 'offline',
            message: `MCR API server not reachable at ${apiUrl}.`,
          })
        );
      } else {
        console.log(
          `MCR API server not reachable at ${apiUrl}. Status: Offline`
        );
      }
    } else if (error.response) {
      // Server responded with an error status code
      if (isJsonOutput) {
        console.log(
          JSON.stringify({
            status: 'error',
            message: `Server at ${apiUrl} responded with error ${error.response.status}.`,
            details: error.response.data,
          })
        );
      } else {
        console.log(
          `MCR API server at ${apiUrl} responded with error ${error.response.status}. Status: Error`
        );
      }
    } else {
      // Other types of errors
      if (isJsonOutput) {
        console.log(
          JSON.stringify({
            status: 'error',
            message: `Failed to get status from ${apiUrl}: ${error.message}`,
          })
        );
      } else {
        console.log(
          `Failed to determine MCR API server status at ${apiUrl}: ${error.message}. Status: Unknown`
        );
      }
    }
    // For 'status' command, even if server is down, the command itself didn't fail.
    // It correctly reported the status. So, we exit 0.
    // The test `expect(error).toBeNull()` in chatCommand.integration.test.js implies this.
    // If a non-zero exit was desired for "offline", the test would need to change.
    process.exit(0);
  }
}

// getServerStatusAsync is already exported from api.js as getServerStatus, so no need to redefine here.

module.exports = (program) => {
  program
    .command('status')
    .description('Get the MCR server status and information. This command does NOT attempt to auto-start the server.')
    .action(getServerStatusCliAsync);
};

// No need for module.exports.internal if getServerStatus from api.js is sufficient
