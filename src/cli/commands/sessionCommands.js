const { apiClient } = require('../api');
const { handleCliOutput } = require('../utils');

// Action signature: (options, commandInstance) for commands without arguments.
async function createSessionAsync(options, commandInstance) {
  // Renamed
  const programOpts = commandInstance.parent.opts(); // Access global options from parent (program)
  const response = await apiClient.post('/sessions');
  handleCliOutput(response.data, programOpts, null, 'Session created:\n');
}

// Action signature: (arg1, ..., options, commandInstance) for commands with arguments.
async function getSessionAsync(sessionId, options, commandInstance) {
  // Renamed
  const programOpts = commandInstance.parent.opts();
  const response = await apiClient.get(`/sessions/${sessionId}`);
  handleCliOutput(response.data, programOpts, null, 'Session details:\n');
}

// Action signature: (arg1, ..., options, commandInstance)
async function deleteSessionAsync(sessionId, options, commandInstance) {
  // Renamed
  const programOpts = commandInstance.parent.opts();
  const response = await apiClient.delete(`/sessions/${sessionId}`);
  // For delete, the API returns { "message": "Session ... terminated.", "sessionId": "..." }
  // If not --json, we want to print the message. If --json, the whole object.
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
