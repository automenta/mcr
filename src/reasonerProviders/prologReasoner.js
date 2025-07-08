// src/reasonerProviders/prologReasoner.js
const prolog = require('tau-prolog');
const logger = require('../logger');

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
      return true;
    }
    const result = {};
    let hasBindings = false;
    for (const V_key in answer.links) {
      if (V_key.startsWith('_')) {
        continue;
      }
      result[V_key] = answer.links[V_key].toString();
      hasBindings = true;
    }
    return hasBindings ? result : true;
  }
  return answer.toString();
}

/**
 * Traverses the derivation tree from Tau Prolog and formats it into a serializable object.
 * @param {object} termNode - A node from the Tau Prolog derivation tree.
 * @param {pl.type.Session} session - The Tau Prolog session, for formatting terms.
 * @returns {object|null} A simplified, serializable representation of the trace.
 */
function formatTrace(termNode, session) {
  if (!termNode) {
    return null;
  }

  const goal = termNode.goal;
  const links = termNode.links;
  let formattedGoal = 'true';

  if (goal === null) {
    formattedGoal = 'error';
  } else if (prolog.type.is_goal(goal)) {
    // Use session.format_term to correctly represent the goal with its variables
    formattedGoal = session.format_term(goal, { session, links });
  }

  const children =
    termNode.children?.map((child) => formatTrace(child, session)) || [];

  return {
    goal: formattedGoal,
    children,
  };
}

/**
 * Executes a Prolog query against a given knowledge base.
 * @param {string} knowledgeBase - A string containing all Prolog facts and rules.
 * @param {string} query - The Prolog query string (e.g., "human(X).").
 * @param {object} [options={}] - Options for execution.
 * @param {number} [options.limit=10] - Maximum number of answers to retrieve.
 * @param {boolean} [options.trace=false] - Whether to capture the proof trace.
 * @returns {Promise<{results: Array<object|string|boolean>, trace: object|null}>} A promise that resolves to an object
 *          containing formatted answers and the proof trace if requested.
 * @throws {Error} If there's a syntax error or other issue with the Prolog execution.
 */
async function executeQuery(knowledgeBase, query, options = {}) {
  const { limit = 10, trace = false } = options;
  const session = prolog.create(1000);
  const results = [];

  logger.debug(`[PrologReasoner] Attempting to run query. Query: "${query}"`, {
    options,
  });
  logger.debug(
    `[PrologReasoner] Knowledge Base (first 500 chars):\n${knowledgeBase.substring(0, 500)}`
  );

  return new Promise((resolve, reject) => {
    try {
      session.consult(knowledgeBase, {
        success: () => {
          logger.info(
            '[PrologReasoner] Knowledge base consulted successfully.'
          );
          session.query(query, {
            success: () => {
              logger.info(
                `[PrologReasoner] Prolog query "${query}" execution initiated successfully.`
              );
              function processNextAnswer() {
                session.answer({
                  success: (answer) => {
                    if (
                      answer === false ||
                      (prolog.type &&
                        typeof prolog.type.is_theta_nil === 'function' &&
                        prolog.type.is_theta_nil(answer))
                    ) {
                      logger.info(
                        `[PrologReasoner] Query "${query}": No more solutions.`
                      );
                      const proofTrace = trace
                        ? formatTrace(session.thread.get_tree(), session)
                        : null;
                      resolve({ results, trace: proofTrace });
                      return;
                    }

                    const formatted = formatAnswer(answer);
                    results.push(formatted);

                    if (results.length >= limit) {
                      logger.info(
                        `[PrologReasoner] Query "${query}": Reached result limit of ${limit}.`
                      );
                      const proofTrace = trace
                        ? formatTrace(session.thread.get_tree(), session)
                        : null;
                      resolve({ results, trace: proofTrace });
                      return;
                    }
                    processNextAnswer();
                  },
                  error: (err) => {
                    logger.error(
                      `[PrologReasoner] Error processing answer for query "${query}": ${err}`
                    );
                    reject(new Error(`Prolog error processing answer: ${err}`));
                  },
                  fail: () => {
                    logger.info(
                      `[PrologReasoner] Query "${query}" failed to find a solution.`
                    );
                    const proofTrace = trace
                      ? formatTrace(session.thread.get_tree(), session)
                      : null;
                    resolve({ results, trace: proofTrace });
                  },
                  limit: () => {
                    logger.warn(
                      `[PrologReasoner] Query "${query}" exceeded execution limit.`
                    );
                    const proofTrace = trace
                      ? formatTrace(session.thread.get_tree(), session)
                      : null;
                    resolve({ results, trace: proofTrace });
                  },
                });
              }
              processNextAnswer();
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
 * Validates the syntax of a given knowledge base.
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

    try {
      session.consult(knowledgeBase);
    } catch (syncError) {
      consultError = syncError;
    }

    if (!consultError) {
      const consultPromise = new Promise((resolveConsult) => {
        session.consult(knowledgeBase, {
          success: () => resolveConsult(null),
          error: (err) => resolveConsult(err),
        });
      });
      consultError = await consultPromise;
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
    logger.error(
      `[PrologReasonerProvider] Exception during knowledge base validation process. Error: ${e.message}. Snippet: "${kbSnippet}"`
    );
    return { isValid: false, error: e.message };
  }
}

module.exports = {
  name: 'prolog',
  executeQuery,
  validate: validateKnowledgeBase,
};