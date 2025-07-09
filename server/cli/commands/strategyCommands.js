// src/cli/commands/strategyCommands.js
const { apiClient } = require('../api');
const { handleCliOutput } = require('../../util/cliUtils');

async function listStrategiesAsync(options, commandInstance) {
  const programOpts = commandInstance.parent.opts();
  const responseData = await apiClient.get('/strategies', null, programOpts);
  // Expected response: { strategies: ["Strategy1", "Strategy2"] }
  if (programOpts.json) {
    handleCliOutput(responseData, programOpts);
  } else {
    if (
      responseData &&
      responseData.strategies &&
      responseData.strategies.length > 0
    ) {
      console.log('Available translation strategies:');
      responseData.strategies.forEach((strategy) =>
        console.log(`- ${strategy}`)
      );
    } else {
      console.log('No translation strategies available.');
    }
  }
}

async function getActiveStrategyAsync(options, commandInstance) {
  const programOpts = commandInstance.parent.opts();
  const responseData = await apiClient.get(
    '/strategies/active',
    null,
    programOpts
  );
  // Expected response: { activeStrategy: "StrategyName" }
  handleCliOutput(
    responseData,
    programOpts,
    'activeStrategy',
    'Active translation strategy:\n'
  );
}

async function setStrategyAsync(strategyName, options, commandInstance) {
  const programOpts = commandInstance.parent.opts();
  const responseData = await apiClient.put(
    '/strategies/active',
    { strategyName },
    programOpts
  );
  // Expected response: { message: "...", activeStrategy: "..." }
  handleCliOutput(responseData, programOpts, 'message');
  if (!programOpts.json && responseData && responseData.activeStrategy) {
    console.log(`Active strategy is now: ${responseData.activeStrategy}`);
  }
}

module.exports = (program) => {
  const strategyCommand = program
    .command('strategy')
    .description('Manage MCR translation strategies');

  strategyCommand
    .command('list')
    .description('List available translation strategies')
    .action(listStrategiesAsync);

  strategyCommand
    .command('get-active')
    .description('Get the currently active translation strategy')
    .action(getActiveStrategyAsync);

  strategyCommand
    .command('set-active <strategyName>')
    .description('Set the active translation strategy')
    .action(setStrategyAsync);
};
