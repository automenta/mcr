// new/src/reasonerService.js
const config = require('./config');
const logger = require('./util/logger');
const PrologReasonerProvider = require('./reason/prologReasoner');

let selectedProvider;

function getProvider() {
  if (!selectedProvider) {
    const providerName = config.reasoner.provider.toLowerCase();
    logger.info(`Attempting to initialize Reasoner provider: ${providerName}`);
    switch (providerName) {
      case 'prolog':
        selectedProvider = PrologReasonerProvider;
        break;
      // Future reasoner providers can be added here
      default:
        logger.error(
          `Unsupported Reasoner provider configured: ${providerName}. Defaulting to Prolog.`
        );
        selectedProvider = PrologReasonerProvider; // Or throw new Error
    }
    logger.info(
      `Reasoner Service initialized with provider: ${selectedProvider.name}`
    );
  }
  return selectedProvider;
}

/**
 * Executes a query against a given knowledge base using the configured reasoner.
 * @param {string} knowledgeBase - A string containing all facts and rules for the reasoner.
 * @param {string} query - The query string for the reasoner.
 * @param {object} [options={}] - Options for execution (e.g., { limit: 10, trace: true }).
 * @returns {Promise<{results: Array<object|string|boolean>, trace: object|null}>} A promise that resolves to an object
 *          containing formatted answers and the proof trace if requested.
 * @throws {Error} If the reasoner provider is not configured or query execution fails.
 */
async function executeQuery(knowledgeBase, query, options = {}) {
  const provider = getProvider();
  if (!provider || typeof provider.executeQuery !== 'function') {
    logger.error(
      'Reasoner provider is not correctly configured or does not support executeQuery.'
    );
    throw new Error('Reasoner provider misconfiguration.');
  }

  try {
    logger.debug(
      `ReasonerService:executeQuery called with provider ${provider.name}`,
      { knowledgeBaseLen: knowledgeBase.length, query, options }
    );
    return await provider.executeQuery(knowledgeBase, query, options);
  } catch (error) {
    logger.error(
      `Error during reasoner execution with ${provider.name}: ${error.message}`,
      {
        provider: provider.name,
        query,
        error,
      }
    );
    throw error; // Re-throw to be handled by the caller
  }
}

async function validateKnowledgeBase(knowledgeBase) {
  const provider = getProvider();
  if (!provider || typeof provider.validate !== 'function') {
    logger.error(
      'Reasoner provider is not correctly configured or does not support validate.'
    );
    throw new Error('Reasoner provider misconfiguration for validate.');
  }
  try {
    logger.debug(
      `ReasonerService:validateKnowledgeBase called with provider ${provider.name}`
    );
    return await provider.validate(knowledgeBase);
  } catch (error) {
    logger.error(
      `Error during reasoner validation with ${provider.name}: ${error.message}`,
      { provider: provider.name, error }
    );
    throw error;
  }
}

module.exports = {
  executeQuery,
  validateKnowledgeBase,
};
