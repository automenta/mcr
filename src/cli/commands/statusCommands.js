/* eslint-disable no-console */
const { apiClient } = require('../api');
const { handleCliOutput } = require('../utils'); // Use handleCliOutput

// Action handler receives (options, commandInstance)
// options: command-specific options
// commandInstance: the command object itself
async function getServerStatus(options, commandInstance) {
  // Global options are on the parent (the main program instance)
  const programOpts = commandInstance.parent.opts();
  const response = await apiClient.get('/');
  // API returns server status object.
  // If not --json, print "Server Status:" then the object (pretty JSON).
  // If --json, print the raw JSON object.
  handleCliOutput(response.data, programOpts, null, 'Server Status:\n');
}

module.exports = (program) => {
  program
    .command('status')
    .description('Get the MCR server status and information')
    .action(getServerStatus);
};
