// src/strategies/DirectS1Strategy.js

const { prompts, fillTemplate } = require('../prompts');
const logger = require('../logger');

/**
 * @class DirectS1Strategy
 * Implements the ITranslationStrategy convention.
 * This strategy translates natural language directly to Prolog logic using an LLM,
 * incorporating context from existing facts and ontology rules.
 */
class DirectS1Strategy {
  /**
   * Gets the unique name of the strategy.
   * @returns {string} The unique name of the strategy.
   */
  getName() {
    return 'Direct-S1';
  }

  /**
   * Translates natural language text into an array of symbolic clauses (facts or rules).
   * It uses the NL_TO_LOGIC prompt which considers existing facts and ontology rules.
   * @async
   * @param {string} naturalLanguageText - The natural language text to be asserted.
   * @param {ILlmProvider} llmProvider - An instance of an LLM provider.
   * @param {object} [options] - Optional parameters for the assertion.
   * @param {string} [options.existingFacts=""] - Optional string of existing facts for context.
   * @param {string} [options.ontologyRules=""] - Optional string of ontology rules for context.
   * @returns {Promise<string[]>} A promise that resolves to an array of string-based Prolog clauses.
   * @throws {Error} If translation fails, LLM indicates it's a query, or no valid facts are extracted.
   */
  async assert(naturalLanguageText, llmProvider, options = {}) {
    const { existingFacts = '', ontologyRules = '', lexiconSummary = 'No lexicon summary available.' } = options;
    logger.debug(
      `[DirectS1Strategy] Asserting NL: "${naturalLanguageText}" with context.`
    );

    const nlToLogicPromptUser = fillTemplate(prompts.NL_TO_LOGIC.user, {
      naturalLanguageText,
      existingFacts,
      ontologyRules,
      lexiconSummary,
    });

    const prologFactsString = await llmProvider.generate(
      prompts.NL_TO_LOGIC.system,
      nlToLogicPromptUser
    );
    logger.debug(
      `[DirectS1Strategy] LLM Raw Output for NL_TO_LOGIC: \n${prologFactsString}`
    );

    if (prologFactsString.includes('% Cannot convert query to fact.')) {
      logger.warn(
        `[DirectS1Strategy] LLM indicated text is a query, not an assertable fact: "${naturalLanguageText}"`
      );
      throw new Error(
        'Input text appears to be a query, not an assertable fact.'
      );
    }

    const addedFacts = prologFactsString
      .split('\n')
      .map((f) => f.trim())
      .filter((f) => f.length > 0 && !f.startsWith('%') && f.endsWith('.')) // Ensure it's not a comment and ends with a period
      .map((line) => {
        // Additional check to ensure period if accidentally missed by LLM but line seems valid
        if (line.includes(':-') && !line.endsWith('.')) return line + '.';
        if (
          !line.includes(':-') &&
          line.includes('(') &&
          line.includes(')') &&
          !line.endsWith('.')
        )
          return line + '.';
        return line;
      })
      .filter((f) => f.endsWith('.')); // Final filter for those ending with a period

    if (addedFacts.length === 0) {
      logger.warn(
        `[DirectS1Strategy] No valid Prolog facts extracted from LLM output for text: "${naturalLanguageText}"`
      );
      throw new Error('Could not translate text into valid facts.');
    }
    logger.info(
      `[DirectS1Strategy] Translated to Prolog facts: ${JSON.stringify(addedFacts)}`
    );
    return addedFacts;
  }

  /**
   * Translates a natural language question into a symbolic query string.
   * It uses the NL_TO_QUERY prompt which considers existing facts and ontology rules.
   * @async
   * @param {string} naturalLanguageQuestion - The natural language question.
   * @param {ILlmProvider} llmProvider - An instance of an LLM provider.
   * @param {object} [options] - Optional parameters for the query translation.
   * @param {string} [options.existingFacts=""] - Optional string of existing facts for context.
   * @param {string} [options.ontologyRules=""] - Optional string of ontology rules for context.
   * @returns {Promise<string>} A promise that resolves to a string representing the Prolog query.
   * @throws {Error} If translation fails or the generated query is invalid.
   */
  async query(naturalLanguageQuestion, llmProvider, options = {}) {
    const { existingFacts = '', ontologyRules = '', lexiconSummary = 'No lexicon summary available.' } = options;
    logger.debug(
      `[DirectS1Strategy] Translating NL query: "${naturalLanguageQuestion}" with context.`
    );

    const nlToQueryPromptUser = fillTemplate(prompts.NL_TO_QUERY.user, {
      naturalLanguageQuestion,
      existingFacts,
      ontologyRules,
      lexiconSummary,
    });

    const prologQuery = await llmProvider.generate(
      prompts.NL_TO_QUERY.system,
      nlToQueryPromptUser
    );
    logger.debug(
      `[DirectS1Strategy] LLM Raw Output for NL_TO_QUERY: ${prologQuery}`
    );

    let cleanedQuery = prologQuery.trim();

    // Remove any ?- prefix if present (some LLMs might add it)
    if (cleanedQuery.startsWith('?-')) {
      cleanedQuery = cleanedQuery.substring(2).trim();
    }

    // Ensure query ends with a period
    if (!cleanedQuery.endsWith('.')) {
      // Check if it's a substantial query before appending a period
      if (cleanedQuery.length > 1 && cleanedQuery.includes('(')) {
        // Simple heuristic
        cleanedQuery += '.';
      } else {
        logger.error(
          `[DirectS1Strategy] LLM generated invalid or empty Prolog query: "${prologQuery}"`
        );
        throw new Error(
          'Failed to translate question to a valid Prolog query (empty or malformed).'
        );
      }
    }

    // Final validation for common Prolog query structure
    if (
      !cleanedQuery.match(/^[a-z_][a-zA-Z0-9_]*\(.*\)\.$/) &&
      !cleanedQuery.match(/^[a-z_][a-zA-Z0-9_]*\.$/)
    ) {
      // This regex is a basic check and might need refinement
      // It checks for predicate(...) or atom.
      if (!cleanedQuery.includes('true.') && !cleanedQuery.includes('fail.')) {
        // Allow true. and fail.
        logger.warn(
          `[DirectS1Strategy] Generated query "${cleanedQuery}" might be malformed.`
        );
        // Depending on strictness, one might throw an error here.
        // For now, we'll allow it but log a warning.
      }
    }

    if (!cleanedQuery || !cleanedQuery.endsWith('.')) {
      // Redundant check, but good for safety
      logger.error(
        `[DirectS1Strategy] LLM generated invalid Prolog query after cleaning: "${cleanedQuery}" (Original: "${prologQuery}")`
      );
      throw new Error('Failed to translate question to a valid query.');
    }
    logger.info(
      `[DirectS1Strategy] Translated to Prolog query: ${cleanedQuery}`
    );
    return cleanedQuery;
  }
}

module.exports = DirectS1Strategy;
