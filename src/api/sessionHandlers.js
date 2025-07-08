// new/src/api/sessionHandlers.js
const mcrService = require('../mcrService');
const { ApiError } = require('../errors');
const logger = require('../util/logger');
const config = require('../config');

async function createSessionHandler(req, res, next) {
  const correlationId = req.correlationId;
  logger.info(`[API][${correlationId}] Enter createSessionHandler`);
  try {
    const session = await mcrService.createSession(); // Added await
    logger.info(
      `[API][${correlationId}] Session created successfully: ${session.id}`
    );
    res.status(201).json(session);
  } catch (error) {
    logger.error(`[API][${correlationId}] Error creating session:`, {
      error: error.stack,
    });
    next(new ApiError(500, 'Failed to create session.'));
  }
}

async function assertToSessionHandler(req, res, next) {
  const correlationId = req.correlationId;
  const { sessionId } = req.params;
  const { text } = req.body;
  logger.info(
    `[API][${correlationId}] Enter assertToSessionHandler for session ${sessionId}. Text length: ${text?.length}`
  );

  if (!text || typeof text !== 'string' || text.trim() === '') {
    logger.warn(
      `[API][${correlationId}] Invalid input for assertToSessionHandler: "text" is missing or invalid.`
    );
    return next(
      new ApiError(
        400,
        'Invalid input: "text" property is required in the request body and must be a non-empty string.'
      )
    );
  }

  try {
    logger.debug(
      `[API][${correlationId}] Calling mcrService.assertNLToSession for session ${sessionId}. Text: "${text}"`
    );
    const result = await mcrService.assertNLToSession(sessionId, text);
    if (result.success) {
      logger.info(
        `[API][${correlationId}] Successfully asserted to session ${sessionId}. Facts added: ${result.addedFacts?.length}`
      );
      res.status(200).json({
        message: result.message,
        addedFacts: result.addedFacts,
        cost: result.cost,
      }); // Added cost
    } else {
      logger.warn(
        `[API][${correlationId}] Failed to assert to session ${sessionId}. Message: ${result.message}, Error: ${result.error}`
      );
      // Determine appropriate status code based on error type
      // Standardized error codes from mcrService are now in result.error
      let statusCode = 500; // Default to internal server error
      let errorCode = (result.error || 'ASSERT_FAILED').toUpperCase();
      let errorDetails = result.details;

      if (errorCode === 'SESSION_NOT_FOUND') {
        statusCode = 404;
      } else if (
        errorCode === 'NO_FACTS_EXTRACTED_BY_STRATEGY' ||
        errorCode === 'INVALID_GENERATED_PROLOG' ||
        errorCode === 'STRATEGY_ASSERT_FAILED' // Assuming strategy errors might be client-correctable if prompt is bad
      ) {
        // Consider 400 if the error implies a bad request (e.g., text cannot be translated)
        // For INVALID_GENERATED_PROLOG, it's a server-side translation producing bad output, but from client text.
        // Let's use 400 for these as they often stem from the nature of the input text.
        statusCode = 400;
      }
      // For other errors like SESSION_ADD_FACTS_FAILED, 500 is appropriate.

      next(
        new ApiError(
          statusCode,
          result.message || 'Failed to assert to session.',
          errorCode,
          errorDetails // Pass details to ApiError
        )
      );
    }
  } catch (error) {
    // This catch block is for unexpected errors not handled by mcrService's structured return
    logger.error(
      `[API][${correlationId}] Unexpected error asserting to session ${sessionId}:`,
      { error: error.stack }
    );
    next(
      new ApiError(
        500,
        `An unexpected error occurred during assertion: ${error.message}`,
        'UNEXPECTED_ASSERT_ERROR'
      )
    );
  }
}

