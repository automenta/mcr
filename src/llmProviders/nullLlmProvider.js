// src/llmProviders/nullLlmProvider.js
const logger = require('../logger');

const NullLlmProvider = {
  name: 'nullllm', // Consistent name for configuration

  /**
   * Generates a predictable, placeholder response.
   * @param {string} systemPrompt - The system message (ignored).
   * @param {string} userPrompt - The user's query or input (logged for debugging).
   * @param {object} [options={}] - Additional options.
   * @param {boolean} [options.jsonMode=false] - Hint to return a JSON-like string.
   * @returns {Promise<string>} A placeholder string, potentially JSON formatted.
   */
  async generate(systemPrompt, userPrompt, options = {}) {
    logger.info(
      `[NullLlmProvider] generate called. System: "${systemPrompt}", User: "${userPrompt}", Options: ${JSON.stringify(options)}`
    );

    if (options.jsonMode) {
      // Return a valid, simple JSON structure that SIRR1Strategy can parse
      // This helps test the SIR parsing and Prolog conversion logic.
      const sirFact = {
        statementType: 'fact',
        fact: {
          predicate: 'null_response_fact',
          arguments: [
            'input_was',
            (userPrompt || 'empty')
              .replace(/[^a-zA-Z0-9_]/g, '_')
              .toLowerCase()
              .substring(0, 30),
          ],
        },
      };
      // Attempt to simulate a scenario where a rule might be generated if userPrompt is long
      // This is a very rough heuristic for testing.
      if (
        userPrompt &&
        userPrompt.length > 50 &&
        userPrompt.toLowerCase().includes('if')
      ) {
        const sirRule = {
          statementType: 'rule',
          rule: {
            head: { predicate: 'null_rule_head', arguments: ['X'] },
            body: [{ predicate: 'null_rule_body', arguments: ['X'] }],
          },
        };
        logger.debug('[NullLlmProvider] Returning placeholder SIR Rule JSON.');
        return JSON.stringify(sirRule);
      }

      logger.debug('[NullLlmProvider] Returning placeholder SIR Fact JSON.');
      return JSON.stringify(sirFact);
    }

    // For non-JSON mode, a simple text response
    logger.debug('[NullLlmProvider] Returning simple text response.');
    return `Null LLM response to: "${userPrompt}"`;
  },
};

module.exports = NullLlmProvider;
