// new/src/errors.js
const logger = require('./util/logger');

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
		logger.warn(
			`ApiError handled: ${err.statusCode} - ${err.message} (Code: ${err.errorCode}, CorrelationID: ${correlationId})`,
			{
				details: err.details,
				path: req.path,
				method: req.method,
			}
		);
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
		logger.error(
			`Unhandled error: ${err.message} (CorrelationID: ${correlationId})`,
			{
				error: err,
				stack: err.stack,
				path: req.path,
				method: req.method,
			}
		);
		res.status(500).json({
			error: {
				message: 'An internal server error occurred.',
				code: 'INTERNAL_SERVER_ERROR',
				correlationId,
			},
		});
	}
}

const ErrorCodes = {
	// General Errors
	UNKNOWN_ERROR: 'UNKNOWN_ERROR',
	INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',
	INVALID_INPUT: 'INVALID_INPUT',
	EMPTY_INPUT: 'EMPTY_INPUT',

	// LLM Errors
	LLM_REQUEST_FAILED: 'LLM_REQUEST_FAILED',
	LLM_EMPTY_RESPONSE: 'LLM_EMPTY_RESPONSE',
	PROMPT_TEMPLATE_NOT_FOUND: 'PROMPT_TEMPLATE_NOT_FOUND',
	PROMPT_TEMPLATE_INVALID: 'PROMPT_TEMPLATE_INVALID',
	PROMPT_FORMATTING_FAILED: 'PROMPT_FORMATTING_FAILED',

	// Strategy Errors
	STRATEGY_NOT_FOUND: 'STRATEGY_NOT_FOUND',
	INVALID_STRATEGY_DEFINITION: 'INVALID_STRATEGY_DEFINITION',
	INVALID_STRATEGY_NODE: 'INVALID_STRATEGY_NODE',
	UNKNOWN_NODE_TYPE: 'UNKNOWN_NODE_TYPE',
	INVALID_NODE_INPUT: 'INVALID_NODE_INPUT',
	STRATEGY_EXECUTION_ERROR: 'STRATEGY_EXECUTION_ERROR',
	STRATEGY_INVALID_OUTPUT: 'STRATEGY_INVALID_OUTPUT',

	// SIR Specific Errors
	INVALID_SIR_STRUCTURE: 'INVALID_SIR_STRUCTURE',
	INVALID_SIR_ARGUMENT: 'INVALID_SIR_ARGUMENT',
	JSON_PARSING_FAILED: 'JSON_PARSING_FAILED',

	// MCR/Session Errors
	SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',
	SESSION_ADD_FACTS_FAILED: 'SESSION_ADD_FACTS_FAILED',
	NO_FACTS_EXTRACTED: 'NO_FACTS_EXTRACTED',
	NO_RULES_EXTRACTED: 'NO_RULES_EXTRACTED',
	INVALID_GENERATED_PROLOG: 'INVALID_GENERATED_PROLOG',
	REASONER_ERROR: 'REASONER_ERROR',
	INTERNAL_KB_NOT_FOUND: 'INTERNAL_KB_NOT_FOUND', // For mcrService internal logic
	NO_STRATEGY_AVAILABLE: 'NO_STRATEGY_AVAILABLE', // When strategy manager has no strategies
	EMPTY_EXPLANATION_GENERATED: 'EMPTY_EXPLANATION_GENERATED', // Added missing error code

	// Config Errors
	CONFIG_VALIDATION_ERROR: 'CONFIG_VALIDATION_ERROR',

	// Demo Errors
	DEMO_LIST_FAILED: 'DEMO_LIST_FAILED',
	DEMO_NOT_FOUND: 'DEMO_NOT_FOUND',
	DEMO_INVALID: 'DEMO_INVALID', // e.g., file doesn't export correctly or run method missing
	DEMO_RUN_FAILED: 'DEMO_RUN_FAILED',

	// Evaluation Case / Curriculum Errors
	EVAL_CASE_FILE_NOT_FOUND: 'EVAL_CASE_FILE_NOT_FOUND',
	EVAL_CASE_INVALID_FORMAT: 'EVAL_CASE_INVALID_FORMAT',
	EVAL_CASE_LOAD_FAILED: 'EVAL_CASE_LOAD_FAILED',

	// Optimizer/Evolution Errors
	OPTIMIZER_RUNNING: 'OPTIMIZER_RUNNING',
	OPTIMIZER_NOT_RUNNING: 'OPTIMIZER_NOT_RUNNING',
	OPTIMIZER_START_FAILED: 'OPTIMIZER_START_FAILED',
	OPTIMIZER_STOP_FAILED: 'OPTIMIZER_STOP_FAILED',
};

class MCRError extends Error {
	constructor(code, message, details = null) {
		super(message);
		this.code = code || ErrorCodes.UNKNOWN_ERROR;
		this.details = details;
		// Ensuring the name property is set correctly for instances of MCRError
		this.name = this.constructor.name;
		Error.captureStackTrace(this, this.constructor);
	}
}

module.exports = {
	ApiError,
	errorHandlerMiddleware,
	MCRError,
	ErrorCodes,
};
