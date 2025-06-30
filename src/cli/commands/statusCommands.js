const { apiClient } = require('../api');
const { handleCliOutput } = require('../utils');

async function getServerStatusAsync(options, commandInstance) {
  const programOpts = commandInstance.parent.opts();
  const response = await apiClient.get('/');
  handleCliOutput(response.data, programOpts, null, 'Server Status:\n');
}

module.exports = (program) => {
  program
    .command('status')
    .description('Get the MCR server status and information')
    .action(getServerStatusAsync);
};
