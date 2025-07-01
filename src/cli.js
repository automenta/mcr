#!/usr/bin/env node

// Enable runtime transpilation for JSX/modern JS features in CLI commands
require('@babel/register');

const { Command } = require('commander');
const program = new Command();

// Import command modules
const registerSessionCommands = require('./cli/commands/sessionCommands');
const registerOntologyCommands = require('./cli/commands/ontologyCommands');
const registerTranslationCommands = require('./cli/commands/translationCommands');
const registerQueryCommands = require('./cli/commands/queryCommands');
const registerChatCommand = require('./cli/commands/chatCommand');
const registerStatusCommand = require('./cli/commands/statusCommands');
const { registerPromptCommands } = require('./cli/commands/promptCommands');
const registerDemoCommand = require('./demo'); // Import the new demo command registration function
const registerSandboxCommand = require('./sandbox'); // Import the new sandbox command registration function

program
  .name('mcr') // Changed name to 'mcr'
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
registerDemoCommand(program); // Register the new demo command
registerSandboxCommand(program); // Register the new sandbox command

// Global options can be defined here if needed, for example:
// program.option('-v, --verbose', 'Enable verbose output');

const originalCliArgs = process.argv.slice(2);

// If no command is specified (e.g., just 'mcr' run via 'node src/cli.js'), default to 'chat'.
// This needs to be done carefully to not interfere with --help or --version.
if (originalCliArgs.length === 0) {
  // This is true if 'node src/cli.js' is run with no further arguments.
  process.argv.push('chat');
} else {
  // Check if the first argument is an option (e.g., --json) and not a command.
  // This is a heuristic. A more robust way is to check against known commands.
  const firstArgIsOption = originalCliArgs[0].startsWith('-');
  let commandExists = false;
  if (!firstArgIsOption) {
    for (const command of program.commands) {
      if (
        command.name() === originalCliArgs[0] ||
        command.aliases().includes(originalCliArgs[0])
      ) {
        commandExists = true;
        break;
      }
    }
  }
  // If the first arg is an option, and no actual command follows,
  // or if there are args but none is a known command (e.g. 'mcr --json'),
  // it might still be a case for defaulting to 'chat', unless it's help/version.
  const helpOrVersionArg = originalCliArgs.find(
    (arg) =>
      arg === '--help' || arg === '-h' || arg === '--version' || arg === '-V'
  );

  if (!commandExists && firstArgIsOption && !helpOrVersionArg) {
    // e.g., 'mcr --json' should become 'mcr chat --json'
    // Find where actual command should be (after node and script path)
    const commandInsertIndex = 2; // After 'node' and 'script.js'
    process.argv.splice(commandInsertIndex, 0, 'chat');
  }
}

program.parse(process.argv);
