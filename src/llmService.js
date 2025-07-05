// new/src/llmService.js
const config = require('./config');
const logger = require('./logger');
const OllamaProvider = require('./llmProviders/ollamaProvider');
const GeminiProvider = require('./llmProviders/geminiProvider');

let selectedProvider;

function getProvider() {
  if (!selectedProvider) {
    const providerName = config.llm.provider.toLowerCase();
    logger.info(`Attempting to initialize LLM provider: ${providerName}`);
    switch (providerName) {
      case 'ollama':
        selectedProvider = OllamaProvider;
        break;
      case 'gemini':
        selectedProvider = GeminiProvider;
        break;
      // Future providers can be added here
      // case 'openai':
      //   selectedProvider = require('./llmProviders/openaiProvider');
      //   break;
      default:
        logger.error(
          `Unsupported LLM provider configured: ${providerName}. Defaulting to Ollama.`
        );
        // Fallback or throw error
        selectedProvider = OllamaProvider; // Or throw new Error(`Unsupported LLM provider: ${providerName}`);
    }
    logger.info(
      `LLM Service initialized with provider: ${selectedProvider.name}`
    );
  }
  return selectedProvider;
}

/**
 * Generates text using the configured LLM provider.
 * This is a high-level wrapper that expects the provider to have a `generateStructured` method.
 * @param {string} systemPrompt - The system message or instructions for the LLM.
 * @param {string} userPrompt - The user's query or input.
 * @param {object} [options={}] - Additional options for the provider (e.g., jsonMode).
 * @param {boolean} [options.jsonMode=false] - Hint to the provider to format output as JSON.
 * @returns {Promise<string>} The generated text from the LLM.
 * @throws {Error} If the provider is not configured or generation fails.
 */
async function generate(systemPrompt, userPrompt, options = {}) {
  const provider = getProvider();
  if (!provider || typeof provider.generate !== 'function') {
    logger.error(
      'LLM provider is not correctly configured or does not support a generate function.'
    );
    throw new Error('LLM provider misconfiguration.');
  }

  try {
    // logger.debug(`LLMService:generate called with provider ${provider.name}`, { systemPrompt, userPrompt, options });
    return await provider.generate(systemPrompt, userPrompt, options);
  } catch (error) {
    logger.error(
      `Error during LLM generation with ${provider.name}: ${error.message}`,
      {
        provider: provider.name,
        systemPrompt,
        userPrompt,
        options,
        error,
      }
    );
    // Re-throw the error to be handled by the caller
    throw error;
  }
}

module.exports = {
  generate,
  // Expose getProvider for potential direct use or testing if needed
  // getProviderInstance: getProvider
};
