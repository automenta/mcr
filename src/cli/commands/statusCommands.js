/* eslint-disable no-console */
const { apiClient } = require('../api');
const { printJson } = require('../utils');

async function getServerStatus() {
  const response = await apiClient.get('/');
  console.log('Server Status:');
  printJson(response.data);
}

module.exports = (program) => {
  program
    .command('status')
    .description('Get the MCR server status and information')
    .action(getServerStatus);
};
