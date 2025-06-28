/* eslint-disable no-console */
const { apiClient } = require('../api');
const { handleCliOutput } = require('../utils');

// Command has no arguments and no options of its own.
// So, the 'command' object is passed as the first argument to the action handler.
async function createSession(command) {
  const programOpts = command.parent.opts(); // Access global options from parent (program)
  const response = await apiClient.post('/sessions');
  handleCliOutput(response.data, programOpts, null, 'Session created:\n');
}

// Command has one argument <sessionId>, no options of its own.
// So, action handler is (arg1, command)
async function getSession(sessionId, command) {
  const programOpts = command.parent.opts();
  const response = await apiClient.get(`/sessions/${sessionId}`);
  handleCliOutput(response.data, programOpts, null, 'Session details:\n');
}

// Command has one argument <sessionId>, no options of its own.
// So, action handler is (arg1, command)
async function deleteSession(sessionId, command) {
  const programOpts = command.parent.opts();
  const response = await apiClient.delete(`/sessions/${sessionId}`);
  // For delete, the API returns { "message": "Session ... terminated.", "sessionId": "..." }
  // If not --json, we want to print the message. If --json, the whole object.
  handleCliOutput(response.data, programOpts, 'message');
}

module.exports = (program) => {
  program
    .command('create-session')
    .description('Create a new MCR session')
    .action(createSession);

  program
    .command('get-session <sessionId>')
    .description('Get details of an MCR session')
    .action(getSession);

  program
    .command('delete-session <sessionId>')
    .description('Delete an MCR session')
    .action(deleteSession);
};
