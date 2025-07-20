// new/src/llmProviders/geminiProvider.js
const { ChatGoogleGenerativeAI } = require('@langchain/google-genai');
const { HumanMessage, SystemMessage } = require('@langchain/core/messages');
const logger = require('../util/logger');

let geminiInstance;

function configureGemini(config) {
	if (!geminiInstance) {
		if (!config.llm.gemini.apiKey) {
			logger.error('Gemini API key is not configured.');
			throw new Error('Gemini API key is missing. Please set GEMINI_API_KEY.');
		}
		try {
			geminiInstance = new ChatGoogleGenerativeAI({
				apiKey: config.llm.gemini.apiKey,
				modelName: config.llm.gemini.model,
			});
			logger.info(
				`Gemini provider initialized with model ${config.llm.gemini.model}`
			);
		} catch (error) {
			logger.error(`Failed to initialize Gemini provider: ${error.message}`, {
				error,
			});
			throw new Error(`Gemini initialization failed: ${error.message}`);
		}
	}
}

function getGeminiInstance() {
	if (!geminiInstance) {
		throw new Error(
			'Gemini provider not configured. Please call configureGemini first.'
		);
	}
	return geminiInstance;
}

/**
 * Generates text using the Gemini model based on a structured prompt.
 * @param {string} systemPrompt - The system message or instructions.
 * @param {string} userPrompt - The user's query or input.
 * @param {object} [options={}] - Additional options.
 * @param {boolean} [options.jsonMode=false] - Whether to instruct the model to output JSON.
 * (Note: Gemini has specific ways to enable JSON mode, often via `response_mime_type`)
 * @returns {Promise<string>} The generated text.
 */
async function generate(systemPrompt, userPrompt, options = {}) {
	const gemini = getGeminiInstance();
	const messages = [];

	if (systemPrompt) {
		messages.push(new SystemMessage(systemPrompt));
	}
	messages.push(new HumanMessage(userPrompt));

	const generationOptions = {};
	if (options.jsonMode) {
		// For Gemini, JSON mode is typically enabled by setting the response MIME type.
		// This might need to be passed differently depending on how ChatGoogleGenerativeAI handles it,
		// potentially in the constructor or as a specific parameter to invoke/generate.
		// As of langchainjs ~0.1.x for google-genai, it might be part of generationKwargs
		// or directly supported in newer versions.
		// For now, we'll indicate it's a common pattern for Gemini.
		// Actual implementation might require: `gemini.generationKwargs = { response_mime_type: "application/json" };`
		// or if it's a direct parameter to invoke.
		// The most straightforward way with current ChatGoogleGenerativeAI is often to ask for JSON in the prompt.
		// And ensure the model version used (e.g. gemini-1.5-pro-latest) supports it well.
		logger.info(
			'JSON mode requested for Gemini. Ensure your prompt explicitly asks for JSON output.'
		);
		// Add a more explicit instruction for JSON if systemPrompt is not already doing so.
		if (systemPrompt && !systemPrompt.toLowerCase().includes('json')) {
			messages[0] = new SystemMessage(
				systemPrompt +
					'\nRespond ONLY with valid JSON. Do not include any explanatory text before or after the JSON object.'
			);
		} else if (!systemPrompt) {
			messages.unshift(
				new SystemMessage(
					'Respond ONLY with valid JSON. Do not include any explanatory text before or after the JSON object.'
				)
			);
		}
	}

	try {
		logger.debug('Gemini generating with messages:', { messages, options });
		// Invoke directly to get the AIMessage object which might contain usage_metadata
		const aiMessage = await gemini.invoke(messages, generationOptions);
		const textResult =
			typeof aiMessage.content === 'string'
				? aiMessage.content
				: JSON.stringify(aiMessage.content);

		let costData = null;
		// Langchain often puts usage_metadata directly on the AIMessage object or within its response_metadata
		// For Gemini, it's typically `usageMetadata` (camelCase) on the AIMessage object itself.
		if (aiMessage.usageMetadata) {
			costData = {
				prompt_tokens: aiMessage.usageMetadata.promptTokenCount,
				completion_tokens: aiMessage.usageMetadata.candidatesTokenCount, // Or sometimes responseTokenCount
				total_tokens: aiMessage.usageMetadata.totalTokenCount,
				raw_metadata: aiMessage.usageMetadata,
			};
			logger.debug('Gemini generation successful.', {
				textResult: textResult.substring(0, 100) + '...',
				costData,
			});
		} else if (
			aiMessage.response_metadata &&
			aiMessage.response_metadata.usageMetadata
		) {
			// Fallback if it's nested under response_metadata
			costData = {
				prompt_tokens:
					aiMessage.response_metadata.usageMetadata.promptTokenCount,
				completion_tokens:
					aiMessage.response_metadata.usageMetadata.candidatesTokenCount,
				total_tokens: aiMessage.response_metadata.usageMetadata.totalTokenCount,
				raw_metadata: aiMessage.response_metadata.usageMetadata,
			};
			logger.debug(
				'Gemini generation successful (metadata from response_metadata).',
				{ textResult: textResult.substring(0, 100) + '...', costData }
			);
		} else {
			logger.debug(
				`Gemini generation successful but no usageMetadata found. Result: "${textResult.substring(0, 100)}..."`
			);
		}

		return { text: textResult, costData };
	} catch (error) {
		logger.error(`Gemini generation failed: ${error.message}`, {
			error,
			messages,
		});
		throw new Error(`Gemini generation failed: ${error.message}`);
	}
}

module.exports = {
	name: 'gemini',
	generate,
	configureGemini,
};
