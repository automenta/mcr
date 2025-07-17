// new/src/llmService.js
const config = require('./config');
const logger = require('./util/logger');
const OllamaProvider = require('./llm/ollamaProvider');
const GeminiProvider = require('./llm/geminiProvider');

let selectedProvider;

function forceReinitializeProvider() {
	selectedProvider = null;
	logger.info(
		'[llmService] Provider selection has been reset. Will re-initialize on next call to getProvider().'
	);
}

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
			//   // const OpenAiProvider = require('./llmProviders/openaiProvider'); // Ensure this file exists and is correct
			//   // selectedProvider = OpenAiProvider;
			//   // break;
			// case 'anthropic':
			//   // const AnthropicProvider = require('./llmProviders/anthropicProvider'); // Ensure this file exists and is correct
			//   // selectedProvider = AnthropicProvider;
			//   // break;
			default:
				// logger.error( // Previous behavior
				//   `Unsupported LLM provider configured: ${providerName}. Defaulting to Ollama.`
				// );
				// selectedProvider = OllamaProvider; // Previous fallback
				throw new Error(
					`Configuration Error: Unsupported LLM provider configured: "${providerName}". Supported providers are "ollama", "gemini".` // Add future supported ones here.
				);
		}
		// This log will only be reached if a supported provider is successfully selected.
		logger.info(
			`LLM Service initialized with provider: ${selectedProvider.name}.`
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
 * @returns {Promise<{text: string, costData: object | null}>} The generated text and cost data from the LLM.
 * @throws {Error} If the provider is not configured or generation fails.
 */
async function generate(systemPrompt, userPrompt, options = {}, input = {}) {
	if (input.embed) {
		userPrompt += `\nEmbeddings context: ${JSON.stringify(input.embed)}`;
	}

	const provider = getProvider();
	if (!provider || typeof provider.generate !== 'function') {
		logger.error(
			'LLM provider is not correctly configured or does not support a generate function.'
		);
		throw new Error('LLM provider misconfiguration.');
	}

	try {
		// logger.debug(`LLMService:generate called with provider ${provider.name}`, { systemPrompt, userPrompt, options });
		// Provider's generate method now returns an object { text: string, costData: object | null }
		const result = await provider.generate(systemPrompt, userPrompt, options);
		if (typeof result === 'string') {
			// This case handles providers that might not have been updated yet to return costData.
			// It's a fallback for backward compatibility during transition.
			logger.warn(
				`[llmService] Provider ${provider.name} returned a string instead of {text, costData} object. Assuming no cost data.`
			);
			return { text: result, costData: null };
		}
		return result;
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
	forceReinitializeProvider,
	// Expose getProvider for potential direct use or testing if needed
	// getProviderInstance: getProvider
};
