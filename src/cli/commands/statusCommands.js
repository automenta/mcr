const { apiClient } = require('../api');
const { handleCliOutput } = require('../utils');

// This function is intended for CLI command execution via Commander
async function getServerStatusCli(options, commandInstance) {
  const programOpts = commandInstance.parent.opts();
  try {
    const response = await apiClient.get('/');
    // For CLI, we use handleCliOutput
    handleCliOutput(response.data, programOpts, null, 'Server Status:\n');
  } catch (error) {
    // apiClient.get should handle its own errors and exit if needed via handleApiError
    // If it doesn't, or if we want specific CLI error message here:
    if (!programOpts.json) {
      console.error(`Error fetching server status: ${error.message}`);
    } else {
      console.log(JSON.stringify({ error: 'status_fetch_failed', message: error.message }));
    }
    process.exit(1); // Exit for CLI if status fails
  }
}

// This function is for internal use by other modules, like the TUI
// It returns data or throws an error, letting the caller handle UI.
async function getServerStatusAsync() {
  try {
    const response = await apiClient.get('/');
    return response.data; // Return data for TUI to format
  } catch (error) {
    // Let the caller (TUI) handle displaying this error
    throw error;
  }
}

module.exports = (program) => {
  program
    .command('status')
    .description('Get the MCR server status and information')
    .action(getServerStatusCli); // Use the CLI-specific version for commander
};

// Export the internal function separately for other modules to import
module.exports.internal = {
  getServerStatusAsync,
};
