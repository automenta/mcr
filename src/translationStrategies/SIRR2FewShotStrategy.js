// src/translationStrategies/SIRR2FewShotStrategy.js
const BaseSIRStrategy = require('./BaseSIRStrategy');
const { prompts, fillTemplate } = require('../prompts'); // fillTemplate might be needed if prompts are complex

/**
 * @class SIRR2FewShotStrategy
 * A variation of SIR strategy that emphasizes few-shot examples in its assertion prompt.
 * It extends BaseSIRStrategy.
 */
class SIRR2FewShotStrategy extends BaseSIRStrategy {
  getName() {
    return 'SIR-R2-FewShot';
  }

  getAssertPrompts() {
    // Assume a new prompt, NL_TO_SIR_ASSERT_FEWSHOT, is defined in src/prompts.js
    // This prompt would contain more/different few-shot examples.
    if (!prompts.NL_TO_SIR_ASSERT_FEWSHOT) {
      // Fallback or error if the specific prompt doesn't exist
      throw new Error("Prompt 'NL_TO_SIR_ASSERT_FEWSHOT' is not defined in prompts.js for SIRR2FewShotStrategy.");
    }
    return prompts.NL_TO_SIR_ASSERT_FEWSHOT;
  }

  // getQueryPrompts can be inherited if it uses the same NL_TO_QUERY,
  // or overridden if a different query prompt is desired for this strategy.
  // For this example, we'll assume it uses the default NL_TO_QUERY from BaseSIRStrategy.
  // If specific query prompt:
  /*
  getQueryPrompts() {
    if (!prompts.NL_TO_QUERY_V2) { // Assuming a different query prompt for this strategy
      throw new Error("Prompt 'NL_TO_QUERY_V2' is not defined for SIRR2FewShotStrategy.");
    }
    return prompts.NL_TO_QUERY_V2;
  }
  */
}

module.exports = SIRR2FewShotStrategy;
