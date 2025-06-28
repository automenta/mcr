/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const { apiClient } = require('../api');
const { printJson } = require('../utils');

async function nlToRules(text, options) {
  const response = await apiClient.post('/translate/nl-to-rules', {
    text,
    existing_facts: options.existingFacts,
    ontology_context: options.ontologyContext,
  });
  console.log('Translated Rules:');
  printJson(response.data.rules);
}

async function rulesToNl(rulesFile, options) {
  const rulesPath = path.resolve(rulesFile);
  if (!fs.existsSync(rulesPath)) {
    console.error(`Error: Rules file not found: ${rulesPath}`);
    process.exit(1);
  }
  const rulesContent = fs.readFileSync(rulesPath, 'utf8');
  const rules = rulesContent
    .split(/\r?\n|\./)
    .filter((line) => line.trim() !== '')
    .map((line) => `${line.trim()}.`);

  const response = await apiClient.post('/translate/rules-to-nl', {
    rules,
    style: options.style,
  });
  console.log('Translated Natural Language:');
  console.log(response.data.text);
}

module.exports = (program) => {
  program
    .command('nl-to-rules <text>')
    .description('Translate natural language text to Prolog rules')
    .option('-e, --existing-facts <facts>', 'Existing facts for context', '')
    .option('-o, --ontology-context <ontology>', 'Ontology context for translation', '')
    .action(nlToRules);

  program
    .command('rules-to-nl <rulesFile>')
    .description('Translate Prolog rules from a file to natural language')
    .option('-s, --style <style>', 'Output style (e.g., formal, conversational)', 'formal')
    .action(rulesToNl);
};
