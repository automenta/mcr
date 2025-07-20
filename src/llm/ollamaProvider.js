// new/src/llmProviders/ollamaProvider.js
const { ChatOllama } = require('@langchain/community/chat_models/ollama');
const logger = require('../util/logger');

let ollamaInstance;

function configureOllama(config) {
	if (!ollamaInstance) {
		try {
			logger.debug('[OllamaProvider] Attempting to instantiate ChatOllama...');
			ollamaInstance = new ChatOllama({
				baseUrl: config.llm.ollama.baseURL,
				model: config.llm.ollama.model,
			});
			logger.debug('[OllamaProvider] ChatOllama instantiated successfully.');
			logger.info(
				`Ollama provider initialized with model ${config.llm.ollama.model} at ${config.llm.ollama.baseURL}`
			);
		} catch (error) {
			logger.error(`Failed to initialize Ollama provider: ${error.message}`, {
				error,
			});
			throw new Error(`Ollama initialization failed: ${error.message}`);
		}
	}
}

function getOllamaInstance() {
	if (!ollamaInstance) {
		throw new Error(
			'Ollama provider not configured. Please call configureOllama first.'
		);
	}
	return ollamaInstance;
}

/**
 * Generates text using the Ollama model based on a structured prompt.
 * @param {string} systemPrompt - The system message or instructions.
 * @param {string} userPrompt - The user's query or input.
 * @param {object} [options={}] - Additional options.
 * @param {boolean} [options.jsonMode=false] - Whether to instruct the model to output JSON.
 * (Note: Actual JSON mode enforcement depends on model capabilities and specific prompting)
 * @returns {Promise<string>} The generated text.
 */
async function generate(systemPrompt, userPrompt, options = {}) {
	const ollama = getOllamaInstance();
	// let fullPromptContent = systemPrompt // This variable is unused
	//   ? `${systemPrompt}\n\n${userPrompt}`
	//   : userPrompt;

	// Rudimentary check for JSON mode - actual JSON output depends on model fine-tuning and prompt engineering
	// For more robust JSON output with Ollama, the model itself needs to support it well,
	// or you might need to use specific grammar/template features if available via Langchain/Ollama.
	// if (options.jsonMode) { // fullPromptContent is not defined, so this block is problematic
	// fullPromptContent +=
	//   '\n\nRespond ONLY with valid JSON. Do not include any explanatory text before or after the JSON object.';
	// logger.debug('Attempting JSON mode with prompt adjustment.');
	// }

	const { HumanMessage, SystemMessage } = require('@langchain/core/messages');

	const messages = [];
	if (systemPrompt) {
		messages.push(new SystemMessage(systemPrompt));
	}
	messages.push(new HumanMessage(userPrompt)); // userPrompt is the core content.

	// If options.jsonMode is true, we might append to the last message or add a specific instruction.
	// For now, the jsonMode instruction is appended to userPrompt by mcrService or strategy.
	// Let's assume userPrompt (which becomes fullPromptContent if no systemPrompt) already has JSON instructions.

	try {
		logger.debug(`Ollama generating with messages:`, { messages, options });

		const invokePromise = ollama.invoke(messages);
		const timeoutPromise = new Promise(
			(_, reject) =>
				setTimeout(
					() => reject(new Error('Ollama request timed out after 20 seconds')),
					20000
				) // 20s timeout
		);

		// Race the invoke promise against the timeout
		const response = await Promise.race([invokePromise, timeoutPromise]);

		const textResult =
			typeof response.content === 'string'
				? response.content
				: JSON.stringify(response.content);

		let costData = null;
		if (response.response_metadata) {
			// Typical Ollama metadata keys:
			// response.response_metadata.total_duration
			// response.response_metadata.load_duration
			// response.response_metadata.prompt_eval_count
			// response.response_metadata.prompt_eval_duration
			// response.response_metadata.eval_count (completion tokens)
			// response.response_metadata.eval_duration
			costData = {
				prompt_tokens: response.response_metadata.prompt_eval_count,
				completion_tokens: response.response_metadata.eval_count,
				total_tokens:
					(response.response_metadata.prompt_eval_count || 0) +
					(response.response_metadata.eval_count || 0),
				raw_metadata: response.response_metadata, // Store raw metadata for more detailed analysis if needed
			};
			logger.debug(
				`Ollama generation successful. Result: "${textResult.substring(0, 100)}..."`,
				{ costData }
			);
		} else {
			logger.debug(
				`Ollama generation successful but no response_metadata found. Result: "${textResult.substring(0, 100)}..."`
			);
		}
		return { text: textResult, costData };
	} catch (error) {
		logger.error(`Ollama generation failed: ${error.message}`, {
			error,
			messages, // Log messages instead of fullPromptContent which is not in this scope
		});
		// Ensure the error message clearly indicates a timeout if that was the cause
		throw new Error(`Ollama generation failed: ${error.message}`);
	}
}

module.exports = {
	name: 'ollama',
	generate,
	configureOllama,
	// Potentially add a more generic generate(promptString) if needed later
};
