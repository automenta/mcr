/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const { apiClient } = require('../api');
const { printJson } = require('../utils');

async function addOntology(name, rulesFile) {
  const rulesPath = path.resolve(rulesFile);
  if (!fs.existsSync(rulesPath)) {
    console.error(`Error: Rules file not found: ${rulesPath}`);
    process.exit(1);
  }
  const rules = fs.readFileSync(rulesPath, 'utf8');
  const response = await apiClient.post('/ontologies', { name, rules });
  console.log('Ontology added:');
  printJson(response.data);
}

async function updateOntology(name, rulesFile) {
  const rulesPath = path.resolve(rulesFile);
  if (!fs.existsSync(rulesPath)) {
    console.error(`Error: Rules file not found: ${rulesPath}`);
    process.exit(1);
  }
  const rules = fs.readFileSync(rulesPath, 'utf8');
  const response = await apiClient.put(`/ontologies/${name}`, { rules });
  console.log('Ontology updated:');
  printJson(response.data);
}

async function getOntologies() {
  const response = await apiClient.get('/ontologies');
  console.log('Available Ontologies:');
  printJson(response.data);
}

async function getOntology(name) {
  const response = await apiClient.get(`/ontologies/${name}`);
  console.log('Ontology details:');
  printJson(response.data);
}

async function deleteOntology(name) {
  const response = await apiClient.delete(`/ontologies/${name}`);
  console.log('Ontology deleted:');
  printJson(response.data);
}

module.exports = (program) => {
  program
    .command('add-ontology <name> <rulesFile>')
    .description('Add a new ontology from a Prolog rules file')
    .action(addOntology);

  program
    .command('update-ontology <name> <rulesFile>')
    .description('Update an existing ontology with rules from a Prolog rules file')
    .action(updateOntology);

  program
    .command('get-ontologies')
    .description('List all available ontologies')
    .action(getOntologies);

  program
    .command('get-ontology <name>')
    .description('Get details of a specific ontology')
    .action(getOntology);

  program
    .command('delete-ontology <name>')
    .description('Delete an ontology')
    .action(deleteOntology);
};
