/* eslint-disable no-console */
const path = require('path');
const { apiClient } = require('../api');
const { handleCliOutput, readFileContent } = require('../../cliUtils');

async function addOntologyAsync(name, rulesFile, options, commandInstance) {
  const programOpts = commandInstance.parent.opts();
  const rules = readFileContent(rulesFile, 'Rules file');

  if (!programOpts.json) {
    console.log(`Using rules file: ${path.resolve(rulesFile)}`);
  }
  // apiClient.post will return response.data directly or handleApiError will exit
  const responseData = await apiClient.post('/ontologies', { name, rules }, programOpts);
  handleCliOutput(responseData, programOpts, null, 'Ontology added:\n');
}

async function updateOntologyAsync(name, rulesFile, options, commandInstance) {
  const programOpts = commandInstance.parent.opts();
  const rules = readFileContent(rulesFile, 'Rules file');

  if (!programOpts.json) {
    console.log(`Using rules file: ${path.resolve(rulesFile)}`);
  }
  const responseData = await apiClient.put(`/ontologies/${name}`, { rules }, programOpts);
  handleCliOutput(responseData, programOpts, null, 'Ontology updated:\n');
}

async function listOntologiesAsync(options, commandInstance) { // Changed name to listOntologiesAsync from getOntologiesAsync for clarity
  const programOpts = commandInstance.parent.opts();
  const responseData = await apiClient.get('/ontologies', null, programOpts);
  handleCliOutput(responseData, programOpts, null, 'Available Ontologies:\n');
}

async function getOntologyAsync(name, options, commandInstance) {
  const programOpts = commandInstance.parent.opts();
  const responseData = await apiClient.get(`/ontologies/${name}`, null, programOpts);
  handleCliOutput(responseData, programOpts, null, 'Ontology details:\n');
}

async function deleteOntologyAsync(name, options, commandInstance) {
  const programOpts = commandInstance.parent.opts();
  const responseData = await apiClient.delete(`/ontologies/${name}`, programOpts);
  // Old README for DELETE /ontologies/:name shows:
  // { "message": "Ontology family_relations deleted.", "ontologyName": "family_relations" }
  handleCliOutput(responseData, programOpts, 'message'); // Using 'message' key
}

module.exports = (program) => {
  program
    .command('add-ontology <name> <rulesFile>')
    .description('Add a new ontology from a Prolog rules file')
    .action(addOntologyAsync);

  program
    .command('update-ontology <name> <rulesFile>')
    .description(
      'Update an existing ontology with rules from a Prolog rules file'
    )
    .action(updateOntologyAsync);

  program
    .command('list-ontologies') // Changed command name from get-ontologies
    .description('List all available ontologies')
    .action(listOntologiesAsync);

  program
    .command('get-ontology <name>')
    .description('Get details of a specific ontology')
    .action(getOntologyAsync);

  program
    .command('delete-ontology <name>')
    .description('Delete an ontology')
    .action(deleteOntologyAsync);
};
