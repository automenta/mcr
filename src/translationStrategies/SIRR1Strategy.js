// src/translationStrategies/SIRR1Strategy.js
const BaseSIRStrategy = require('./BaseSIRStrategy');
const { prompts } = require('../prompts'); // Only need prompts object itself

/**
 * @class SIRR1Strategy
 * Implements the ITranslationStrategy convention using a Structured Intermediate Representation (SIR).
 * This is the original SIR strategy, now extending BaseSIRStrategy.
 * It uses the NL_TO_SIR_ASSERT and NL_TO_QUERY prompts.
 */
class SIRR1Strategy extends BaseSIRStrategy {
  /**
   * Gets the unique name of the strategy.
   * @returns {string} The unique name of the strategy.
   */
  getName() {
    return 'SIR-R1'; // Original name
  }

  /**
   * Returns the system and user prompt templates for SIR generation during assertion.
   * Overrides BaseSIRStrategy.getAssertPrompts().
   * @returns {{system: string, user: string}} An object containing system and user prompt templates.
   */
  getAssertPrompts() {
    // Uses the specific prompts for SIR-R1 (which were the defaults in BaseSIRStrategy original example)
    return prompts.NL_TO_SIR_ASSERT;
  }

  /**
   * Returns the system and user prompt templates for query generation.
   * Overrides BaseSIRStrategy.getQueryPrompts().
   * @returns {{system: string, user: string}} An object containing system and user prompt templates.
   */
  getQueryPrompts() {
    // Uses the specific prompts for SIR-R1 query (which were the defaults in BaseSIRStrategy original example)
    return prompts.NL_TO_QUERY;
  }

  // _convertSirToProlog is inherited from BaseSIRStrategy.
  // If SIRR1Strategy had a subtly different SIR JSON structure or conversion logic than the base,
  // _convertSirToProlog would be overridden here. For now, assuming it uses the base version.

  // assert and query methods are inherited from BaseSIRStrategy.
  // They will use the prompts returned by getAssertPrompts() and getQueryPrompts() respectively.
}

module.exports = SIRR1Strategy;
