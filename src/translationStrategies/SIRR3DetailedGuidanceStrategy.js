// src/translationStrategies/SIRR3DetailedGuidanceStrategy.js
const BaseSIRStrategy = require('./BaseSIRStrategy');
const { prompts, fillTemplate } = require('../prompts');

/**
 * @class SIRR3DetailedGuidanceStrategy
 * A variation of SIR strategy that uses prompts with more explicit structural guidance
 * for generating the SIR JSON.
 * It extends BaseSIRStrategy.
 */
class SIRR3DetailedGuidanceStrategy extends BaseSIRStrategy {
  getName() {
    return 'SIR-R3-DetailedGuidance';
  }

  getAssertPrompts() {
    // Assume a new prompt, NL_TO_SIR_ASSERT_GUIDED, is defined in src/prompts.js
    // This prompt would provide more detailed instructions on how to structure the SIR JSON.
    if (!prompts.NL_TO_SIR_ASSERT_GUIDED) {
      throw new Error("Prompt 'NL_TO_SIR_ASSERT_GUIDED' is not defined for SIRR3DetailedGuidanceStrategy.");
    }
    return prompts.NL_TO_SIR_ASSERT_GUIDED;
  }

  // Inherits getQueryPrompts from BaseSIRStrategy (defaulting to NL_TO_QUERY)
  // or can be overridden if a specific query prompt is needed.
}

module.exports = SIRR3DetailedGuidanceStrategy;
