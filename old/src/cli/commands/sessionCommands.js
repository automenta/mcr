const { apiClient } = require('../api');
const { handleCliOutput } = require('../utils');

async function createSessionAsync(options, commandInstance) {
  const programOpts = commandInstance.parent.opts();
  const response = await apiClient.post('/sessions');
  handleCliOutput(response.data, programOpts, null, 'Session created:\n');
}

async function getSessionAsync(sessionId, options, commandInstance) {
  const programOpts = commandInstance.parent.opts();
  const response = await apiClient.get(`/sessions/${sessionId}`);
  handleCliOutput(response.data, programOpts, null, 'Session details:\n');
}

async function deleteSessionAsync(sessionId, options, commandInstance) {
  const programOpts = commandInstance.parent.opts();
  const response = await apiClient.delete(`/sessions/${sessionId}`);
  handleCliOutput(response.data, programOpts, 'message');
}

module.exports = (program) => {
  program
    .command('create-session')
    .description('Create a new MCR session')
    .action(createSessionAsync);

  program
    .command('get-session <sessionId>')
    .description('Get details of an MCR session')
    .action(getSessionAsync);

  program
    .command('delete-session <sessionId>')
    .description('Delete an MCR session')
    .action(deleteSessionAsync);
};