async function querySessionHandler(req, res, next) {
  const correlationId = req.correlationId;
  const { sessionId } = req.params;
  const { query, options } = req.body; // Extract options from body
  logger.info(
    `[API][${correlationId}] Enter querySessionHandler for session ${sessionId}. Query length: ${query?.length}`,
    { options }
  );

  if (!query || typeof query !== 'string' || query.trim() === '') {
    logger.warn(
      `[API][${correlationId}] Invalid input for querySessionHandler: "query" is missing or invalid.`
    );
    return next(
      new ApiError(
        400,
        'Invalid input: "query" property is required in the request body and must be a non-empty string.'
      )
    );
  }

  // Validate options.dynamicOntology if provided
  const dynamicOntology = options && options.dynamicOntology;
  if (dynamicOntology && typeof dynamicOntology !== 'string') {
    logger.warn(
      `[API][${correlationId}] Invalid input for querySessionHandler: "options.dynamicOntology" is not a string.`
    );
    return next(
      new ApiError(
        400,
        'Invalid input: "options.dynamicOntology" must be a string if provided.'
      )
    );
  }

  // Server's debugLevel from config
  const serverDebugLevel = config.debugLevel;
  // Client's requested debug flag
  const clientRequestedDebug =
    options && typeof options.debug === 'boolean' ? options.debug : false;

  const serviceOptions = {
    dynamicOntology: dynamicOntology,
    style: options && options.style ? options.style : 'conversational',
    // Pass the client's debug request to mcrService,
    // mcrService will then use its own config.debugLevel to shape the actual debugInfo content.
    // The 'debug' flag here tells mcrService that the client is interested in debug output.
    debug: clientRequestedDebug,
  };
  logger.debug(
    `[API][${correlationId}] Service options for query (clientDebug: ${clientRequestedDebug}, serverDebug: ${serverDebugLevel}):`,
    serviceOptions
  );

  try {
    logger.debug(
      `[API][${correlationId}] Calling mcrService.querySessionWithNL for session ${sessionId}. Query: "${query}"`
    );
    const result = await mcrService.querySessionWithNL(
      sessionId,
      query,
      serviceOptions
    );
    if (result.success) {
      logger.info(
        `[API][${correlationId}] Successfully queried session ${sessionId}. Answer length: ${result.answer?.length}`
      );
      const responsePayload = { answer: result.answer, cost: result.cost }; // Added cost

      // Only include debugInfo in response if client requested it AND server's level allows some form of it.
      // mcrService now shapes debugInfo based on its config.debugLevel.
      // apiHandler respects client's "options.debug" to include it or not.
      if (
        clientRequestedDebug &&
        result.debugInfo &&
        serverDebugLevel !== 'none'
      ) {
        responsePayload.debugInfo = result.debugInfo;
        logger.debug(
          `[API][${correlationId}] Including debugInfo in response for session ${sessionId} (level: ${result.debugInfo.level}).`
        );
      }
      res.status(200).json(responsePayload);
    } else {
      logger.warn(
        `[API][${correlationId}] Failed to query session ${sessionId}. Message: ${result.message}, Error: ${result.error}, Details: ${JSON.stringify(result.details)}`,
        { debugInfo: result.debugInfo }
      );
      // Standardized error codes from mcrService are now in result.error
      let statusCode = 500; // Default to internal server error
      let errorCode = (result.error || 'QUERY_FAILED').toUpperCase();
      // debugInfo from mcrService might contain the original error message if it's a STRATEGY_QUERY_FAILED
      let errorDetails =
        result.debugInfo && result.debugInfo.error
          ? { serviceError: result.debugInfo.error, ...result.debugInfo }
          : result.debugInfo;
      if (result.details) {
        // If mcrService explicitly provides details
        errorDetails = {
          ...(errorDetails || {}),
          serviceDetails: result.details,
        };
      }

      if (errorCode === 'SESSION_NOT_FOUND') {
        statusCode = 404;
      } else if (
        errorCode === 'STRATEGY_QUERY_FAILED' // Assuming strategy errors might be client-correctable
        // Add other specific 400 error codes from mcrService.querySessionWithNL if any
      ) {
        statusCode = 400; // Or 500 if it's truly an internal strategy problem not due to input
      } else if (errorCode === 'INTERNAL_KB_NOT_FOUND_FOR_SESSION') {
        statusCode = 500; // This is an internal server error
      }
      // For other errors, 500 is appropriate.

      next(
        new ApiError(
          statusCode,
          result.message || 'Failed to query session.',
          errorCode,
          errorDetails // Pass potentially augmented debugInfo as details
        )
      );
    }
  } catch (error) {
    // This catch block is for unexpected errors not handled by mcrService's structured return
    logger.error(
      `[API][${correlationId}] Unexpected error querying session ${sessionId}:`,
      { error: error.stack }
    );
    next(
      new ApiError(
        500,
        `An unexpected error occurred during query: ${error.message}`,
        'UNEXPECTED_QUERY_ERROR'
      )
    );
  }
}

async function getSessionHandler(req, res, next) {
  const correlationId = req.correlationId;
  const { sessionId } = req.params;
  logger.info(
    `[API][${correlationId}] Enter getSessionHandler for session ${sessionId}`
  );
  try {
    const session = await mcrService.getSession(sessionId); // Await async call
    if (session) {
      logger.info(
        `[API][${correlationId}] Successfully retrieved session ${sessionId}.`
      );
      res.status(200).json(session);
    } else {
      logger.warn(
        `[API][${correlationId}] Session not found for getSessionHandler: ${sessionId}`
      );
      next(new ApiError(404, 'Session not found.', 'SESSION_NOT_FOUND'));
    }
  } catch (error) {
    logger.error(
      `[API][${correlationId}] Error retrieving session ${sessionId}:`,
      { error: error.stack }
    );
    next(new ApiError(500, `Failed to retrieve session: ${error.message}`));
  }
}

async function deleteSessionHandler(req, res, next) {
  const correlationId = req.correlationId;
  const { sessionId } = req.params;
  logger.info(
    `[API][${correlationId}] Enter deleteSessionHandler for session ${sessionId}`
  );
  try {
    const deleted = await mcrService.deleteSession(sessionId); // Added await
    if (deleted) {
      logger.info(
        `[API][${correlationId}] Successfully deleted session ${sessionId}.`
      );
      res
        .status(200)
        .json({ message: `Session ${sessionId} deleted successfully.` });
    } else {
      logger.warn(
        `[API][${correlationId}] Session not found for deleteSessionHandler: ${sessionId}`
      );
      next(new ApiError(404, 'Session not found.', 'SESSION_NOT_FOUND'));
    }
  } catch (error) {
    logger.error(
      `[API][${correlationId}] Error deleting session ${sessionId}:`,
      { error: error.stack }
    );
    next(new ApiError(500, `Failed to delete session: ${error.message}`));
  }
}

module.exports = {
  createSessionHandler,
  assertToSessionHandler,
  querySessionHandler,
  getSessionHandler,
  deleteSessionHandler,
};
