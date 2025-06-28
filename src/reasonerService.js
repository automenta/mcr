
const pl = require('tau-prolog');
const logger = require('./logger');
const ApiError = require('./errors');

const ReasonerService = {
    runQuery(facts, query) {
        return new Promise((resolve, reject) => {
            const prologSession = pl.create();
            try {
                prologSession.consult(facts.join(' '), {
                    success: () => {
                        prologSession.query(query, {
                            success: () => {
                                const results = [];
                                const answerCallback = (answer) => {
                                    if (!answer || answer.indicator === 'the_end/0') {
                                        return resolve(results);
                                    }
                                    if (pl.is_substitution(answer)) {
                                        results.push(prologSession.format_answer(answer, { quoted: true }));
                                    }
                                    try {
                                      prologSession.answer(answerCallback);
                                    } catch (e) {
                                      logger.error("Error processing Prolog answer.", {
                                          internalErrorCode: 'PROLOG_ANSWER_PROCESSING_ERROR',
                                          originalError: e.message,
                                          stack: e.stack
                                      });
                                      reject(new ApiError(500, `Prolog answer processing error: ${e.message}`));
                                    }
                                };
                                try {
                                  prologSession.answer(answerCallback);
                                } catch (e) {
                                  logger.error("Error initiating Prolog answer callback.", {
                                      internalErrorCode: 'PROLOG_ANSWER_INIT_ERROR',
                                      originalError: e.message,
                                      stack: e.stack
                                  });
                                  reject(new ApiError(500, `Prolog answer initiation error: ${e.message}`));
                                }
                            },
                            error: (err) => {
                                logger.error(`Prolog query failed.`, { internalErrorCode: 'PROLOG_QUERY_ERROR', query, details: err.toString() });
                                reject(new ApiError(422, `Prolog query failed: ${err.toString()}`))
                            }
                        });
                    },
                    error: (err) => {
                        logger.error(`Prolog knowledge base is invalid.`, { internalErrorCode: 'PROLOG_CONSULT_ERROR', factsCount: facts.length, details: err.toString() });
                        reject(new ApiError(422, `Prolog knowledge base is invalid: ${err.toString()}`))
                    }
                });
            } catch (e) {
                logger.error(`Error during Prolog session setup.`, { internalErrorCode: 'PROLOG_SESSION_SETUP_ERROR', factsCount: facts.length, query, originalError: e.message, stack: e.stack });
                reject(new ApiError(500, `Prolog session error: ${e.message}`));
            }
        });
    }
};

module.exports = ReasonerService;
