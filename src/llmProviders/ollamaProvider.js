// new/src/llmProviders/ollamaProvider.js
const { ChatOllama } = require('@langchain/community/chat_models/ollama');
// StringOutputParser and PromptTemplate are no longer used directly in this simplified version
// const { StringOutputParser } = require('@langchain/core/output_parsers');
// const { PromptTemplate } = require('@langchain/core/prompts');
const config = require('../config');
const logger = require('../logger');

let ollamaInstance;

function getOllamaInstance() {
  if (!ollamaInstance) {
    try {
      ollamaInstance = new ChatOllama({
        // Changed from OllamaLangchain
        baseUrl: config.llm.ollama.baseURL,
        model: config.llm.ollama.model,
        // temperature: 0, // Optional: for more deterministic output
      });
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
  let fullPromptContent = systemPrompt
    ? `${systemPrompt}\n\n${userPrompt}`
    : userPrompt;

  // Rudimentary check for JSON mode - actual JSON output depends on model fine-tuning and prompt engineering
  // For more robust JSON output with Ollama, the model itself needs to support it well,
  // or you might need to use specific grammar/template features if available via Langchain/Ollama.
  if (options.jsonMode) {
    fullPromptContent +=
      '\n\nRespond ONLY with valid JSON. Do not include any explanatory text before or after the JSON object.';
    // logger.debug('Attempting JSON mode with prompt adjustment.');
  }

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

    // ChatOllama models are invoked with a list of messages or a single message string (interpreted as HumanMessage)
    // To include a system message, we must pass an array.
    const response = await ollama.invoke(messages);
    const result =
      typeof response.content === 'string'
        ? response.content
        : JSON.stringify(response.content);

    logger.debug(`Ollama generation successful. Result: "${result}"`);
    return result;
  } catch (error) {
    logger.error(`Ollama generation failed: ${error.message}`, {
      error,
      fullPromptContent,
    });
    throw new Error(`Ollama generation failed: ${error.message}`);
  }
}

module.exports = {
  name: 'ollama',
  generate,
  // Potentially add a more generic generate(promptString) if needed later
};
