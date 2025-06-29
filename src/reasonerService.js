const pl = require('tau-prolog');
const { logger } = require('./logger'); // Corrected import
const ApiError = require('./errors');

/**
 * Service for interacting with the Tau Prolog reasoner.
 */
const ReasonerService = {
  /**
   * Runs a Prolog query against a given set of facts.
   * @param {string[]} facts - An array of Prolog facts and rules to consult.
   * @param {string} query - The Prolog query string to execute.
   * @returns {Promise<string[]>} A promise that resolves to an array of formatted answer strings.
   * @throws {ApiError} If there's an error during Prolog session setup, consultation, querying, or answer processing.
   */
  runQuery(facts, query) {
    return new Promise((resolve, reject) => {
      try {
        const prologSession = pl.create();
        prologSession.consult(facts.join(' '), {
          success: () => {
            prologSession.query(query, {
              success: () => {
                const results = [];
                const answerCallback = (answer) => {
                  if (!answer || answer.indicator === 'the_end/0') {
                    resolve(results);
                    return;
                  }
                  if (pl.is_substitution(answer)) {
                    results.push(
                      prologSession.format_answer(answer, { quoted: true })
                    );
                  }
                  try {
                    prologSession.answer(answerCallback);
                     // Explicit return
                  } catch (e) {
                    logger.error('Error processing Prolog answer.', {
                      internalErrorCode: 'PROLOG_ANSWER_PROCESSING_ERROR',
                      originalError: e.message,
                      stack: e.stack,
                    });
                    reject(
                      new ApiError(
                        500,
                        `Prolog answer processing error: ${e.message}`,
                        'PROLOG_ANSWER_ERROR'
                      )
                    );
                     // Explicit return
                  }
                };
                try {
                  prologSession.answer(answerCallback);
                } catch (e) {
                  logger.error('Error initiating Prolog answer callback.', {
                    internalErrorCode: 'PROLOG_ANSWER_INIT_ERROR',
                    originalError: e.message,
                    stack: e.stack,
                  });
                  reject(
                    new ApiError(
                      500,
                      `Prolog answer initiation error: ${e.message}`,
                      'PROLOG_ANSWER_INIT_ERROR'
                    )
                  );
                   // Explicit return for consistent-return
                }
              },
              error: (err) => {
                logger.error('Prolog query failed.', {
                  internalErrorCode: 'PROLOG_QUERY_ERROR',
                  query,
                  details: err.toString(),
                });
                reject(
                  new ApiError(
                    422,
                    `Prolog query failed: ${err.toString()}`,
                    'PROLOG_QUERY_FAILED'
                  )
                );
              },
            });
          },
          error: (err) => {
            logger.error('Prolog knowledge base is invalid.', {
              internalErrorCode: 'PROLOG_CONSULT_ERROR',
              factsCount: facts.length,
              details: err.toString(),
            });
            reject(
              new ApiError(
                422,
                `Prolog knowledge base is invalid: ${err.toString()}`,
                'PROLOG_CONSULT_FAILED'
              )
            );
          },
        });
      } catch (e) {
        logger.error('Error during Prolog session setup.', {
          internalErrorCode: 'PROLOG_SESSION_SETUP_ERROR',
          factsCount: facts.length,
          query,
          originalError: e.message,
          stack: e.stack,
        });
        reject(
          new ApiError(
            500,
            `Prolog session error: ${e.message}`,
            'PROLOG_SESSION_ERROR'
          )
        );
      }
    });
  },
};

module.exports = ReasonerService;
