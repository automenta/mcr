const path = require('path');
const { apiClient } = require('../api');
const { handleCliOutput, readFileContent } = require('../../cliUtils');

async function nlToRulesAsync(text, options, commandInstance) {
  const programOpts = commandInstance.parent.opts();
  let ontologyContent = null;

  if (options.ontology) {
    // readOntologyFile from old utils was:
    // if (!filePath) return null; return readFileContent(filePath, 'Ontology file');
    // So we can replicate that here.
    ontologyContent = readFileContent(
      options.ontology,
      'Ontology file for context'
    );
    if (ontologyContent && !programOpts.json) {
      console.log(
        `Using ontology for nl-to-rules: ${path.resolve(options.ontology)}`
      );
    }
  }

  const requestBody = {
    text,
    // old API took existing_facts and ontology_context
    // new mcrService.translateNLToRulesDirect only takes naturalLanguageText
    // The /translate/nl-to-rules endpoint in old README:
    // { "text": "Birds can fly. Penguins are birds but cannot fly." }
    // It does NOT take existing_facts or ontology_context in the old README.
    // This implies the old CLI was perhaps more advanced or used a different internal mechanism
    // than what was documented for the public /translate/nl-to-rules endpoint.
    // For now, I will stick to the old README's API for /translate/nl-to-rules.
    // If the server's /translate/nl-to-rules endpoint *does* support these, this can be added back.
  };

  // Current new mcrService.translateNLToRulesDirect does not support context.
  // The old /translate/nl-to-rules endpoint also did not specify these.
  // However, the OLD cli command *did* send them.
  // This suggests a mismatch or an undocumented feature.
  // I will assume the server *might* handle these if sent, based on old CLI behavior.
  if (options.existingFacts) {
    requestBody.existing_facts = options.existingFacts;
  }
  if (ontologyContent) {
    requestBody.ontology_context = ontologyContent;
  }

  const responseData = await apiClient.post(
    '/translate/nl-to-rules',
    requestBody,
    programOpts
  );
  // Old README for POST /translate/nl-to-rules response: { "rules": ["...", "..."] }
  handleCliOutput(responseData, programOpts, null, 'Translated Rules:\n');
}

async function rulesToNlAsync(rulesFile, options, commandInstance) {
  const programOpts = commandInstance.parent.opts();
  const rulesContent = readFileContent(rulesFile, 'Rules file');

  if (!programOpts.json) {
    console.log(`Using rules file: ${path.resolve(rulesFile)}`);
  }

  // The old CLI command split rules by newline or period.
  // The old README for POST /translate/rules-to-nl request:
  // { "rules": ["parent(X, Y) :- father(X, Y).", "parent(X, Y) :- mother(X, Y)."], "style": "formal" }
  // This expects an array of strings.
  // The new mcrService.translateRulesToNLDirect takes a single string.
  // The old CLI was preparing an array. I will match the old CLI's preparation of an array for the API call.
  const rulesArray = rulesContent
    .split(/\r?\n|\.(?=\s|$)/) // Split by newline or period followed by space/end
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .map((line) => (line.endsWith('.') ? line : `${line}.`)); // Ensure each rule ends with a period

  const responseData = await apiClient.post(
    '/translate/rules-to-nl',
    {
      rules: rulesArray, // Send as an array of rule strings
      style: options.style,
    },
    programOpts
  );
  // Old README for POST /translate/rules-to-nl response: { "text": "..." }
  handleCliOutput(
    responseData,
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
      '-e, --existing-facts <factsString>', // Changed from <facts> to <factsString> for clarity
      'Existing facts for context (as a single string of Prolog facts, newline-separated)'
    )
    .option(
      '-o, --ontology <file>',
      'Path to an ontology file for context (Prolog rules)'
    )
    .action(nlToRulesAsync);

  program
    .command('rules-to-nl <rulesFile>')
    .description('Translate Prolog rules from a file to natural language')
    .option(
      '-s, --style <style>',
      'Output style (e.g., formal, conversational)',
      'formal' // Default from old CLI
    )
    .action(rulesToNlAsync);
};
