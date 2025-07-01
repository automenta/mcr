const SessionManager = require('../sessionManager');
const LlmService = require('../llmService');
const ReasonerService = require('../reasonerService');
const { logger } = require('../logger');
const ApiError = require('../errors');
const {
  validateNonEmptyString,
  validateOptionalString,
  validateStyle,
} = require('./handlerUtils');

// Helper function to build the debug information object for query responses
function _buildQueryDebugInfo(sessionId, query, fullKnowledgeBaseSentToReasoner, prologQueryGenerated, rawReasonerResults, simplifiedLogicResult, options) {
  const currentSessionForDebug = SessionManager.get(sessionId);
  return {
    factsInSession: currentSessionForDebug.facts,
    ontologyContextUsed: SessionManager.getNonSessionOntologyFacts(sessionId),
    fullKnowledgeBaseSentToReasoner: fullKnowledgeBaseSentToReasoner,
    prologQueryGenerated: prologQueryGenerated,
    rawReasonerResults: rawReasonerResults,
    inputToNlAnswerGeneration: {
      originalQuery: query,
      simplifiedLogicResult: simplifiedLogicResult,
      style: options.style || 'conversational',
    },
  };
}


function simplifyPrologResults(rawResults, loggerInstance) {
  if (!rawResults || rawResults.length === 0) {
    return 'No solution found.';
  }
  if (rawResults.length === 1 && rawResults[0] === 'true.') {
    return 'Yes.';
  }
  if (rawResults.length === 1 && rawResults[0] === 'false.') {
    return 'No.';
  }
  try {
    const processedResults = rawResults.map((r) => {
      if (typeof r === 'string' && (r.startsWith('{') || r.startsWith('['))) {
        try {
          return JSON.parse(r);
        } catch {
          return r;
        }
      }
      if (typeof r === 'object' || Array.isArray(r)) {
        return r;
      }
      return String(r);
    });

    if (processedResults.length === 1) {
      return processedResults[0];
    }
    return processedResults;
  } catch (e) {
    (loggerInstance || logger).warn(
      `Could not fully process Prolog results: ${JSON.stringify(rawResults)}. Returning as best effort. Error: ${e.message}`,
      {
        internalErrorCode: 'PROLOG_RESULT_PROCESSING_FAILED',
        rawResults,
        error: e.toString(),
      }
    );
    return rawResults.map((r) => String(r));
  }
}

const queryHandlers = {
  queryAsync: async (req, res, next) => {
    try {
      const { sessionId } = req.params;
      const { query, options = {}, ontology: requestOntology } = req.body;

      logger.debug(`Attempting to query session ${sessionId}`, {
        sessionId,
        queryLength: query?.length,
        options,
        requestOntologyProvided: !!requestOntology,
      });

      validateNonEmptyString(query, 'query', 'QUERY');
      if (options.style) {
        validateStyle(options.style, 'options.style', 'QUERY');
      }
      if (requestOntology) {
        validateOptionalString(requestOntology, 'ontology', 'QUERY');
      }
      if (options && typeof options !== 'object') {
        throw new ApiError(
          400,
          "Invalid 'options' field. Must be an object.",
          'QUERY_INVALID_OPTIONS_TYPE'
        );
      }

      const prologQuery = await LlmService.queryToPrologAsync(query);
      logger.info(
        `Session ${sessionId}: Translated NL query to Prolog: "${prologQuery}"`,
        { sessionId, prologQuery }
      );

      SessionManager.get(sessionId);

      const facts = SessionManager.getFactsWithOntology(
        sessionId,
        requestOntology
      );
      let rawResults;

      // Jules: Added detailed logging for facts and query before calling reasoner
      logger.debug(
        `Session ${sessionId}: About to run Prolog query. Query: "${prologQuery}". Facts: ${JSON.stringify(facts)}`,
        { sessionId, prologQuery, factsForReasoner: facts }
      );

      try {
        rawResults = await ReasonerService.runQuery(facts, prologQuery);
      } catch (reasonerError) {
        logger.error(
          `Error running Prolog query for session ${sessionId}: ${reasonerError.message}`,
          { sessionId, prologQuery, factsUsed: facts }
        );
        if (
          reasonerError.message.includes('Prolog syntax error') ||
          reasonerError.message.includes('error(syntax_error')
        ) {
          throw new ApiError(
            400,
            `The LLM generated an invalid Prolog query. Please try rephrasing your question. Details: ${reasonerError.message}`,
            'QUERY_PROLOG_SYNTAX_ERROR'
          );
        }
        throw new ApiError(
          500,
          `Reasoner error: ${reasonerError.message}`,
          'QUERY_REASONER_FAILED'
        );
      }

      const simpleResult = simplifyPrologResults(rawResults, logger);

      logger.info(
        `Session ${sessionId}: Prolog query returned: ${JSON.stringify(simpleResult)}`,
        { sessionId }
      );
      const finalAnswer = await LlmService.resultToNlAsync(
        query,
        JSON.stringify(simpleResult),
        options.style
      );

      // Jules: Add zero-shot LM comparison
      let zeroShotLmAnswer = null;
      try {
        // 'query' is the original user question from req.body
        zeroShotLmAnswer = await LlmService.getZeroShotAnswerAsync(query);
        logger.info(`Session ${sessionId}: Zero-shot LM answer: "${zeroShotLmAnswer}"`, { sessionId });
      } catch (lmError) {
        logger.warn(`Session ${sessionId}: Failed to get zero-shot LM answer: ${lmError.message}`, { sessionId, error: lmError.message, stack: lmError.stack });
        zeroShotLmAnswer = "Error: Could not retrieve zero-shot answer from LLM.";
      }

      const response = {
        queryProlog: prologQuery,
        result: simpleResult,
        answer: finalAnswer, // System's answer from reasoner + NL generation
        zeroShotLmAnswer: zeroShotLmAnswer, // Comparison answer from direct LLM query
        metadata: { success: true, steps: rawResults.length },
      };

      if (options.debug) {
        response.debug = _buildQueryDebugInfo(
          sessionId,
          query, // original user query
          facts, // fullKnowledgeBaseSentToReasoner
          prologQuery, // prologQueryGenerated
          rawResults, // rawReasonerResults
          simpleResult, // simplifiedLogicResult
          options // to get options.style
        );
        logger.info(`Session ${sessionId}: Debug mode enabled for query. Debug data assembled.`, {
          correlationId: req.correlationId,
          // debugData: response.debug, // Avoid logging potentially large debug data twice here
        });
      }
      res.json(response);
    } catch (err) {
      next(err);
    }
  },

  explainQueryAsync: async (req, res, next) => {
    try {
      const { sessionId } = req.params;
      const { query } = req.body;
      validateNonEmptyString(query, 'query', 'EXPLAIN_QUERY');

      const currentSession = SessionManager.get(sessionId);
      const facts = currentSession.facts;
      const ontologyContext =
        SessionManager.getNonSessionOntologyFacts(sessionId);
      const explanation = await LlmService.explainQueryAsync(
        query,
        facts,
        ontologyContext
      );
      res.json({ query, explanation });
    } catch (err) {
      next(err);
    }
  },
  _simplifyPrologResults: simplifyPrologResults,
};

module.exports = queryHandlers;
