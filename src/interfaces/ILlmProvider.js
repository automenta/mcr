// src/interfaces/ILlmProvider.js

/**
 * @interface ILlmProvider
 * Defines the contract for an LLM (Large Language Model) provider.
 * An LLM provider is responsible for interacting with an underlying LLM service
 * to generate text based on prompts.
 */

/**
 * Generates text content based on a system prompt and a user prompt.
 * @function generate
 * @memberof ILlmProvider
 * @instance
 * @async
 * @param {string} systemPrompt - The system-level instructions or context for the LLM.
 * @param {string} userPrompt - The user-provided prompt or question.
 * @param {object} [options] - Optional parameters for the LLM generation (e.g., model, temperature, jsonMode).
 * @param {boolean} [options.jsonMode] - Hint to the LLM if the provider supports it, to structure output as JSON.
 * @returns {Promise<{text: string, costData: object | null}>} A promise that resolves to an object containing
 *          the LLM's generated text and cost data (e.g., token counts).
 *          `costData` might be null if the provider cannot supply it.
 *          Example `costData`: `{ prompt_tokens: number, completion_tokens: number, total_tokens: number }`
 * @throws {Error} If the LLM call fails or returns an error.
 */

/**
 * Gets the name of the LLM provider.
 * @function getName
 * @memberof ILlmProvider
 * @instance
 * @returns {string} The name of the LLM provider (e.g., "openai", "ollama").
 */

// Note: Since JavaScript doesn't have formal interfaces, this file serves as documentation
// for the expected structure of an LLM provider class or module.
// The existing llmService.js should be adapted or checked to conform to this,
// particularly its `generate` function.
// Example:
// const MyLlmProvider = {
//   name: 'myllm',
//   async generate(systemPrompt, userPrompt, options) { /* ... */ return "generated text"; }
// };
// module.exports = MyLlmProvider;
//
// Or for a class:
// class MyLlmProviderClass {
//   getName() { return 'myllm'; }
//   async generate(systemPrompt, userPrompt, options) { /* ... */ return "generated text"; }
// }
// module.exports = MyLlmProviderClass;

// The current `llmService.js` acts as a facade that selects a provider.
// The actual providers like `geminiProvider.js` and `ollamaProvider.js`
// should ideally implement the core `generate` logic consistent with this interface.
// `llmService.js`'s `generate` function would then call the selected provider's `generate`.
