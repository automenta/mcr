#!/usr/bin/env node

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

// Global options can be defined here if needed, for example:
// program.option('-v, --verbose', 'Enable verbose output');

program.parse(process.argv);

// If no command is specified (e.g., just 'mcr' or 'mcr --option'), default to 'chat'.
// Commander will have already handled --help, --version, or unknown commands/options by this point
// and may have exited. So, we only proceed if program.args is empty, indicating no command was run.
if (!program.args.length) {
    const args = process.argv.slice(2);
    let commandSpecified = false;

    // Check if any of the known command names are in the arguments
    for (const command of program.commands) {
        if (args.includes(command.name())) {
            commandSpecified = true;
            break;
        }
    }

    // Only if no command was specified, inject 'chat' and re-parse.
    // This avoids issues if `mcr --help` or `mcr --version` was called, as Commander handles these and exits.
    // It also avoids issues if an invalid option was passed, where Commander would show an error.
    // This logic assumes that if `program.args` is empty, no command action was executed.
    if (!commandSpecified) {
        // Check if process.argv includes options that would cause an exit (handled by Commander)
        // For example, --help or --version. If these are present, do not default to chat.
        const helpOrVersionArg = args.find(arg => arg === '--help' || arg === '-h' || arg === '--version' || arg === '-V');

        if(!helpOrVersionArg) {
            const newArgs = ['chat', ...args];
            // Update process.argv for the re-parse
            process.argv = [process.argv[0], process.argv[1], ...newArgs];
            program.parse(process.argv);
        }
    }
}
