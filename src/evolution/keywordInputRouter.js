const logger = require('../util/logger');
const { ErrorCodes, MCRError } = require('../errors');
// const { loadAllEvalCases } = require('../evalCases/baseEvals'); // No longer needed here

// Placeholder for more sophisticated classification
const DEFAULT_ASSERT_CLASS = 'general_assert';
const DEFAULT_QUERY_CLASS = 'general_query';

// Cache for evaluation cases to avoid repeated loading - No longer needed here
// let evalCaseMapCache = null;

// async function getEvalCaseMap() {
//     if (evalCaseMapCache) {
//         return evalCaseMapCache;
//     }
//     try {
//         const allEvalCases = await loadAllEvalCases();
//         evalCaseMapCache = new Map(allEvalCases.map(ec => [ec.id, ec]));
//         logger.info('[InputRouter] Evaluation cases loaded and cached for input type mapping.');
//     } catch (error) {
//         logger.error('[InputRouter] Failed to load evaluation cases for input type mapping:', error);
//         evalCaseMapCache = new Map();
//     }
//     return evalCaseMapCache;
// }

class KeywordInputRouter {
  constructor(db) {
    if (!db) {
      throw new MCRError(
        ErrorCodes.INTERNAL_ERROR,
        'InputRouter requires a database instance.'
      );
    }
    this.db = db; // This should be the database module itself, not an instance
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
    const nlLower = naturalLanguageText.toLowerCase();
    if (
      /\?$/.test(nlLower) ||
      [
        'who',
        'what',
        'where',
        'when',
        'why',
        'how',
        'are',
        'does',
        'do',
        'can',
        'could',
        'would',
        'should',
      ].some(kw => nlLower.startsWith(kw) || nlLower.includes(` ${kw} `))
    ) {
      const logText =
        naturalLanguageText.length > 50
          ? naturalLanguageText.substring(0, 50) + '...'
          : naturalLanguageText;
      logger.debug(
        `[InputRouter] Classified input as '${DEFAULT_QUERY_CLASS}': "${logText}"`
      );
      return DEFAULT_QUERY_CLASS;
    }
    const logText =
      naturalLanguageText.length > 50
        ? naturalLanguageText.substring(0, 50) + '...'
        : naturalLanguageText;
    logger.debug(
      `[InputRouter] Classified input as '${DEFAULT_ASSERT_CLASS}': "${logText}"`
    );
    return DEFAULT_ASSERT_CLASS;
  }

