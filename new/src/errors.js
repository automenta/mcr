// new/src/errors.js
const logger = require('./logger');

class ApiError extends Error {
  constructor(statusCode, message, errorCode = 'API_ERROR', details = null) {
    super(message);
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

// eslint-disable-next-line no-unused-vars
function errorHandlerMiddleware(err, req, res, next) {
  const correlationId = req.headers['x-correlation-id'] || `gen-${Date.now()}`; // Simple correlation ID

  if (err instanceof ApiError) {
    logger.warn(`ApiError handled: ${err.statusCode} - ${err.message} (Code: ${err.errorCode}, CorrelationID: ${correlationId})`, {
        details: err.details,
        path: req.path,
        method: req.method
    });
    res.status(err.statusCode).json({
      error: {
        message: err.message,
        code: err.errorCode,
        details: err.details,
        correlationId,
      },
    });
  } else {
    // For unexpected errors
    logger.error(`Unhandled error: ${err.message} (CorrelationID: ${correlationId})`, {
        error: err,
        stack: err.stack,
        path: req.path,
        method: req.method
    });
    res.status(500).json({
      error: {
        message: 'An internal server error occurred.',
        code: 'INTERNAL_SERVER_ERROR',
        correlationId,
      },
    });
  }
}

module.exports = {
  ApiError,
  errorHandlerMiddleware,
};
