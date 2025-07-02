// new/src/reasonerService.js
const config = require('./config');
const logger = require('./logger');
const PrologReasonerProvider = require('./reasonerProviders/prologReasoner');

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
 * @param {number} [limit=10] - Maximum number of answers to retrieve.
 * @returns {Promise<Array<object|string|boolean>>} A promise that resolves to an array of formatted answers.
 * @throws {Error} If the reasoner provider is not configured or query execution fails.
 */
async function executeQuery(knowledgeBase, query, limit = 10) {
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
      { knowledgeBaseLen: knowledgeBase.length, query, limit }
    );
    return await provider.executeQuery(knowledgeBase, query, limit);
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

module.exports = {
  executeQuery,
};
