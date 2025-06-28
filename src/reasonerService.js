
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
                                      logger.error("Error processing Prolog answer: ", e);
                                      reject(new ApiError(500, `Prolog answer processing error: ${e.message}`));
                                    }
                                };
                                try {
                                  prologSession.answer(answerCallback);
                                } catch (e) {
                                  logger.error("Error initiating Prolog answer callback: ", e);
                                  reject(new ApiError(500, `Prolog answer initiation error: ${e.message}`));
                                }
                            },
                            error: (err) => {
                                logger.error(`Prolog query failed: ${err}`, { query });
                                reject(new ApiError(422, `Prolog query failed: ${err}`))
                            }
                        });
                    },
                    error: (err) => {
                        logger.error(`Prolog knowledge base is invalid: ${err}`, { facts });
                        reject(new ApiError(422, `Prolog knowledge base is invalid: ${err}`))
                    }
                });
            } catch (e) {
                logger.error(`Error during Prolog session setup: ${e.message}`, { facts, query });
                reject(new ApiError(500, `Prolog session error: ${e.message}`));
            }
        });
    }
};

module.exports = ReasonerService;
