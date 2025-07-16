// src/services/embeddingService.js
const { GoogleGenerativeAIEmbeddings } = require('@langchain/google-genai');
const { OllamaEmbeddings } = require('@langchain/community/embeddings/ollama');
const config = require('./config');
const logger = require('./util/logger');

/**
 * @typedef {Array<number>} EmbeddingVector
 */

/**
 * @interface IEmbeddingService
 * @async
 * @function getEmbedding
 * @param {string} text - The text to embed.
 * @returns {Promise<EmbeddingVector>} The embedding vector.
 * @throws {Error} If embedding generation fails.
 *
 * @async
 * @function getEmbeddings
 * @param {string[]} texts - The texts to embed.
 * @returns {Promise<EmbeddingVector[]>} The embedding vectors.
 * @throws {Error} If embedding generation fails for any text.
 */

/**
 * Implementation of an Embedding Service that supports multiple providers (Gemini, Ollama)
 * via LangChain, falling back to a mock service if the configured provider is not supported.
 */
class Embedding {
	constructor() {
		const provider = config.llm.provider.toLowerCase();
		this.embeddingProvider = null;

		try {
			if (provider === 'gemini') {
				if (!config.llm.gemini.apiKey) {
					throw new Error(
						'Configuration Error: GEMINI_API_KEY is required for EmbeddingService when provider is Gemini.'
					);
				}
				this.embeddingProvider = new GoogleGenerativeAIEmbeddings({
					apiKey: config.llm.gemini.apiKey,
					modelName: 'embedding-001', // Recommended model for Gemini embeddings
				});
				logger.info(
					`[EmbeddingService] Initialized with GoogleGenerativeAIEmbeddings (model: embedding-001).`
				);
			} else if (provider === 'ollama') {
				this.embeddingProvider = new OllamaEmbeddings({
					model: config.llm.ollama.embeddingModel,
					baseUrl: config.llm.ollama.baseURL,
				});
				logger.info(
					`[EmbeddingService] Initialized with OllamaEmbeddings (model: ${config.llm.ollama.embeddingModel}).`
				);
			} else {
				logger.warn(
					`[EmbeddingService] Initialized with a mock service. Configured LLM provider '${provider}' is not supported for embeddings.`
				);
				this.embeddingDimension = 5; // Mock dimension
			}
		} catch (error) {
			logger.error(
				`[EmbeddingService] Failed to initialize embedding provider '${provider}': ${error.message}`
			);
			throw error;
		}
	}

	/**
	 * Generates an embedding for a single text.
	 * @param {string} text - The text to embed.
	 * @returns {Promise<EmbeddingVector>} The embedding vector.
	 */
	async getEmbedding(text) {
		if (typeof text !== 'string') {
			throw new Error('Invalid input: text must be a string.');
		}

		if (!this.embeddingProvider) {
			return this._getMockEmbedding(text);
		}

		try {
			return await this.embeddingProvider.embedQuery(text);
		} catch (error) {
			logger.error(
				`[EmbeddingService] Failed to generate embedding for text: "${text.substring(0, 30)}..."`,
				{ error }
			);
			throw new Error(`Embedding generation failed: ${error.message}`);
		}
	}

	/**
	 * Generates embeddings for multiple texts in a batch.
	 * @param {string[]} texts - The texts to embed.
	 * @returns {Promise<EmbeddingVector[]>} The embedding vectors.
	 */
	async getEmbeddings(texts) {
		if (!Array.isArray(texts) || !texts.every(t => typeof t === 'string')) {
			throw new Error('Invalid input: texts must be an array of strings.');
		}

		if (!this.embeddingProvider) {
			return Promise.all(texts.map(text => this._getMockEmbedding(text)));
		}

		try {
			return await this.embeddingProvider.embedDocuments(texts);
		} catch (error) {
			logger.error(
				`[EmbeddingService] Failed to generate embeddings for a batch of ${texts.length} texts.`,
				{ error }
			);
			throw new Error(`Batch embedding generation failed: ${error.message}`);
		}
	}

	/**
	 * Generates a mock embedding for a single text. Used when no real provider is configured.
	 * @param {string} text - The text to embed.
	 * @returns {Promise<EmbeddingVector>} The mock embedding vector.
	 * @private
	 */
	async _getMockEmbedding(text) {
		const vector = new Array(this.embeddingDimension).fill(0);
		for (let i = 0; i < text.length; i++) {
			vector[i % this.embeddingDimension] =
				((vector[i % this.embeddingDimension] + text.charCodeAt(i)) % 256) /
				255; // Normalize
		}
		if (vector.some(isNaN) || vector.some(v => !isFinite(v))) {
			logger.warn(
				`[EmbeddingService] Could not generate a valid mock embedding for text: "${text}". Returning zero vector.`
			);
			return new Array(this.embeddingDimension).fill(0);
		}
		return vector;
	}
}

module.exports = Embedding;
