// src/evolution/semanticInputRouter.js
const logger = require('../logger');
const { MCRError, ErrorCodes } = require('../errors');
const { inputArchetypes } = require('./semanticArchetypes');

// Default classification if no archetype matches well enough or in case of errors
const DEFAULT_SEMANTIC_ASSERT_CLASS = 'general_assert';
const DEFAULT_SEMANTIC_QUERY_CLASS = 'general_query'; // Fallback, though ideally archetypes cover queries

class SemanticInputRouter {
  /**
   * @param {object} db - The database instance.
   * @param {import('../services/embeddingService').IEmbeddingService} embeddingService - Service to generate text embeddings.
   */
  constructor(db, embeddingService) {
    if (!db) {
      throw new MCRError(
        ErrorCodes.INTERNAL_ERROR,
        'SemanticInputRouter requires a database instance.'
      );
    }
    if (!embeddingService) {
      throw new MCRError(
        ErrorCodes.INTERNAL_ERROR,
        'SemanticInputRouter requires an embedding service instance.'
      );
    }
    this.db = db;
    this.embeddingService = embeddingService;
    this.archetypeEmbeddingsCache = null; // To store pre-computed embeddings for archetypes
    logger.info(
      '[SemanticInputRouter] Initialized with database and embedding service.'
    );
  }

