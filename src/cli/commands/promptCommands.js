const apiClient = require('../api');
const { printError, printSuccess, printJson, printBold } = require('../utils');

async function listPromptsCommandAsync() { // Renamed
  try {
    const templates = await apiClient.getPrompts();
    if (Object.keys(templates).length === 0) {
      printSuccess('No prompt templates found.');
      return;
    }
    printBold('Available prompt templates:');
    Object.keys(templates).forEach((name) => {
      console.log(`- ${name}`);
    });
  } catch (error) {
    printError('Error listing prompts:', error.message);
    if (error.response?.data) {
      printJson(error.response.data);
    }
  }
}

async function showPromptCommandAsync(templateName) { // Renamed
  if (!templateName) {
    printError('Error: Template name is required.');
    console.log('Usage: mcr-cli show-prompt <templateName>');
    return;
  }
  try {
    const templates = await apiClient.getPrompts();
    if (!templates[templateName]) {
      printError(`Error: Prompt template '${templateName}' not found.`);
      printBold('Available templates are:');
      Object.keys(templates).forEach((name) => console.log(`- ${name}`));
      return;
    }
    printBold(`Content of prompt template '${templateName}':`);
    console.log(templates[templateName]);
  } catch (error) {
    printError(`Error showing prompt '${templateName}':`, error.message);
    if (error.response?.data) {
      printJson(error.response.data);
    }
  }
}

async function debugPromptCommandAsync(templateName, inputVariablesJson) { // Renamed
  if (!templateName) {
    printError('Error: Template name is required.');
    console.log(
      'Usage: mcr-cli debug-prompt <templateName> <inputVariablesJson>'
    );
    return;
  }
  if (!inputVariablesJson) {
    printError('Error: Input variables JSON string is required.');
    console.log(
      'Usage: mcr-cli debug-prompt <templateName> <inputVariablesJson>'
    );
    return;
  }

  let inputVariables;
  try {
    inputVariables = JSON.parse(inputVariablesJson);
  } catch (e) {
    printError('Error: Invalid JSON string for input variables.', e.message);
    return;
  }

  try {
    const result = await apiClient.debugFormatPrompt(
      templateName,
      inputVariables
    );
    printBold(`Debugging prompt template '${result.templateName}':`);
    console.log('\n--- Raw Template ---');
    console.log(result.rawTemplate);
    console.log('\n--- Input Variables ---');
    printJson(result.inputVariables);
    console.log('\n--- Formatted Prompt ---');
    console.log(result.formattedPrompt);
  } catch (error) {
    printError(`Error debugging prompt '${templateName}':`, error.message);
    if (error.response?.data) {
      printJson(error.response.data);
    }
  }
}

function registerPromptCommands(program) {
  const promptCommand = program
    .command('prompt')
    .description('Manage and debug prompt templates');

  promptCommand
    .command('list')
    .description('List all available prompt template names')
    .action(listPromptsCommandAsync);

  promptCommand
    .command('show <templateName>')
    .description('Show the content of a specific prompt template')
    .action(showPromptCommandAsync);

  promptCommand
    .command('debug <templateName> <inputVariablesJson>')
    .description(
      'Format a prompt template with input variables (provide variables as a JSON string)'
    )
    .action(debugPromptCommandAsync);
}

module.exports = {
  // listPromptsCommand, // No longer need to export individual commands
  // showPromptCommand,
  // debugPromptCommand,
  registerPromptCommands, // Export the registration function
};
