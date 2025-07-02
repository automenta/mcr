
const { apiClient } = require('../api');
const { handleCliOutput, printJson } = require('../../cliUtils'); // Using new cliUtils

async function listPromptsAsync(options, commandInstance) {
  const programOpts = commandInstance.parent.opts();
  // apiClient.get will handle errors or return response.data
  const templates = await apiClient.get('/prompts', null, programOpts);

  if (programOpts.json) {
    handleCliOutput(templates, programOpts);
  } else {
    if (templates && Object.keys(templates).length === 0) {
      console.log('No prompt templates found.');
      return;
    }
    console.log('Available prompt templates:');
    Object.keys(templates || {}).forEach((name) => {
      console.log(`- ${name}`);
    });
  }
}

async function showPromptAsync(templateName, options, commandInstance) {
  const programOpts = commandInstance.parent.opts();
  // templateName is validated by Commander if it's a required arg

  const templates = await apiClient.get('/prompts', null, programOpts);

  if (!templates || !templates[templateName]) {
    console.error(`Error: Prompt template '${templateName}' not found.`);
    if (!programOpts.json && templates) {
      console.log('Available templates are:');
      Object.keys(templates).forEach((name) => console.log(`- ${name}`));
    }
    process.exit(1); // Exit if template not found after successful API call
  }

  if (programOpts.json) {
    // Show only the requested template in JSON output
    handleCliOutput({ [templateName]: templates[templateName] }, programOpts);
  } else {
    console.log(`Content of prompt template '${templateName}':`);
    // Assuming the template content is a string. If it can be an object (e.g. system/user parts):
    if (typeof templates[templateName] === 'object') {
      printJson(templates[templateName]);
    } else {
      console.log(templates[templateName]);
    }
  }
}

async function debugPromptAsync(
  templateName,
  inputVariablesJson,
  options,
  commandInstance
) {
  const programOpts = commandInstance.parent.opts();
  // templateName and inputVariablesJson are validated by Commander if required args

  let inputVariables;
  try {
    inputVariables = JSON.parse(inputVariablesJson);
  } catch (e) {
    console.error('Error: Invalid JSON string for input variables.');
    console.error(e.message);
    process.exit(1);
  }

  const responseData = await apiClient.post(
    '/debug/format-prompt',
    {
      templateName,
      inputVariables,
    },
    programOpts
  );

  if (programOpts.json) {
    handleCliOutput(responseData, programOpts);
  } else {
    // Assuming responseData matches old README: { templateName, rawTemplate, inputVariables, formattedPrompt }
    console.log(`Debugging prompt template '${responseData.templateName}':`);

    // The rawTemplate in old mcrService was an object { system, user }
    // The old CLI just printed it. Let's check old/README.md again.
    // GET /prompts returns { "NL_TO_RULES": "You are an expert AI..." } -> string
    // POST /debug/format-prompt response { "rawTemplate": "Translate the natural language question..."} -> string
    // It seems rawTemplate in the debug response is just the template string, not an object.
    // However, old/src/mcrCore.js `getPrompts` implies prompts are objects.
    // Let's assume the API `/prompts` returns { "T_NAME": { system: "...", user: "..." } }
    // and `/debug/format-prompt` `rawTemplate` field also contains this object.
    // The `mcrService.js` `getPrompts` returns the whole prompts object structure.
    // The `mcrService.js` `debugFormatPrompt` returns `rawTemplate` as the template object.

    console.log('\\n--- Raw Template ---');
    if (typeof responseData.rawTemplate === 'object') {
      printJson(responseData.rawTemplate);
    } else {
      console.log(responseData.rawTemplate);
    }

    console.log('\\n--- Input Variables ---');
    printJson(responseData.inputVariables); // Pretty print JSON

    console.log('\\n--- Formatted User Prompt ---'); // Changed from "Formatted Prompt"
    // The new mcrService.debugFormatPrompt returns "formattedUserPrompt"
    console.log(
      responseData.formattedUserPrompt || responseData.formattedPrompt
    ); // Fallback if old field name is used
  }
}

// Changed from registerPromptCommands to match other modules' export style
module.exports = (program) => {
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
};
