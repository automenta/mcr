const logger = require('../logger');
const { ErrorCodes, MCRError } = require('../errors');

// Placeholder for more sophisticated classification
const DEFAULT_ASSERT_CLASS = 'general_assert';
const DEFAULT_QUERY_CLASS = 'general_query';

class InputRouter {
  constructor(db) {
    if (!db) {
      throw new MCRError(ErrorCodes.INTERNAL_ERROR, 'InputRouter requires a database instance.');
    }
    this.db = db;
    logger.info('[InputRouter] Initialized with database instance.');
  }

  /**
   * Classifies the input text to determine its type (e.g., simple assertion, complex query).
   * This is a placeholder and should be replaced with more sophisticated logic.
   * @param {string} naturalLanguageText - The input text.
   * @returns {string} The determined input class.
   */
  classifyInput(naturalLanguageText) {
    // TODO: Implement more sophisticated classification logic.
    // For now, a very simple heuristic:
    // - If it contains "who", "what", "where", "when", "why", "how", or ends with "?", classify as query.
    // - Otherwise, classify as assertion.
    const nlLower = naturalLanguageText.toLowerCase();
    if (/\?$/.test(nlLower) ||
        ['who', 'what', 'where', 'when', 'why', 'how'].some(kw => nlLower.includes(kw))) {
      logger.debug(`[InputRouter] Classified input as '${DEFAULT_QUERY_CLASS}': "${naturalLanguageText}"`);
      return DEFAULT_QUERY_CLASS;
    }
    logger.debug(`[InputRouter] Classified input as '${DEFAULT_ASSERT_CLASS}': "${naturalLanguageText}"`);
    return DEFAULT_ASSERT_CLASS;
  }

  /**
   * Queries the Performance Database for the best strategy_hash for the given input class and LLM.
   * @param {string} inputClass - The class of the input (e.g., "simple_fact", "conditional_rule").
   * @param {string} llmModelId - The ID of the LLM being used.
   * @returns {Promise<string|null>} The strategy_hash of the best performing strategy, or null if none found.
   */
  async getBestStrategy(inputClass, llmModelId) {
    logger.debug(`[InputRouter] Getting best strategy for inputClass: "${inputClass}", llmModelId: "${llmModelId}"`);
    // This query will need to be refined based on the actual DB query function and performance aggregation logic.
    // Placeholder: Select the strategy with the highest exactMatchProlog (assuming 1 is best),
    // then lowest latency, then lowest cost (input_tokens).
    // This also assumes 'metrics' is a JSON field that can be queried like this, which might need adjustment
    // depending on the DB capabilities and the structure of the 'metrics' JSON.
    // The current database.js does not support direct JSON querying in this way.
    // This will be adapted once database.js is updated.

    // For now, this is a conceptual query. The actual implementation will depend on queryPerformanceResults.
    const query = `
      SELECT strategy_hash, metrics, latency_ms, cost
      FROM performance_results
      WHERE llm_model_id = ?
        AND example_id LIKE ? -- Assuming example_id might store input class or related info. This needs refinement.
      ORDER BY
        json_extract(metrics, '$.exactMatchProlog') DESC,
        latency_ms ASC,
        json_extract(cost, '$.input_tokens') ASC
      LIMIT 1;
    `;
    // The 'example_id LIKE ?' part is a placeholder for how we might link performance_results to input classes.
    // This might need a new column in performance_results or a different way to associate them.
    // For the initial implementation, we might have to fetch more data and filter/rank in JS,
    // or simplify the query if direct JSON querying is not straightforward with sqlite through the current abstraction.

    try {
      // This is a placeholder for the actual DB call.
      // const rows = await this.db.queryPerformanceResults(query, [llmModelId, `${inputClass}%`]);
      // For now, as queryPerformanceResults doesn't exist yet, we'll return null.
      logger.warn('[InputRouter] getBestStrategy: DB querying not yet implemented. Returning null.');
      return null;

      // if (rows && rows.length > 0) {
      //   const bestStrategy = rows[0];
      //   logger.info(`[InputRouter] Best strategy found: ${bestStrategy.strategy_hash} for class "${inputClass}"`);
      //   return bestStrategy.strategy_hash;
      // } else {
      //   logger.info(`[InputRouter] No specific strategy found for class "${inputClass}".`);
      //   return null;
      // }
    } catch (error) {
      logger.error(`[InputRouter] Error getting best strategy: ${error.message}`, { error });
      // It's important that the router failing doesn't break the whole system,
      // so it should return null to allow fallback to default strategies.
      return null;
    }
  }

  /**
   * Determines the best strategy for a given natural language input.
   * @param {string} naturalLanguageText - The input text.
   * @param {string} llmModelId - The ID of the LLM to be used.
   * @returns {Promise<string|null>} The strategy_hash of the recommended strategy, or null.
   */
  async route(naturalLanguageText, llmModelId) {
    logger.info(`[InputRouter] Routing input: "${naturalLanguageText}", Model: "${llmModelId}"`);
    if (!naturalLanguageText || !llmModelId) {
      logger.warn('[InputRouter] Route called with missing naturalLanguageText or llmModelId.');
      return null;
    }

    const inputClass = this.classifyInput(naturalLanguageText);
    const strategyHash = await this.getBestStrategy(inputClass, llmModelId);

    if (strategyHash) {
      logger.info(`[InputRouter] Recommended strategy ID: ${strategyHash} for input class "${inputClass}"`);
    } else {
      logger.info(`[InputRouter] No specific strategy recommendation. Fallback will be used.`);
    }
    return strategyHash;
  }
}

module.exports = InputRouter;
