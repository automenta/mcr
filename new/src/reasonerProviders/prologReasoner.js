// new/src/reasonerProviders/prologReasoner.js
const prolog = require('tau-prolog');
const logger = require('../logger');

// Tau Prolog sessions are stateful. We'll manage one session per logical "knowledge base".
// For this streamlined version, a single global session might be sufficient if not dealing
// with multiple concurrent, isolated knowledge bases.
// However, the plan implies session management will be handled by `sessionManager.js`,
// so this provider should operate on a given set of facts for a query.

/**
 * Helper to format Prolog answers.
 * @param {*} answer - An answer from Tau Prolog.
 * @returns {string|object} - A simplified representation of the answer.
 */
function formatAnswer(answer) {
  if (prolog.is_substitution(answer)) {
    if (answer.lookup('Goal') && answer.lookup('Goal').toString() === 'true') {
        // This case handles results from queries like `assertz(fact(a)).`
        // which might return { Goal: true } or similar if they don't bind variables.
        return true;
    }
    const result = {};
    let hasBindings = false;
    for (const V in answer.links) {
      if (answer.links[V].id !== V || V.startsWith('_')) continue; // Skip internal or anonymous vars
      result[V] = answer.links[V].toString();
      hasBindings = true;
    }
    // If there are no bindings but the substitution is not false, it means success (e.g. for a fact query)
    // However, tau-prolog usually returns `false` for no solution, or a substitution for solutions.
    // An empty substitution `{}` often means "yes, true, but no variables to show".
    return hasBindings ? result : true; // `true` for simple success like `human(socrates).`
  }
  return answer.toString(); // Fallback for other types if any
}


/**
 * Executes a Prolog query against a given knowledge base.
 * @param {string} knowledgeBase - A string containing all Prolog facts and rules.
 * @param {string} query - The Prolog query string (e.g., "human(X).").
 * @param {number} [limit=10] - Maximum number of answers to retrieve.
 * @returns {Promise<Array<object|string|boolean>>} A promise that resolves to an array of formatted answers.
 *                                                  `true` for simple successes, objects for variable bindings.
 *                                                  Returns an empty array if no solutions.
 * @throws {Error} If there's a syntax error or other issue with the Prolog execution.
 */
async function runQuery(knowledgeBase, query, limit = 10) {
  const session = new prolog.createSession(1000); // Limit for operations, not results
  const results = [];

  return new Promise((resolve, reject) => {
    try {
      // Consult the knowledge base
      session.consult(knowledgeBase, {
        success: () => {
          logger.debug('Prolog knowledge base consulted successfully.');
          // Query
          session.query(query, {
            success: () => {
              logger.debug(`Prolog query "${query}" successful.`);
              function processNextAnswer() {
                session.answer({
                  success: (answer) => {
                    if (answer === false || prolog.is_theta_nil(answer)) { // No more solutions or explicit false
                      logger.debug('Prolog query: No more answers or explicit false.');
                      resolve(results);
                      return;
                    }
                    const formatted = formatAnswer(answer);
                    logger.debug('Prolog answer received:', { raw: answer.toString(), formatted });
                    results.push(formatted);
                    if (results.length >= limit) {
                       logger.debug(`Prolog query: Reached result limit of ${limit}.`);
                       resolve(results);
                       return;
                    }
                    processNextAnswer(); // Get next answer
                  },
                  error: (err) => {
                    logger.error(`Prolog error processing answer for query "${query}": ${err}`);
                    reject(new Error(`Prolog error processing answer: ${err}`));
                  },
                  fail: () => {
                     logger.debug(`Prolog query "${query}" failed to find a solution (or more solutions).`);
                     resolve(results); // Query failed, no (more) solutions
                  },
                  limit: () => {
                    logger.warn(`Prolog query "${query}" exceeded execution limit.`);
                    resolve(results); // Query exceeded execution limits
                  }
                });
              }
              processNextAnswer(); // Start processing answers
            },
            error: (err) => {
              logger.error(`Prolog syntax error or issue in query "${query}": ${err}`);
              reject(new Error(`Prolog query error: ${err}`));
            },
          });
        },
        error: (err) => {
          logger.error(`Prolog syntax error or issue in knowledgeBase: ${err}`);
          reject(new Error(`Prolog knowledge base error: ${err}`));
        },
      });
    } catch (error) {
      logger.error(`Unexpected error during Prolog operation: ${error.message}`, { error });
      reject(new Error(`Unexpected Prolog error: ${error.message}`));
    }
  });
}

module.exports = {
  name: 'prolog',
  runQuery,
  // Potentially add methods for asserting facts if needed, though runQuery can handle assertz/retractz
  // For example, an assertFacts(kb, factsToAssert) could internally call runQuery with assert queries.
};
