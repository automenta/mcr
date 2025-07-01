// new/src/apiHandlers.js
const mcrService = require('./mcrService');
const { ApiError } = require('./errors');
const logger = require('./logger');

async function createSessionHandler(req, res, next) {
  try {
    const session = mcrService.createSession();
    logger.info(`[API] Session created: ${session.id}`);
    res.status(201).json(session);
  } catch (error) {
    logger.error('[API] Error creating session:', error);
    next(new ApiError(500, 'Failed to create session.'));
  }
}

async function assertToSessionHandler(req, res, next) {
  const { sessionId } = req.params;
  const { text } = req.body;

  if (!text || typeof text !== 'string' || text.trim() === '') {
    return next(new ApiError(400, 'Invalid input: "text" property is required in the request body and must be a non-empty string.'));
  }

  try {
    logger.info(`[API] Asserting to session ${sessionId}: "${text}"`);
    const result = await mcrService.assertNLToSession(sessionId, text);
    if (result.success) {
      res.status(200).json({ message: result.message, addedFacts: result.addedFacts });
    } else {
      // Determine appropriate status code based on error type
      if (result.message === 'Session not found.') {
        next(new ApiError(404, result.message, 'SESSION_NOT_FOUND'));
      } else if (result.error === 'conversion_to_fact_failed' || result.error === 'no_facts_extracted') {
        next(new ApiError(400, result.message, result.error.toUpperCase()));
      }
      else {
        next(new ApiError(500, result.message || 'Failed to assert to session.', result.error || 'ASSERT_FAILED'));
      }
    }
  } catch (error) {
    logger.error(`[API] Error asserting to session ${sessionId}:`, error);
    next(new ApiError(500, `Failed to assert to session: ${error.message}`));
  }
}

async function querySessionHandler(req, res, next) {
  const { sessionId } = req.params;
  const { query } = req.body;

  if (!query || typeof query !== 'string' || query.trim() === '') {
    return next(new ApiError(400, 'Invalid input: "query" property is required in the request body and must be a non-empty string.'));
  }

  try {
    logger.info(`[API] Querying session ${sessionId}: "${query}"`);
    const result = await mcrService.querySessionWithNL(sessionId, query);
    if (result.success) {
      res.status(200).json({ answer: result.answer, debugInfo: result.debugInfo });
    } else {
      if (result.message === 'Session not found.') {
         next(new ApiError(404, result.message, 'SESSION_NOT_FOUND'));
      } else if (result.error === 'invalid_prolog_query') {
         next(new ApiError(400, result.message, result.error.toUpperCase(), result.debugInfo));
      }
      else {
         next(new ApiError(500, result.message || 'Failed to query session.', result.error || 'QUERY_FAILED', result.debugInfo));
      }
    }
  } catch (error) {
    logger.error(`[API] Error querying session ${sessionId}:`, error);
    next(new ApiError(500, `Failed to query session: ${error.message}`));
  }
}

async function getSessionHandler(req, res, next) {
    const { sessionId } = req.params;
    try {
        const session = mcrService.getSession(sessionId);
        if (session) {
            logger.info(`[API] Retrieved session: ${sessionId}`);
            res.status(200).json(session);
        } else {
            logger.warn(`[API] Get session: Session not found: ${sessionId}`);
            next(new ApiError(404, 'Session not found.', 'SESSION_NOT_FOUND'));
        }
    } catch (error) {
        logger.error(`[API] Error retrieving session ${sessionId}:`, error);
        next(new ApiError(500, `Failed to retrieve session: ${error.message}`));
    }
}

async function deleteSessionHandler(req, res, next) {
    const { sessionId } = req.params;
    try {
        const deleted = mcrService.deleteSession(sessionId);
        if (deleted) {
            logger.info(`[API] Session deleted: ${sessionId}`);
            res.status(200).json({ message: `Session ${sessionId} deleted successfully.` });
        } else {
            logger.warn(`[API] Delete session: Session not found: ${sessionId}`);
            next(new ApiError(404, 'Session not found.', 'SESSION_NOT_FOUND'));
        }
    } catch (error) {
        logger.error(`[API] Error deleting session ${sessionId}:`, error);
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
