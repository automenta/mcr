// new/src/api/translationHandlers.js
const mcrService = require('../mcrService');
const { ApiError } = require('../errors');
const logger = require('../util/logger');
const config = require('../config');

async function nlToRulesDirectHandler(req, res, next) {
  const correlationId = req.correlationId;
  const { text } = req.body;
  logger.info(
    `[API][${correlationId}] Enter nlToRulesDirectHandler. Text length: ${text?.length}`
  );

  if (!text || typeof text !== 'string' || text.trim() === '') {
    logger.warn(
      `[API][${correlationId}] Invalid input for nlToRulesDirectHandler: "text" is missing or invalid.`
    );
    return next(
      new ApiError(
        400,
        'Invalid input: "text" property is required and must be a non-empty string.'
      )
    );
  }

  try {
    logger.debug(
      `[API][${correlationId}] Calling mcrService.translateNLToRulesDirect. Text: "${text}"`
    );
    const result = await mcrService.translateNLToRulesDirect(text);
    if (result.success) {
      logger.info(
        `[API][${correlationId}] Successfully translated NL to Rules (Direct). Rules count: ${result.rules?.length}`
      );
      res.status(200).json({
        rules: result.rules,
        rawOutput: result.rawOutput,
        cost: result.cost,
      }); // Added cost
    } else {
      logger.warn(
        `[API][${correlationId}] Failed to translate NL to Rules (Direct). Message: ${result.message}, Error: ${result.error}`
      );
      next(
        new ApiError(
          result.error === 'NO_RULES_EXTRACTED_BY_STRATEGY' ? 400 : 500, // Corrected error code
          result.message || 'Failed to translate NL to Rules.',
          result.error ? result.error.toUpperCase() : 'NL_TO_RULES_FAILED', // Use standardized code from mcrService
          result.details // Pass details if provided by mcrService
        )
      );
    }
  } catch (error) {
    // This catch block is for unexpected errors not handled by mcrService's structured return
    logger.error(
      `[API][${correlationId}] Unexpected error in nlToRulesDirectHandler: ${error.message}`,
      { error: error.stack }
    );
    next(
      new ApiError(
        500,
        `An unexpected error occurred during NL to Rules translation: ${error.message}`,
        'UNEXPECTED_NL_TO_RULES_ERROR'
      )
    );
  }
}

async function rulesToNlDirectHandler(req, res, next) {
  const correlationId = req.correlationId;
  const { rules: rulesInput, style } = req.body;
  logger.info(
    `[API][${correlationId}] Enter rulesToNlDirectHandler. Style: ${style}. Input type: ${typeof rulesInput}`
  );
  let rulesString;

  if (!rulesInput) {
    logger.warn(
      `[API][${correlationId}] Invalid input for rulesToNlDirectHandler: "rules" is missing.`
    );
    return next(
      new ApiError(400, 'Invalid input: "rules" property is required.')
    );
  }

  if (Array.isArray(rulesInput)) {
    logger.debug(
      `[API][${correlationId}] Processing array of rules for rulesToNlDirectHandler. Count: ${rulesInput.length}`
    );
    rulesString = rulesInput
      .map((r) => r.trim())
      .filter((r) => r.length > 0)
      .map((r) => (r.endsWith('.') ? r : `${r}.`))
      .join('\n');
  } else if (typeof rulesInput === 'string') {
    logger.debug(
      `[API][${correlationId}] Processing string of rules for rulesToNlDirectHandler. Length: ${rulesInput.length}`
    );
    rulesString = rulesInput.trim();
  } else {
    logger.warn(
      `[API][${correlationId}] Invalid input type for "rules" in rulesToNlDirectHandler.`
    );
    return next(
      new ApiError(
        400,
        'Invalid input: "rules" must be a string or an array of strings.'
      )
    );
  }

  if (rulesString === '') {
    logger.warn(
      `[API][${correlationId}] "rules" property is empty after processing for rulesToNlDirectHandler.`
    );
    return next(
      new ApiError(
        400,
        'Invalid input: "rules" property must not be empty after processing.'
      )
    );
  }
  logger.debug(
    `[API][${correlationId}] Processed rules string length: ${rulesString.length}`
  );

  if (
    style &&
    (typeof style !== 'string' ||
      !['formal', 'conversational'].includes(style.toLowerCase()))
  ) {
    logger.warn(
      `[API][${correlationId}] Invalid "style" for rulesToNlDirectHandler: ${style}`
    );
    return next(
      new ApiError(
        400,
        'Invalid input: "style" must be "formal" or "conversational".'
      )
    );
  }

  try {
    logger.debug(
      `[API][${correlationId}] Calling mcrService.translateRulesToNLDirect. Style: ${style || 'conversational'}`
    );
    const result = await mcrService.translateRulesToNLDirect(
      rulesString,
      style
    );
    if (result.success) {
      logger.info(
        `[API][${correlationId}] Successfully translated Rules to NL (Direct). Explanation length: ${result.explanation?.length}`
      );
      res
        .status(200)
        .json({ explanation: result.explanation, cost: result.cost }); // Added cost
    } else {
      logger.warn(
        `[API][${correlationId}] Failed to translate Rules to NL (Direct). Message: ${result.message}, Error: ${result.error}`
      );
      let statusCode = 500;
      let errorCode = (result.error || 'RULES_TO_NL_FAILED').toUpperCase();

      if (
        errorCode === 'EMPTY_RULES_INPUT' ||
        errorCode === 'EMPTY_EXPLANATION_GENERATED'
      ) {
        statusCode = 400;
      }
      // Consider other mcrService error codes if any

      next(
        new ApiError(
          statusCode,
          result.message || 'Failed to translate Rules to NL.',
          errorCode,
          result.details
        )
      );
    }
  } catch (error) {
    logger.error(
      `[API][${correlationId}] Unexpected error in rulesToNlDirectHandler: ${error.message}`,
      { error: error.stack }
    );
    next(
      new ApiError(
        500,
        `An unexpected error occurred during Rules to NL translation: ${error.message}`,
        'UNEXPECTED_RULES_TO_NL_ERROR'
      )
    );
  }
}