  /**
   * Calculates the cosine similarity between two vectors.
   * @param {number[]} vecA - The first vector.
   * @param {number[]} vecB - The second vector.
   * @returns {number} The cosine similarity, or 0 if input is invalid.
   */
  cosineSimilarity(vecA, vecB) {
    if (
      !vecA ||
      !vecB ||
      vecA.length !== vecB.length ||
      vecA.length === 0
    ) {
      logger.warn('[SemanticInputRouter] Invalid input for cosineSimilarity.');
      return 0;
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    const magnitudeA = Math.sqrt(normA);
    const magnitudeB = Math.sqrt(normB);

    if (magnitudeA === 0 || magnitudeB === 0) {
      // logger.debug('[SemanticInputRouter] Zero magnitude vector in cosineSimilarity.');
      return 0; // Or handle as an error/special case
    }

    const similarity = dotProduct / (magnitudeA * magnitudeB);
    // Clamp similarity to [-1, 1] due to potential floating point inaccuracies
    return Math.max(-1, Math.min(1, similarity));
  }

  /**
   * Pre-computes and caches embeddings for all defined input archetypes.
   * Uses the 'description' field of each archetype.
   */
  async _initializeArchetypeEmbeddings() {
    if (this.archetypeEmbeddingsCache) {
      return;
    }
    logger.info(
      '[SemanticInputRouter] Initializing archetype embeddings...'
    );
    this.archetypeEmbeddingsCache = new Map();
    try {
      const descriptions = inputArchetypes.map(arch => arch.description);
      const embeddings = await this.embeddingService.getEmbeddings(descriptions);

      for (let i = 0; i < inputArchetypes.length; i++) {
        this.archetypeEmbeddingsCache.set(inputArchetypes[i].id, embeddings[i]);
      }
      logger.info(
        '[SemanticInputRouter] Archetype embeddings initialized and cached.'
      );
    } catch (error) {
      logger.error(
        `[SemanticInputRouter] Failed to initialize archetype embeddings: ${error.message}`,
        { stack: error.stack }
      );
      // Invalidate cache so it can be retried, or handle error appropriately
      this.archetypeEmbeddingsCache = null;
      throw new MCRError(
        ErrorCodes.EMBEDDING_SERVICE_ERROR,
        'Failed to generate embeddings for semantic archetypes.'
      );
    }
  }

  /**
   * Classifies the input text by finding the closest semantic archetype.
   * @param {string} naturalLanguageText - The input text.
   * @returns {Promise<string>} The ID of the determined input archetype (e.g., "definition_request").
   */
  async classifyInput(naturalLanguageText) {
    if (!naturalLanguageText || naturalLanguageText.trim() === '') {
        logger.warn('[SemanticInputRouter] classifyInput called with empty text.');
        // Decide on a sensible default, perhaps based on a simple heuristic like KeywordInputRouter
        // For now, returning a general assertion as a fallback.
        return DEFAULT_SEMANTIC_ASSERT_CLASS;
    }

    await this._initializeArchetypeEmbeddings();
    if (!this.archetypeEmbeddingsCache) {
      logger.error(
        '[SemanticInputRouter] Archetype embeddings not available for classification. Falling back.'
      );
      // Fallback to a keyword-based classification or a default
      // This simplistic fallback mirrors KeywordInputRouter's basic logic
      return naturalLanguageText.includes('?') ? DEFAULT_SEMANTIC_QUERY_CLASS : DEFAULT_SEMANTIC_ASSERT_CLASS;
    }

    try {
      const inputEmbedding = await this.embeddingService.getEmbedding(
        naturalLanguageText
      );

      let bestMatchArchetypeId = null;
      let maxSimilarity = -Infinity; // Cosine similarity is between -1 and 1

      for (const archetype of inputArchetypes) {
        const archetypeEmbedding = this.archetypeEmbeddingsCache.get(archetype.id);
        if (!archetypeEmbedding) {
          logger.warn(`[SemanticInputRouter] Missing embedding for archetype: ${archetype.id}. Skipping.`);
          continue;
        }

        const similarity = this.cosineSimilarity(inputEmbedding, archetypeEmbedding);
        logger.debug(`[SemanticInputRouter] Similarity with ${archetype.id}: ${similarity.toFixed(4)} for text: "${naturalLanguageText.substring(0,30)}..."`);

        if (similarity > maxSimilarity) {
          maxSimilarity = similarity;
          bestMatchArchetypeId = archetype.id;
        }
      }

      // TODO: Add a threshold? If maxSimilarity is too low, maybe fallback to a general class?
      // For now, always return the best match.
      if (bestMatchArchetypeId) {
        logger.info(
          `[SemanticInputRouter] Classified input as '${bestMatchArchetypeId}' with similarity ${maxSimilarity.toFixed(4)} for text: "${naturalLanguageText.substring(0,50)}..."`
        );
        return bestMatchArchetypeId;
      } else {
        logger.warn(
          `[SemanticInputRouter] No archetype found for input: "${naturalLanguageText.substring(0,50)}...". Falling back.`
        );
        // Fallback logic if no match (should ideally not happen if archetypes are comprehensive)
        return naturalLanguageText.includes('?') ? DEFAULT_SEMANTIC_QUERY_CLASS : DEFAULT_SEMANTIC_ASSERT_CLASS;
      }
    } catch (error) {
      logger.error(
        `[SemanticInputRouter] Error during semantic classification: ${error.message}`,
        { stack: error.stack }
      );
      // Fallback in case of error during embedding generation for the input text
      return naturalLanguageText.includes('?') ? DEFAULT_SEMANTIC_QUERY_CLASS : DEFAULT_SEMANTIC_ASSERT_CLASS;
    }
  }

  /**
   * Queries the Performance Database for the best strategy_hash for the given input class (archetype ID) and LLM.
   * This method is adapted from KeywordInputRouter and may need adjustments for semantic classes.
   * @param {string} inputClass - The semantic archetype ID (e.g., "definition_request").
   * @param {string} llmModelId - The ID of the LLM being used.
   * @returns {Promise<string|null>} The strategy_hash of the best performing strategy, or null if none found.
   */
  async getBestStrategy(inputClass, llmModelId) {
    logger.debug(
      `[SemanticInputRouter] Getting best strategy for inputClass (archetype): "${inputClass}", llmModelId: "${llmModelId}"`
    );

    try {
      // The 'inputClass' is now a semantic archetype ID.
      // The 'performance_results' table's 'input_type' column should store these archetype IDs
      // for strategies evaluated against semantic inputs.
      const targetInputType = inputClass;

      const query = `
        SELECT strategy_hash, metrics, latency_ms, cost
        FROM performance_results
        WHERE (llm_model_id = ? OR llm_model_id IS NULL OR llm_model_id = '')
          AND input_type = ?;
      `;
      // Fetch results filtered by llmModelId (or generic) AND input_type (semantic archetype)
      const relevantResults = await this.db.queryPerformanceResults(query, [
        llmModelId,
        targetInputType,
      ]);

      if (!relevantResults || relevantResults.length === 0) {
        logger.info(
          `[SemanticInputRouter] No performance results found for llmModelId "${llmModelId}" (or generic) and input_type (archetype) "${targetInputType}".`
        );
        return null;
      }

      // Aggregate scores per strategy_hash (logic reused from KeywordInputRouter)
      const strategyScores = new Map();
      for (const row of relevantResults) {
        try {
          const metrics = JSON.parse(row.metrics);
          const cost = JSON.parse(row.cost || '{}');

          let successScore = 0;
          if (metrics.exactMatchProlog === 1 || metrics.exactMatchProlog === true) successScore += 1;
          if (metrics.exactMatchAnswer === 1 || metrics.exactMatchAnswer === true) successScore += 1;
          if (metrics.prologStructureMatch === 1 || metrics.prologStructureMatch === true) successScore += 0.5;

          const latencyScore = row.latency_ms > 0 ? 1000 / (row.latency_ms + 1) : 1;
          const costValue = cost.input_tokens || cost.total_tokens || 0;
          const costScore = costValue > 0 ? 1000 / (costValue + 1) : 1;

          const W_SUCCESS = 100;
          const W_LATENCY = 10;
          const W_COST = 1;
          const currentScore = successScore * W_SUCCESS + latencyScore * W_LATENCY + costScore * W_COST;

          if (!strategyScores.has(row.strategy_hash)) {
            strategyScores.set(row.strategy_hash, {
              totalScore: 0,
              count: 0,
              totalLatency: 0,
              totalCostTokens: 0,
              successCount: 0,
            });
          }
          const agg = strategyScores.get(row.strategy_hash);
          agg.totalScore += currentScore;
          agg.count++;
          agg.totalLatency += row.latency_ms || 0;
          agg.totalCostTokens += costValue;
          if (successScore > 0) agg.successCount++;
        } catch (e) {
          logger.warn(
            `[SemanticInputRouter] Failed to parse metrics/cost or calculate score: ${e.message}`,
            { strategy_hash: row.strategy_hash, example_id: row.example_id } // example_id might not be relevant here if we group by input_type
          );
        }
      }

      if (strategyScores.size === 0) {
        logger.info(
          '[SemanticInputRouter] No strategies with valid scores after processing results.'
        );
        return null;
      }

      // Find the best strategy (logic reused from KeywordInputRouter)
      let bestStrategyHash = null;
      let maxAvgScore = -Infinity;
      strategyScores.forEach((agg, hash) => {
        const avgScore = agg.count > 0 ? agg.totalScore / agg.count : 0;
        logger.debug(
          `[SemanticInputRouter] Strategy ${hash}: Avg Score=${avgScore.toFixed(2)}, Successes=${agg.successCount}/${agg.count}, Avg Latency=${(agg.totalLatency / agg.count).toFixed(0)}ms, Avg Tokens=${(agg.totalCostTokens / agg.count).toFixed(0)} (for archetype ${targetInputType})`
        );

        if (avgScore > maxAvgScore) {
          maxAvgScore = avgScore;
          bestStrategyHash = hash;
        } else if (avgScore === maxAvgScore && bestStrategyHash) {
          // Tie-breaking logic (reused)
          const currentBestAgg = strategyScores.get(bestStrategyHash);
          if (agg.successCount > currentBestAgg.successCount) {
            bestStrategyHash = hash;
          } else if (agg.successCount === currentBestAgg.successCount) {
            const avgLatency = agg.totalLatency / agg.count;
            const currentBestAvgLatency = currentBestAgg.totalLatency / currentBestAgg.count;
            if (avgLatency < currentBestAvgLatency) {
              bestStrategyHash = hash;
            } else if (avgLatency === currentBestAvgLatency) {
              const avgCost = agg.totalCostTokens / agg.count;
              const currentBestAvgCost = currentBestAgg.totalCostTokens / currentBestAgg.count;
              if (avgCost < currentBestAvgCost) {
                bestStrategyHash = hash;
              }
            }
          }
        }
      });

      if (bestStrategyHash) {
        logger.info(
          `[SemanticInputRouter] Best strategy selected: ${bestStrategyHash} with average score ${maxAvgScore.toFixed(2)} for archetype "${targetInputType}", llmModelId "${llmModelId}"`
        );
      } else {
        logger.info(
          `[SemanticInputRouter] No best strategy found after aggregation for archetype "${targetInputType}", llmModelId "${llmModelId}".`
        );
      }
      return bestStrategyHash;
    } catch (error) {
      logger.error(
        `[SemanticInputRouter] Error getting best strategy: ${error.message}`,
        { stack: error.stack }
      );
      return null;
    }
  }

  /**
   * Determines the best strategy for a given natural language input using semantic classification.
   * @param {string} naturalLanguageText - The input text.
   * @param {string} llmModelId - The ID of the LLM to be used.
   * @returns {Promise<string|null>} The strategy_hash of the recommended strategy, or null.
   */
  async route(naturalLanguageText, llmModelId) {
    logger.info(
      `[SemanticInputRouter] Routing input: "${naturalLanguageText.substring(0, 50)}...", Model: "${llmModelId}"`
    );
    if (!naturalLanguageText || !llmModelId) {
      logger.warn(
        '[SemanticInputRouter] Route called with missing naturalLanguageText or llmModelId.'
      );
      return null;
    }

    const inputClass = await this.classifyInput(naturalLanguageText); // This is now an archetype ID
    const strategyHash = await this.getBestStrategy(inputClass, llmModelId);

    if (strategyHash) {
      logger.info(
        `[SemanticInputRouter] Recommended strategy HASH: ${strategyHash.substring(0,12)}... for semantic input class "${inputClass}"`
      );
    } else {
      logger.info(
        `[SemanticInputRouter] No specific strategy recommendation for semantic class "${inputClass}". Fallback will be used by MCR.`
      );
    }
    return strategyHash;
  }
}

module.exports = SemanticInputRouter;
