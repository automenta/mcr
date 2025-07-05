// src/interfaces/IReasonProvider.js

/**
 * @interface IReasonProvider
 * Defines the contract for a reasoner provider.
 * A reasoner provider is responsible for executing symbolic queries against a knowledge base.
 */

/**
 * Executes a symbolic query against a given knowledge base.
 * @function executeQuery
 * @memberof IReasonProvider
 * @instance
 * @async
 * @param {string} knowledgeBase - A string containing the Prolog facts and rules.
 * @param {string} query - A string containing the Prolog query to execute (ending with a period).
 * @returns {Promise<object|Array|boolean>} A promise that resolves to the result of the query.
 *          The structure of the result depends on the query type:
 *          - For queries seeking variable bindings: An array of objects, where each object represents a solution
 *            with variables as keys and their bound values.
 *          - For true/false queries: A boolean.
 *          - Could also be a more complex structure depending on the reasoner.
 * @throws {Error} If the query execution fails or the knowledge base/query is invalid.
 */

/**
 * Validates the syntax of a given knowledge base.
 * @function validate
 * @memberof IReasonProvider
 * @instance
 * @async
 * @param {string} knowledgeBase - A string containing the Prolog facts and rules.
 * @returns {Promise<{isValid: boolean, error?: string}>} A promise that resolves to an object
 *          indicating if the knowledge base is valid. If not, an error message may be provided.
 * @throws {Error} If the validation process itself encounters an issue.
 */

/**
 * Gets the name of the reasoner provider.
 * @function getName
 * @memberof IReasonProvider
 * @instance
 * @returns {string} The name of the reasoner provider (e.g., "tau-prolog").
 */

// Note: Since JavaScript doesn't have formal interfaces, this file serves as documentation
// for the expected structure of a reasoner provider class or module.
// The existing reasonerService.js (which uses prologReasoner.js) should be
// adapted or checked to conform to this.
// Example:
// const MyReasonerProvider = {
//   name: 'myreasoner',
//   async executeQuery(knowledgeBase, query) { /* ... */ return results; },
//   async validate(knowledgeBase) { /* ... */ return {isValid: true}; }
// };
// module.exports = MyReasonerProvider;
//
// Or for a class:
// class MyReasonerProviderClass {
//   getName() { return 'myreasoner'; }
//   async executeQuery(knowledgeBase, query) { /* ... */ return results; }
//   async validate(knowledgeBase) { /* ... */ return {isValid: true}; }
// }
// module.exports = MyReasonerProviderClass;

// The current `reasonerService.js` uses `prologReasoner.js`.
// `prologReasoner.js` should ideally expose functions that align with `executeQuery` and `validate`.
// `reasonerService.js` can then act as the concrete implementation or facade.
