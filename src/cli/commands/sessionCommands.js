const { apiClient } = require('../api'); // Use new apiClient
const { handleCliOutput } = require('../../cliUtils'); // Use new handleCliOutput

async function createSessionAsync(options, commandInstance) {
  const programOpts = commandInstance.parent.opts(); // Get global options like --json
  // apiClient.post will return response.data directly or handleApiError will exit
  const responseData = await apiClient.post('/sessions', {}, programOpts);
  handleCliOutput(responseData, programOpts, null, 'Session created:\n');
}

async function getSessionAsync(sessionId, options, commandInstance) {
  const programOpts = commandInstance.parent.opts();
  const responseData = await apiClient.get(`/sessions/${sessionId}`, null, programOpts);
  handleCliOutput(responseData, programOpts, null, 'Session details:\n');
}

async function deleteSessionAsync(sessionId, options, commandInstance) {
  const programOpts = commandInstance.parent.opts();
  const responseData = await apiClient.delete(`/sessions/${sessionId}`, programOpts);
  // The old version used 'message' as the messageKey. Let's check API spec.
  // old/README.md for DELETE /sessions/:sessionId shows:
  // { "message": "Session a-unique-uuid terminated.", "sessionId": "a-unique-uuid" }
  handleCliOutput(responseData, programOpts, 'message');
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
