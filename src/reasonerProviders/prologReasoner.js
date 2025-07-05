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
  if (
    prolog.type &&
    typeof prolog.type.is_substitution === 'function' &&
    prolog.type.is_substitution(answer)
  ) {
    if (answer.lookup('Goal') && answer.lookup('Goal').toString() === 'true') {
      // This case handles results from queries like `assertz(fact(a)).`
      // which might return { Goal: true } or similar if they don't bind variables.
      return true;
    }
    const result = {};
    let hasBindings = false;
    for (const V_key in answer.links) {
      // V_key is the variable name string like "X"
      if (V_key.startsWith('_')) {
        // Skip internal/anonymous variables like _G123
        continue;
      }
      // answer.links[V_key] is a Term. Its toString() method gives its value or name.
      result[V_key] = answer.links[V_key].toString();
      hasBindings = true;
    }
    // If hasBindings is true, result contains the variable bindings.
    // If hasBindings is false (e.g., answer.links was empty or only had '_' vars),
    // it means it's a success but no variables to bind (e.g. `human(socrates).` query), so return true.
    return hasBindings ? result : true;
  }
  return answer.toString(); // Fallback for other types if any (e.g., if answer is not a substitution)
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
  const session = prolog.create(1000); // Limit for operations, not results
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
                    if (answer === false) {
                      logger.debug(
                        'Prolog query: Received answer === false. This typically means the query (or this branch of it) failed. Resolving with accumulated results.'
                      );
                      resolve(results); // If results is empty, this correctly returns [] for a failed query.
                      return;
                    }
                    // Check if the answer is the special "theta_nil" object which indicates no more solutions.
                    // This is Tau Prolog's specific way of signaling end of results in some contexts,
                    // though the 'fail' callback is usually the primary indicator.
                    // It's pl.type.is_theta_nil(answer).
                    if (
                      prolog.type &&
                      typeof prolog.type.is_theta_nil === 'function' &&
                      prolog.type.is_theta_nil(answer)
                    ) {
                      logger.debug(
                        'Prolog query: No more answers (is_theta_nil).'
                      );
                      resolve(results);
                      return;
                    }

                    const formatted = formatAnswer(answer);
                    logger.debug('Prolog answer received:', {
                      raw: answer.toString(),
                      formatted,
                    });
                    results.push(formatted);
                    if (results.length >= limit) {
                      logger.debug(
                        `Prolog query: Reached result limit of ${limit}.`
                      );
                      resolve(results);
                      return;
                    }
                    processNextAnswer(); // Get next answer
                  },
                  error: (err) => {
                    logger.error(
                      `Prolog error processing answer for query "${query}": ${err}`
                    );
                    reject(new Error(`Prolog error processing answer: ${err}`));
                  },
                  fail: () => {
                    logger.debug(
                      `Prolog query "${query}" failed to find a solution (or more solutions).`
                    );
                    resolve(results); // Query failed, no (more) solutions
                  },
                  limit: () => {
                    logger.warn(
                      `Prolog query "${query}" exceeded execution limit.`
                    );
                    resolve(results); // Query exceeded execution limits
                  },
                });
              }
              processNextAnswer(); // Start processing answers
            },
            error: (err) => {
              logger.error(
                `Prolog syntax error or issue in query "${query}": ${err}`
              );
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
      logger.error(
        `Unexpected error during Prolog operation: ${error.message}`,
        { error }
      );
      reject(new Error(`Unexpected Prolog error: ${error.message}`));
    }
  });
}

/**
 * Validates the syntax of a given knowledge base (placeholder).
 * @param {string} knowledgeBase - A string containing the Prolog facts and rules.
 * @returns {Promise<{isValid: boolean, error?: string}>} A promise that resolves to an object
 *          indicating if the knowledge base is valid.
 */
async function validateKnowledgeBase(knowledgeBase) {
  // Placeholder implementation.
  // A real implementation would try to consult the KB in a new session
  // and catch errors. For Tau Prolog, session.consult itself can throw errors.
  logger.info('[PrologReasonerProvider] validateKnowledgeBase called (placeholder).');
  try {
    const session = prolog.create(100); // Create a temporary session
    let consultError = null;
    session.consult(knowledgeBase, {
        success: () => {}, // Do nothing on success
        error: (err) => {
            consultError = err;
        }
    });
    if (consultError) {
      logger.warn(`[PrologReasonerProvider] Knowledge base validation failed: ${consultError}`);
      return { isValid: false, error: String(consultError) };
    }
    return { isValid: true };
  } catch (e) {
    logger.error(`[PrologReasonerProvider] Error during knowledge base validation: ${e.message}`);
    return { isValid: false, error: e.message };
  }
}

module.exports = {
  name: 'prolog',
  executeQuery: runQuery, // Aligning with IReasonProvider, runQuery is the implementation
  validate: validateKnowledgeBase,
  // Potentially add methods for asserting facts if needed, though runQuery can handle assertz/retractz
  // For example, an assertFacts(kb, factsToAssert) could internally call runQuery with assert queries.
};