async function explainQueryHandler(req, res, next) {
  const correlationId = req.correlationId;
  const { sessionId } = req.params;
  const { query: naturalLanguageQuestion, options } = req.body; // Allow options for debug
  logger.info(
    `[API][${correlationId}] Enter explainQueryHandler for session ${sessionId}. NLQ length: ${naturalLanguageQuestion?.length}`,
    { options }
  );

  if (
    !naturalLanguageQuestion ||
    typeof naturalLanguageQuestion !== 'string' ||
    naturalLanguageQuestion.trim() === ''
  ) {
    logger.warn(
      `[API][${correlationId}] Invalid input for explainQueryHandler: "query" is missing or invalid.`
    );
    return next(
      new ApiError(
        400,
        'Invalid input: "query" property (natural language question) is required.'
      )
    );
  }

  try {
    logger.debug(
      `[API][${correlationId}] Calling mcrService.explainQuery for session ${sessionId}. NLQ: "${naturalLanguageQuestion}"`
    );
    // Pass client's debug request to mcrService for explainQuery
    const clientRequestedDebugExplain =
      options && typeof options.debug === 'boolean' ? options.debug : false;
    const serverDebugLevelExplain = config.debugLevel;

    const result = await mcrService.explainQuery(
      sessionId,
      naturalLanguageQuestion,
      { debug: clientRequestedDebugExplain } // Pass debug hint to service
    );

    if (result.success) {
      logger.info(
        `[API][${correlationId}] Successfully explained query for session ${sessionId}. Explanation length: ${result.explanation?.length}`
      );
      const responsePayload = {
        explanation: result.explanation,
        cost: result.cost,
      }; // Added cost
      // Similar logic for including debugInfo as in querySessionHandler
      if (
        clientRequestedDebugExplain &&
        result.debugInfo &&
        serverDebugLevelExplain !== 'none'
      ) {
        responsePayload.debugInfo = result.debugInfo;
        logger.debug(
          `[API][${correlationId}] Including debugInfo in explain response for session ${sessionId} (level: ${result.debugInfo.level}).`
        );
      }
      res.status(200).json(responsePayload);
    } else {
      logger.warn(
        `[API][${correlationId}] Failed to explain query for session ${sessionId}. Message: ${result.message}, Error: ${result.error}, Details: ${JSON.stringify(result.details)}`,
        { debugInfo: result.debugInfo }
      );
      let statusCode = 500;
      let errorCode = (result.error || 'EXPLAIN_QUERY_FAILED').toUpperCase();
      let errorDetails =
        result.debugInfo && result.debugInfo.error
          ? { serviceError: result.debugInfo.error, ...result.debugInfo }
          : result.debugInfo;
      if (result.details) {
        errorDetails = {
          ...(errorDetails || {}),
          serviceDetails: result.details,
        };
      }

      if (errorCode === 'SESSION_NOT_FOUND') {
        statusCode = 404;
      } else if (
        errorCode === 'EMPTY_EXPLANATION_GENERATED' ||
        errorCode === 'STRATEGY_QUERY_FAILED' // If query translation by strategy fails
      ) {
        statusCode = 400; // Problem with input or translation leading to no explanation
      }

      next(
        new ApiError(
          statusCode,
          result.message || 'Failed to explain query.',
          errorCode,
          errorDetails
        )
      );
    }
  } catch (error) {
    logger.error(
      `[API][${correlationId}] Unexpected error in explainQueryHandler for session ${sessionId}: ${error.message}`,
      { error: error.stack }
    );
    next(
      new ApiError(
        500,
        `An unexpected error occurred during query explanation: ${error.message}`,
        'UNEXPECTED_EXPLAIN_QUERY_ERROR'
      )
    );
  }
}

module.exports = {
  nlToRulesDirectHandler,
  rulesToNlDirectHandler,
  explainQueryHandler,
};
