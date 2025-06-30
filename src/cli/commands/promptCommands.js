/* eslint-disable no-console */
const { apiClient } = require('../api');
const { handleCliOutput, printJson } = require('../utils');

async function listPromptsAsync(options, commandInstance) {
  const programOpts = commandInstance.parent.opts();
  try {
    const response = await apiClient.get('/prompts');
    if (programOpts.json) {
      handleCliOutput(response.data, programOpts);
    } else {
      const templates = response.data;
      if (Object.keys(templates).length === 0) {
        console.log('No prompt templates found.');
        return;
      }
      console.log('Available prompt templates:');
      Object.keys(templates).forEach((name) => {
        console.log(`- ${name}`);
      });
    }
  } catch (_error) {
    // apiClient.get already calls handleApiError which exits
  }
}

async function showPromptAsync(templateName, options, commandInstance) {
  const programOpts = commandInstance.parent.opts();
  if (!templateName) {
    console.error('Error: Template name is required.');
    console.log('Usage: mcr-cli prompt show <templateName>');
    process.exit(1);
  }
  try {
    const response = await apiClient.get('/prompts');
    const templates = response.data;
    if (!templates[templateName]) {
      console.error(`Error: Prompt template '${templateName}' not found.`);
      if (!programOpts.json) {
        console.log('Available templates are:');
        Object.keys(templates).forEach((name) => console.log(`- ${name}`));
      }
      process.exit(1);
    }

    if (programOpts.json) {
      // Output just the specific template string if --json for this command
      // or consider if the API should have a /prompts/:name endpoint
      handleCliOutput({ [templateName]: templates[templateName] }, programOpts);
    } else {
      console.log(`Content of prompt template '${templateName}':`);
      console.log(templates[templateName]);
    }
  } catch (_error) {
    // apiClient.get already calls handleApiError
  }
}

async function debugPromptAsync(
  templateName,
  inputVariablesJson,
  options,
  commandInstance
) {
  const programOpts = commandInstance.parent.opts();
  if (!templateName) {
    console.error('Error: Template name is required.');
    console.log(
      'Usage: mcr-cli prompt debug <templateName> <inputVariablesJson>'
    );
    process.exit(1);
  }
  if (!inputVariablesJson) {
    console.error('Error: Input variables JSON string is required.');
    console.log(
      'Usage: mcr-cli prompt debug <templateName> <inputVariablesJson>'
    );
    process.exit(1);
  }

  let inputVariables;
  try {
    inputVariables = JSON.parse(inputVariablesJson);
  } catch (e) {
    console.error('Error: Invalid JSON string for input variables.', e.message);
    process.exit(1);
  }

  try {
    const response = await apiClient.post('/debug/format-prompt', {
      templateName,
      inputVariables,
    });
    if (programOpts.json) {
      handleCliOutput(response.data, programOpts);
    } else {
      const result = response.data;
      console.log(`Debugging prompt template '${result.templateName}':`);
      console.log('\n--- Raw Template ---');
      console.log(result.rawTemplate);
      console.log('\n--- Input Variables ---');
      printJson(result.inputVariables); // Pretty print JSON
      console.log('\n--- Formatted Prompt ---');
      console.log(result.formattedPrompt);
    }
  } catch (_error) {
    // apiClient.post already calls handleApiError
  }
}

function registerPromptCommands(program) {
  const promptCommand = program
    .command('prompt')
    .description('Manage and debug prompt templates');

  promptCommand
    .command('list')
    .description('List all available prompt template names')
    .action(listPromptsAsync);

  promptCommand
    .command('show <templateName>')
    .description('Show the content of a specific prompt template')
    .action(showPromptAsync);

  promptCommand
    .command('debug <templateName> <inputVariablesJson>')
    .description(
      'Format a prompt template with input variables (provide variables as a JSON string)'
    )
    .action(debugPromptAsync);
}

module.exports = {
  registerPromptCommands,
};
