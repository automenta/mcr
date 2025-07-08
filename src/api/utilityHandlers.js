// new/src/api/utilityHandlers.js
const mcrService = require('../mcrService');
const { ApiError } = require('../errors');
const logger = require('../logger');
const { name, version, description } = require('../../package.json'); // Adjusted path
const config = require('../config');


async function getStatusHandler(req, res, next) {
  const correlationId = req.correlationId;
  logger.info(`[API][${correlationId}] Enter getStatusHandler`);
  try {
    const statusInfo = {
      status: 'ok',
      name,
      version,
      description,
      message: 'MCR Streamlined API is running.',
      llmProvider: config.llm.provider,
      correlationId, // Include correlation ID in status response for easier tracing
    };
    logger.info(
      `[API][${correlationId}] Successfully retrieved server status.`
    );
    res.status(200).json(statusInfo);
  } catch (error) {
    logger.error(`[API][${correlationId}] Error in getStatusHandler:`, {
      error: error.stack,
    });
    next(new ApiError(500, 'Failed to retrieve server status.'));
  }
}

async function getPromptsHandler(req, res, next) {
  const correlationId = req.correlationId;
  logger.info(`[API][${correlationId}] Enter getPromptsHandler`);
  try {
    const result = await mcrService.getPrompts();
    if (result.success) {
      logger.info(
        `[API][${correlationId}] Successfully retrieved all prompt templates. Count: ${Object.keys(result.prompts).length}`
      );
      res.status(200).json(result.prompts);
    } else {
      logger.error(
        `[API][${correlationId}] Failed to get prompts from mcrService. Message: ${result.message}`
      );
      next(
        new ApiError(
          500,
          result.message || 'Failed to get prompts.',
          'GET_PROMPTS_FAILED'
        )
      );
    }
  } catch (error) {
    logger.error(
      `[API][${correlationId}] Error in getPromptsHandler: ${error.message}`,
      { error: error.stack }
    );
    next(new ApiError(500, `Failed to get prompts: ${error.message}`));
  }
}

async function debugFormatPromptHandler(req, res, next) {
  const correlationId = req.correlationId;
  const { templateName, inputVariables } = req.body;
  logger.info(
    `[API][${correlationId}] Enter debugFormatPromptHandler for template: ${templateName}`,
    { keys: inputVariables ? Object.keys(inputVariables) : null }
  );

  if (
    !templateName ||
    typeof templateName !== 'string' ||
    templateName.trim() === ''
  ) {
    logger.warn(
      `[API][${correlationId}] Invalid input for debugFormatPromptHandler: "templateName" is missing or invalid.`
    );
    return next(
      new ApiError(400, 'Invalid input: "templateName" is required.')
    );
  }
  if (!inputVariables || typeof inputVariables !== 'object') {
    logger.warn(
      `[API][${correlationId}] Invalid input for debugFormatPromptHandler: "inputVariables" is not an object.`
    );
    return next(
      new ApiError(400, 'Invalid input: "inputVariables" must be an object.')
    );
  }

  try {
    logger.debug(
      `[API][${correlationId}] Calling mcrService.debugFormatPrompt for template: ${templateName}`
    );
    const result = await mcrService.debugFormatPrompt(
      templateName,
      inputVariables
    );
    if (result.success) {
      logger.info(
        `[API][${correlationId}] Successfully formatted prompt for debug: ${templateName}`
      );
      res.status(200).json({
        templateName: result.templateName,
        rawTemplate: result.rawTemplate, // Potentially large, be mindful
        formattedUserPrompt: result.formattedUserPrompt, // Potentially large
        inputVariables: result.inputVariables, // Potentially large/sensitive
      });
    } else {
      logger.warn(
        `[API][${correlationId}] Failed to format prompt for debug: ${templateName}. Message: ${result.message}, Error: ${result.error}`
      );
      let statusCode = 500;
      // mcrService now returns uppercase error codes
      if (
        result.error === 'INVALID_TEMPLATE_NAME' ||
        result.error === 'INVALID_INPUT_VARIABLES' ||
        result.error === 'TEMPLATE_NOT_FOUND' ||
        result.error === 'TEMPLATE_USER_FIELD_MISSING'
      ) {
        statusCode = 400;
      }
      next(
        new ApiError(
          statusCode,
          result.message || 'Failed to format prompt.',
          result.error || 'DEBUG_FORMAT_PROMPT_FAILED', // Already uppercase from mcrService or default
          result.details
        )
      );
    }
  } catch (error) {
    logger.error(
      `[API][${correlationId}] Unexpected error in debugFormatPromptHandler for ${templateName}: ${error.message}`,
      { error: error.stack }
    );
    next(
      new ApiError(
        500,
        `An unexpected error occurred during prompt formatting: ${error.message}`,
        'UNEXPECTED_DEBUG_FORMAT_ERROR'
      )
    );
  }
}

module.exports = {
  getStatusHandler,
  getPromptsHandler,
  debugFormatPromptHandler,
};
