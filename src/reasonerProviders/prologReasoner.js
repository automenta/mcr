// src/reasonerProviders/prologReasoner.js
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

  logger.debug(`[PrologReasoner] Attempting to run query. Query: "${query}"`);
  logger.debug(
    `[PrologReasoner] Knowledge Base (first 500 chars):\n${knowledgeBase.substring(0, 500)}`
  );
  if (knowledgeBase.length > 500) {
    logger.debug(
      '[PrologReasoner] Knowledge Base is longer than 500 characters and has been truncated in this log entry.'
    );
  }

  return new Promise((resolve, reject) => {
    try {
      // Consult the knowledge base
      logger.debug('[PrologReasoner] Consulting knowledge base...');
      session.consult(knowledgeBase, {
        success: () => {
          logger.info(
            '[PrologReasoner] Knowledge base consulted successfully.'
          );
          // Query
          logger.debug(`[PrologReasoner] Executing Prolog query: "${query}"`);
          session.query(query, {
            success: () => {
              logger.info(
                `[PrologReasoner] Prolog query "${query}" execution initiated successfully.`
              );
              function processNextAnswer() {
                session.answer({
                  success: (answer) => {
                    if (answer === false) {
                      logger.info(
                        `[PrologReasoner] Query "${query}" branch failed (answer === false). No more solutions in this path.`
                      );
                      resolve(results);
                      return;
                    }
                    if (
                      prolog.type &&
                      typeof prolog.type.is_theta_nil === 'function' &&
                      prolog.type.is_theta_nil(answer)
                    ) {
                      logger.info(
                        `[PrologReasoner] Query "${query}": No more solutions (is_theta_nil).`
                      );
                      resolve(results);
                      return;
                    }

                    const formatted = formatAnswer(answer);
                    logger.debug(
                      `[PrologReasoner] Raw answer for "${query}": ${answer.toString()}`
                    );
                    logger.info(
                      `[PrologReasoner] Formatted answer for "${query}": ${JSON.stringify(formatted)}`
                    );
                    results.push(formatted);

                    if (results.length >= limit) {
                      logger.info(
                        `[PrologReasoner] Query "${query}": Reached result limit of ${limit}.`
                      );
                      resolve(results);
                      return;
                    }
                    processNextAnswer(); // Get next answer
                  },
                  error: (err) => {
                    logger.error(
                      `[PrologReasoner] Error processing answer for query "${query}": ${err}`
                    );
                    reject(new Error(`Prolog error processing answer: ${err}`));
                  },
                  fail: () => {
                    logger.info(
                      `[PrologReasoner] Query "${query}" failed to find a solution (or no more solutions). Final results: ${JSON.stringify(results)}`
                    );
                    resolve(results); // Query failed, no (more) solutions
                  },
                  limit: () => {
                    logger.warn(
                      `[PrologReasoner] Query "${query}" exceeded execution limit.`
                    );
                    resolve(results); // Query exceeded execution limits
                  },
                });
              }
              processNextAnswer(); // Start processing answers
            },
            error: (err) => {
              logger.error(
                `[PrologReasoner] Prolog syntax error or issue in query "${query}": ${err}`
              );
              reject(new Error(`Prolog query error: ${err}`));
            },
          });
        },
        error: (err) => {
          logger.error(
            `[PrologReasoner] Syntax error or issue consulting knowledgeBase: ${err}`
          );
          logger.debug(
            `[PrologReasoner] Failing Knowledge Base (first 500 chars for context):\n${knowledgeBase.substring(0, 500)}`
          );
          reject(new Error(`Prolog knowledge base error: ${err}`));
        },
      });
    } catch (error) {
      logger.error(
        `[PrologReasoner] Unexpected error during Prolog operation: ${error.message}`,
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
  const kbSnippet =
    knowledgeBase.substring(0, 200) + (knowledgeBase.length > 200 ? '...' : '');
  logger.info(
    `[PrologReasonerProvider] Validating knowledge base (approx. ${knowledgeBase.length} chars). Snippet: "${kbSnippet}"`
  );

  try {
    const session = prolog.create(100);
    let consultError = null;

    // Tau Prolog's consult can be tricky with string inputs for error reporting.
    // Attempt direct consult and catch synchronous errors.
    try {
      session.consult(knowledgeBase);
    } catch (syncError) {
      consultError = syncError;
      logger.debug(
        `[PrologReasonerProvider] Synchronous error during consult: ${syncError}`
      );
    }

    // Additionally, use the callback mechanism if no synchronous error occurred,
    // as some errors might only be reported asynchronously.
    if (!consultError) {
      const consultPromise = new Promise((resolveConsult) => { // Removed unused rejectConsult
        session.consult(knowledgeBase, {
          success: () => {
            resolveConsult(null); // No error
          },
          error: (err) => {
            resolveConsult(err); // Resolve with error to handle it uniformly
          },
        });
      });
      consultError = await consultPromise;
      if (consultError) {
        logger.debug(
          `[PrologReasonerProvider] Asynchronous error reported via callback during consult: ${consultError}`
        );
      }
    }

    if (consultError) {
      logger.warn(
        `[PrologReasonerProvider] Knowledge base validation FAILED. Error: ${consultError}. Snippet: "${kbSnippet}"`
      );
      return { isValid: false, error: String(consultError) };
    }

    logger.info(
      `[PrologReasonerProvider] Knowledge base validation PASSED. Snippet: "${kbSnippet}"`
    );
    return { isValid: true };
  } catch (e) {
    // This catch is for unexpected errors in the validation logic itself
    logger.error(
      `[PrologReasonerProvider] Exception during knowledge base validation process. Error: ${e.message}. Snippet: "${kbSnippet}"`
    );
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
