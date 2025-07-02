
const { demoLogger } = require('../../demos/demoUtils');
const { runSimpleQADemoAsync } = require('../../demos/simpleQADemo');
const {
  runFamilyOntologyDemoAsync,
} = require('../../demos/familyOntologyDemo');
const config = require('../../config'); // To log LLM provider
// Note: The old demo.js had logic to initialize mcrCore with a modified config (log level).
// The new services (mcrService, ontologyService) are generally stateless or configure from require('./config').
// If specific per-demo setup for services is needed, it would have to be added.
// For now, demos will use the globally configured services.

async function runDemoAction(demoName, options, commandInstance) {
  // const programOpts = commandInstance.parent.optsWithGlobals(); // For global CLI opts if needed

  demoLogger.step('Initializing MCR Services for Demo...');
  // In the new model, services are typically ready on require, using the shared config.
  // No explicit mcrService.init(config) is present or typically needed unless we redesign services.
  // We can log the LLM provider from the loaded config.
  if (config.llm && config.llm.provider) {
    demoLogger.success('MCR Services assumed initialized.');
    demoLogger.info(
      'LLM Used',
      `Provider: ${config.llm.provider}, Model: ${config.llm.modelName[config.llm.provider] || 'N/A (Check Config)'}`
    );
  } else {
    demoLogger.error(
      'LLM configuration not found. Demo might not function correctly.'
    );
  }

  // demoLogger.info('Demo Specific Options', options); // Options from commander for the specific demo call

  if (demoName.toLowerCase() === 'simpleqa') {
    await runSimpleQADemoAsync();
  } else if (
    demoName.toLowerCase() === 'family' ||
    demoName.toLowerCase() === 'familyontology'
  ) {
    await runFamilyOntologyDemoAsync();
  } else {
    demoLogger.error(`Unknown demo: ${demoName}. Available: simpleQA, family`);
    console.log('\nAvailable demos are: simpleQA, family');
    process.exit(1);
  }
}

module.exports = (program) => {
  const cmd = program.command('demo').description('Run predefined MCR demos');

  cmd
    .command('run <demoName>')
    .description('Run a specific demo. Available: simpleQA, family')
    // Add any demo-specific options here if needed in the future
    .action(runDemoAction);
};
