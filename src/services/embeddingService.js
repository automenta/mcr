// src/services/embeddingService.js
const logger = require('../logger');

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
 * Placeholder implementation for an Embedding Service.
 * In a real scenario, this would interface with a sentence transformer model
 * (e.g., using @xenova/transformers, a Hugging Face API, OpenAI Embeddings, etc.).
 *
 * @implements {IEmbeddingService}
 */
class EmbeddingService {
  constructor(config = {}) {
    this.config = config;
    // For mock purposes, we can define a fixed dimension for embeddings.
    this.embeddingDimension = config.embeddingDimension || 5; // Small dimension for mock
    logger.info(
      `[EmbeddingService] Initialized (mock). Embedding dimension: ${this.embeddingDimension}`
    );
  }

  /**
   * Generates a mock embedding for a single text.
   * This mock implementation generates a vector of pseudo-random numbers
   * based on the text's length and character codes.
   * @param {string} text - The text to embed.
   * @returns {Promise<EmbeddingVector>} The mock embedding vector.
   */
  async getEmbedding(text) {
    if (typeof text !== 'string') {
      throw new Error('Invalid input: text must be a string.');
    }
    // Simple mock: generate a vector based on text length and char codes
    const vector = new Array(this.embeddingDimension).fill(0);
    for (let i = 0; i < text.length; i++) {
      vector[i % this.embeddingDimension] =
        ((vector[i % this.embeddingDimension] + text.charCodeAt(i)) % 256) /
        255; // Normalize
    }
    // Ensure all values are numbers and finite, otherwise return a default vector.
    if (vector.some(isNaN) || vector.some((v) => !isFinite(v))) {
      logger.warn(
        `[EmbeddingService] Could not generate a valid mock embedding for text: "${text}". Returning zero vector.`
      );
      return new Array(this.embeddingDimension).fill(0);
    }
    return vector;
  }

  /**
   * Generates mock embeddings for multiple texts.
   * @param {string[]} texts - The texts to embed.
   * @returns {Promise<EmbeddingVector[]>} The mock embedding vectors.
   */
  async getEmbeddings(texts) {
    if (!Array.isArray(texts) || !texts.every((t) => typeof t === 'string')) {
      throw new Error('Invalid input: texts must be an array of strings.');
    }
    // For the mock, we can just call getEmbedding for each text.
    // In a real implementation, batching might be more efficient.
    return Promise.all(texts.map((text) => this.getEmbedding(text)));
  }
}

module.exports = EmbeddingService;
