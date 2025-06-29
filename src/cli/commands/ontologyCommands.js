/* eslint-disable no-console */
const path = require('path');
const { apiClient } = require('../api');
const { handleCliOutput, readFileContent } = require('../utils'); // Added readFileContent

async function addOntologyAsync(name, rulesFile, options, commandInstance) { // Renamed
  const programOpts = commandInstance.parent.opts();
  // readFileContent will handle path.resolve and existsSync check
  const rules = readFileContent(rulesFile, 'Rules file');

  if (!programOpts.json) {
    // path.resolve is done inside readFileContent, but for logging here we might want it too
    // However, readFileContent exits on error, so if we are here, file was read.
    // For cleaner logging, let's resolve path here once for the log message.
    console.log(`Using rules file: ${path.resolve(rulesFile)}`);
  }
  const response = await apiClient.post('/ontologies', { name, rules });
  handleCliOutput(response.data, programOpts, null, 'Ontology added:\n');
}

async function updateOntologyAsync(name, rulesFile, options, commandInstance) { // Renamed
  const programOpts = commandInstance.parent.opts();
  const rules = readFileContent(rulesFile, 'Rules file');

  if (!programOpts.json) {
    console.log(`Using rules file: ${path.resolve(rulesFile)}`);
  }
  const response = await apiClient.put(`/ontologies/${name}`, { rules });
  handleCliOutput(response.data, programOpts, null, 'Ontology updated:\n');
}

async function getOntologiesAsync(options, commandInstance) { // Renamed
  const programOpts = commandInstance.parent.opts();
  const response = await apiClient.get('/ontologies');
  handleCliOutput(response.data, programOpts, null, 'Available Ontologies:\n');
}

async function getOntologyAsync(name, options, commandInstance) { // Renamed
  const programOpts = commandInstance.parent.opts();
  const response = await apiClient.get(`/ontologies/${name}`);
  handleCliOutput(response.data, programOpts, null, 'Ontology details:\n');
}

async function deleteOntologyAsync(name, options, commandInstance) { // Renamed
  const programOpts = commandInstance.parent.opts();
  const response = await apiClient.delete(`/ontologies/${name}`);
  // API returns { "message": "Ontology ... deleted.", "ontologyName": "..." }
  handleCliOutput(response.data, programOpts, 'message', 'Ontology deleted: ');
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
    .command('get-ontologies')
    .description('List all available ontologies')
    .action(getOntologiesAsync);

  program
    .command('get-ontology <name>')
    .description('Get details of a specific ontology')
    .action(getOntologyAsync);

  program
    .command('delete-ontology <name>')
    .description('Delete an ontology')
    .action(deleteOntologyAsync);
};