  /**
   * Queries the Performance Database for the best strategy_hash for the given input class and LLM.
   * @param {string} inputClass - The class of the input (e.g., "general_assert", "general_query").
   * @param {string} llmModelId - The ID of the LLM being used.
   * @returns {Promise<string|null>} The strategy_hash of the best performing strategy, or null if none found.
   */
  async getBestStrategy(inputClass, llmModelId) {
    logger.debug(
      `[InputRouter] Getting best strategy for inputClass: "${inputClass}", llmModelId: "${llmModelId}"`
    );

    try {
      // Map general_assert -> 'assert', general_query -> 'query'
      const targetInputType =
        inputClass === DEFAULT_ASSERT_CLASS ? 'assert' : 'query';

      const query = `
        SELECT strategy_hash, metrics, latency_ms, cost
        FROM performance_results
        WHERE (llm_model_id = ? OR llm_model_id IS NULL OR llm_model_id = '')
          AND input_type = ?;
      `;
      // Fetch results filtered by llmModelId (or generic) AND input_type
      const relevantResults = await this.db.queryPerformanceResults(query, [
        llmModelId,
        targetInputType,
      ]);

      if (!relevantResults || relevantResults.length === 0) {
        logger.info(
          `[InputRouter] No performance results found for llmModelId "${llmModelId}" (or generic) and input_type "${targetInputType}".`
        );
        return null;
      }

      // Aggregate scores per strategy_hash
      const strategyScores = new Map();

      for (const row of relevantResults) {
        try {
          const metrics = JSON.parse(row.metrics);
          const cost = JSON.parse(row.cost || '{}'); // Default to empty object if cost is null/undefined

          let successScore = 0;
          // Define success based on primary metrics. For simplicity, using exactMatchProlog or exactMatchAnswer.
          // A more sophisticated approach might use a weighted average or specific metrics per input type.
          if (
            metrics.exactMatchProlog === 1 ||
            metrics.exactMatchProlog === true
          )
            successScore += 1;
          if (
            metrics.exactMatchAnswer === 1 ||
            metrics.exactMatchAnswer === true
          )
            successScore += 1; // Relevant for queries
          // Add other positive metric contributions if needed, e.g. prologStructureMatch, semanticSimilarityAnswer
          if (
            metrics.prologStructureMatch === 1 ||
            metrics.prologStructureMatch === true
          )
            successScore += 0.5;

          // Lower latency is better, convert to a positive score contribution (e.g., 1 / latency)
          // Avoid division by zero; add a small epsilon or handle 0 latency. Max latency can cap score.
          const latencyScore =
            row.latency_ms > 0 ? 1000 / (row.latency_ms + 1) : 1; // Normalize, higher is better

          // Lower cost is better. Example: input_tokens.
          const costValue = cost.input_tokens || cost.total_tokens || 0;
          const costScore = costValue > 0 ? 1000 / (costValue + 1) : 1; // Normalize, higher is better

          // Composite score: success is paramount, then latency, then cost.
          // Weights can be adjusted.
          const W_SUCCESS = 100;
          const W_LATENCY = 10;
          const W_COST = 1;

          const currentScore =
            successScore * W_SUCCESS +
            latencyScore * W_LATENCY +
            costScore * W_COST;

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
            `[InputRouter] Failed to parse metrics/cost for a row or calculate score: ${e.message}`,
            { strategy_hash: row.strategy_hash, example_id: row.example_id }
          );
        }
      }

      if (strategyScores.size === 0) {
        logger.info(
          '[InputRouter] No strategies with valid scores after processing results.'
        );
        return null;
      }

      // Find the best strategy: highest average score.
      // If average scores are tied, prefer one with more successes, then lower average latency, then lower average cost.
      let bestStrategyHash = null;
      let maxAvgScore = -Infinity;

      strategyScores.forEach((agg, hash) => {
        const avgScore = agg.count > 0 ? agg.totalScore / agg.count : 0;
        logger.debug(
          `[InputRouter] Strategy ${hash}: Avg Score=${avgScore.toFixed(2)}, Successes=${agg.successCount}/${agg.count}, Avg Latency=${(agg.totalLatency / agg.count).toFixed(0)}ms, Avg Tokens=${(agg.totalCostTokens / agg.count).toFixed(0)}`
        );

        if (avgScore > maxAvgScore) {
          maxAvgScore = avgScore;
          bestStrategyHash = hash;
        } else if (avgScore === maxAvgScore && bestStrategyHash) {
          const currentBestAgg = strategyScores.get(bestStrategyHash);
          if (agg.successCount > currentBestAgg.successCount) {
            bestStrategyHash = hash; // Higher success count
          } else if (agg.successCount === currentBestAgg.successCount) {
            const avgLatency = agg.totalLatency / agg.count;
            const currentBestAvgLatency =
              currentBestAgg.totalLatency / currentBestAgg.count;
            if (avgLatency < currentBestAvgLatency) {
              bestStrategyHash = hash; // Lower average latency
            } else if (avgLatency === currentBestAvgLatency) {
              const avgCost = agg.totalCostTokens / agg.count;
              const currentBestAvgCost =
                currentBestAgg.totalCostTokens / currentBestAgg.count;
              if (avgCost < currentBestAvgCost) {
                bestStrategyHash = hash; // Lower average cost
              }
            }
          }
        }
      });

      if (bestStrategyHash) {
        logger.info(
          `[InputRouter] Best strategy selected: ${bestStrategyHash} with average score ${maxAvgScore.toFixed(2)} for inputClass "${inputClass}", llmModelId "${llmModelId}"`
        );
      } else {
        logger.info(
          `[InputRouter] No best strategy found after aggregation for inputClass "${inputClass}", llmModelId "${llmModelId}".`
        );
      }
      return bestStrategyHash;
    } catch (error) {
      logger.error(
        `[InputRouter] Error getting best strategy: ${error.message}`,
        { stack: error.stack }
      );
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
    logger.info(
      `[InputRouter] Routing input: "${naturalLanguageText}", Model: "${llmModelId}"`
    );
    if (!naturalLanguageText || !llmModelId) {
      logger.warn(
        '[InputRouter] Route called with missing naturalLanguageText or llmModelId.'
      );
      return null;
    }

    const inputClass = this.classifyInput(naturalLanguageText);
    const strategyHash = await this.getBestStrategy(inputClass, llmModelId);

    if (strategyHash) {
      logger.info(
        `[InputRouter] Recommended strategy ID: ${strategyHash} for input class "${inputClass}"`
      );
    } else {
      logger.info(
        `[InputRouter] No specific strategy recommendation. Fallback will be used.`
      );
    }
    return strategyHash;
  }
}

module.exports = KeywordInputRouter;
