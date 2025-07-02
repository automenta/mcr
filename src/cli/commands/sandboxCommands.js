/* eslint-disable no-console */
const { sandboxLoop } = require('../../sandbox/sandboxLogic');
// Any sandbox-specific CLI options could be processed here if added in the future.

async function runSandboxAsync(options, commandInstance) {
  // const programOpts = commandInstance.parent.optsWithGlobals(); // For global CLI opts if needed
  console.log('Starting MCR Sandbox Mode...');
  console.log('This mode assumes the MCR server is already running.');
  console.log('If not, please start it in another terminal (e.g., `mcr-cli start-server` or `node mcr.js`).');
  console.log('---');

  // Directly call the sandboxLoop.
  // sandboxLoop handles its own initialization messages for MCR services.
  await sandboxLoop();
}

module.exports = (program) => {
  program
    .command('sandbox')
    .description('Experimental sandbox for MCR. Assumes server is running.')
    // Add any sandbox specific options here if needed in the future
    // .option('-s, --sessionId <id>', 'Use an existing session ID') // Example
    .action(runSandboxAsync);
};
