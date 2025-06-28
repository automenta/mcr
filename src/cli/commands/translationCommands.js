/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const { apiClient } = require('../api');
const {
  handleCliOutput,
  readOntologyFile,
  readFileContent,
} = require('../utils'); // Added readFileContent

// nlToRules has <text> argument and options. Action: (text, options, command)
async function nlToRules(text, options, command) {
  const programOpts = command.parent.opts();
  let ontologyContent = null;
  if (options.ontology) {
    // readOntologyFile already handles file reading errors
    ontologyContent = readOntologyFile(options.ontology);
    if (ontologyContent && !programOpts.json) {
      // Log the original path provided by the user for clarity
      console.log(`Using ontology for nl-to-rules: ${options.ontology}`);
    }
  }

  const requestBody = {
    text,
    existing_facts: options.existingFacts,
  };

  if (ontologyContent) {
    requestBody.ontology_context = ontologyContent;
  }

  const response = await apiClient.post('/translate/nl-to-rules', requestBody);
  handleCliOutput(response.data, programOpts, null, 'Translated Rules:\n');
}

// rulesToNl has <rulesFile> argument and options. Action: (rulesFile, options, command)
async function rulesToNl(rulesFile, options, command) {
  const programOpts = command.parent.opts();
  // readFileContent will handle path resolution and existence check
  const rulesContent = readFileContent(rulesFile, 'Rules file');

  if (!programOpts.json) {
    // Log the original path for consistency
    console.log(`Using rules file: ${rulesFile}`);
  }

  const rules = rulesContent
    .split(/\r?\n|\./)
    .filter((line) => line.trim() !== '')
    .map((line) => `${line.trim()}.`);

  const response = await apiClient.post('/translate/rules-to-nl', {
    rules,
    style: options.style,
  });
  handleCliOutput(
    response.data,
    programOpts,
    'text',
    'Translated Natural Language:\n'
  );
}

module.exports = (program) => {
  program
    .command('nl-to-rules <text>')
    .description('Translate natural language text to Prolog rules')
    .option(
      '-e, --existing-facts <facts>',
      'Existing facts for context (string)',
      ''
    )
    .option('-o, --ontology <file>', 'Path to an ontology file for context')
    .action(nlToRules);

  program
    .command('rules-to-nl <rulesFile>')
    .description('Translate Prolog rules from a file to natural language')
    .option(
      '-s, --style <style>',
      'Output style (e.g., formal, conversational)',
      'formal'
    )
    .action(rulesToNl);
};
