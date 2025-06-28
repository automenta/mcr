/* eslint-disable no-console */
const { apiClient } = require('../api');
const { printJson } = require('../utils');

async function createSession() {
  const response = await apiClient.post('/sessions');
  console.log('Session created:');
  printJson(response.data);
}

async function getSession(sessionId) {
  const response = await apiClient.get(`/sessions/${sessionId}`);
  console.log('Session details:');
  printJson(response.data);
}

async function deleteSession(sessionId) {
  const response = await apiClient.delete(`/sessions/${sessionId}`);
  console.log(response.data.message);
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
