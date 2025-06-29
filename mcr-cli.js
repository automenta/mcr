#!/usr/bin/env node

const { Command } = require('commander');
const program = new Command();

// Import command modules
const registerSessionCommands = require('./src/cli/commands/sessionCommands');
const registerOntologyCommands = require('./src/cli/commands/ontologyCommands');
const registerTranslationCommands = require('./src/cli/commands/translationCommands');
const registerQueryCommands = require('./src/cli/commands/queryCommands');
const registerChatCommand = require('./src/cli/commands/chatCommand');
const registerStatusCommand = require('./src/cli/commands/statusCommands');
const { registerPromptCommands } = require('./src/cli/commands/promptCommands');
const { registerAgentCommand } = require('./src/cli/commands/agentCommand'); // Import the new command

program
  .name('mcr-cli')
  .description('CLI for the Model Context Reasoner (MCR) API')
  .version('2.1.0')
  .option('--json', 'Output raw JSON responses from the API');

// Register commands from modules
registerSessionCommands(program);
registerOntologyCommands(program);
registerTranslationCommands(program);
registerQueryCommands(program);
registerChatCommand(program);
registerStatusCommand(program);
registerPromptCommands(program);
registerAgentCommand(program); // Register the new agent command

// Global options can be defined here if needed, for example:
// program.option('-v, --verbose', 'Enable verbose output');

program.parse(process.argv);

// Handle cases where no command is given or an unknown command is used
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
