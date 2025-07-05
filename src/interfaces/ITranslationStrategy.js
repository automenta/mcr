// src/interfaces/ITranslationStrategy.js

/**
 * @interface ITranslationStrategy
 * Defines the contract for a translation strategy.
 * A translation strategy is responsible for converting natural language text
 * into symbolic logic (for assertions) or a symbolic query.
 */

/**
 * Gets the unique name of the strategy.
 * @function getName
 * @memberof ITranslationStrategy
 * @instance
 * @returns {string} The unique name of the strategy (e.g., "Direct-S1", "SIR-R1").
 */

/**
 * Translates natural language text into an array of symbolic clauses (facts or rules).
 * @function assert
 * @memberof ITranslationStrategy
 * @instance
 * @async
 * @param {string} naturalLanguageText - The natural language text to be asserted.
 * @param {ILlmProvider} llmProvider - An instance of an LLM provider.
 * @param {object} [options] - Optional parameters for the assertion, like existing facts or ontology rules for context.
 * @param {string} [options.existingFacts] - Optional string of existing facts for context.
 * @param {string} [options.ontologyRules] - Optional string of ontology rules for context.
 * @returns {Promise<string[]>} A promise that resolves to an array of string-based Prolog clauses.
 *                                Each string should be a valid Prolog fact or rule ending with a period.
 * @throws {Error} If translation fails or an issue occurs with the LLM provider.
 */

/**
 * Translates a natural language question into a symbolic query string.
 * @function query
 * @memberof ITranslationStrategy
 * @instance
 * @async
 * @param {string} naturalLanguageQuestion - The natural language question.
 * @param {ILlmProvider} llmProvider - An instance of an LLM provider.
 * @param {object} [options] - Optional parameters for the query translation, like existing facts or ontology rules for context.
 * @param {string} [options.existingFacts] - Optional string of existing facts for context.
 * @param {string} [options.ontologyRules] - Optional string of ontology rules for context.
 * @returns {Promise<string>} A promise that resolves to a string representing the Prolog query,
 *                            ending with a period.
 * @throws {Error} If translation fails or an issue occurs with the LLM provider.
 */

// Note: Since JavaScript doesn't have formal interfaces, this file serves as documentation
// for the expected structure of a translation strategy class.
// Concrete strategies should implement these methods.
// Example:
// class MyStrategy {
//   getName() { /* ... */ }
//   async assert(naturalLanguageText, llmProvider, options) { /* ... */ }
//   async query(naturalLanguageQuestion, llmProvider, options) { /* ... */ }
// }
// module.exports = MyStrategy;
