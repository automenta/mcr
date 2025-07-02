
const { getServerStatus, API_BASE_URL } = require('../api'); // Use the new non-exiting getServerStatus
const { handleCliOutput } = require('../../cliUtils');
const logger = require('../../logger'); // Use the main logger

async function getServerStatusCliAsync(options, commandInstance) {
  const programOpts = commandInstance.parent.opts();

  const statusResult = await getServerStatus(); // This now returns a structured object

  if (statusResult.success) {
    handleCliOutput(
      statusResult.data,
      programOpts,
      null,
      '✅ MCR API Status (Online):\n'
    );
  } else {
    // Server is offline or responded with an error
    const isJsonOutput = programOpts.json;
    const outputMessage = {
      status: statusResult.status, // 'offline', 'error_response', 'unknown_error'
      message: statusResult.message,
      details: statusResult.details, // May be undefined
      targetHost: API_BASE_URL,
    };

    if (isJsonOutput) {
      // handleCliOutput will stringify this if .json is true and no messageKey is provided
      handleCliOutput(outputMessage, programOpts);
    } else {
      // Custom logging for non-JSON output
      if (statusResult.status === 'offline') {
        logger.info(
          `🔌 MCR API server not reachable at ${API_BASE_URL}. Status: Offline`
        );
      } else if (statusResult.status === 'error_response') {
        logger.info(
          `💥 MCR API server at ${API_BASE_URL} responded with an error. Status: Error`
        );
        // console.error(`   Details: ${statusResult.message}`); // Message already contains status
        if (statusResult.details) {
          logger.info(
            `   Server Details: ${typeof statusResult.details === 'string' ? statusResult.details : JSON.stringify(statusResult.details)}`
          );
        }
      } else {
        // unknown_error
        logger.info(
          `❓ Failed to determine MCR API server status at ${API_BASE_URL}: ${statusResult.message}. Status: Unknown`
        );
      }
    }
  }
  // The status command itself succeeded in determining/reporting the status, so exit 0.
  process.exit(0);
}

module.exports = (program) => {
  program
    .command('status')
    .description('Get the MCR server status and information')
    .action(getServerStatusCliAsync);
};
