/* eslint-disable no-console */
const { apiClient } = require('../api');
const { handleCliOutput } = require('../utils'); // Use handleCliOutput

// status command has no arguments or options of its own. Action: (command)
async function getServerStatus(command) {
  const programOpts = command.parent.opts();
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
