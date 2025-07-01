const LlmService = require('../llmService');
const ApiError = require('../errors');
const { PromptTemplate } = require('@langchain/core/prompts'); // Moved here
const { logger } = require('../logger');
const { validateNonEmptyString } = require('./handlerUtils');
const {
  version: appVersion,
  name: appName,
  description: appDescription,
} = require('../../package.json');

const utilityHandlers = {
  getRoot: (req, res) => {
    const activeProvider = LlmService.getActiveProviderName();
    const activeModel = LlmService.getActiveModelName();
    res.json({
      status: 'ok',
      name: appName || 'Model Context Reasoner',
      version: appVersion || 'unknown',
      description: appDescription || 'MCR API',
      activeLlmProvider: activeProvider || 'N/A',
      activeLlmModel: activeModel || 'N/A',
    });
  },

  getPrompts: (req, res) => {
    res.json(LlmService.getPromptTemplates());
  },

  debugFormatPromptAsync: async (req, res, next) => {
    try {
      const { templateName, inputVariables } = req.body;

      validateNonEmptyString(
        templateName,
        'templateName',
        'DEBUG_FORMAT_PROMPT'
      );
      if (
        !inputVariables ||
        typeof inputVariables !== 'object' ||
        Array.isArray(inputVariables)
      ) {
        throw new ApiError(
          400,
          "Missing or invalid required field 'inputVariables'. Must be an object.",
          'DEBUG_FORMAT_PROMPT_INVALID_INPUT_VARIABLES'
        );
      }

      const allTemplates = LlmService.getPromptTemplates();
      const rawTemplate = allTemplates[templateName];

      if (!rawTemplate) {
        throw new ApiError(
          404,
          `Prompt template with name '${templateName}' not found.`,
          'DEBUG_FORMAT_PROMPT_TEMPLATE_NOT_FOUND'
        );
      }

      // const { PromptTemplate } = require('@langchain/core/prompts'); // Removed from here

      let formattedPrompt;
      try {
        const promptInstance = PromptTemplate.fromTemplate(rawTemplate);
        formattedPrompt = await promptInstance.format(inputVariables);
      } catch (error) {
        logger.warn('Error formatting prompt in debug endpoint.', {
          internalErrorCode: 'DEBUG_FORMAT_PROMPT_FORMATTING_ERROR',
          templateName,
          inputVariables,
          originalError: error.message,
          stack: error.stack,
        });
        throw new ApiError(
          400,
          `Error formatting prompt '${templateName}': ${error.message}. Check input variables.`,
          'DEBUG_FORMAT_PROMPT_FORMATTING_FAILED'
        );
      }

      res.json({
        templateName,
        rawTemplate,
        inputVariables,
        formattedPrompt,
      });
    } catch (err) {
      next(err);
    }
  },
};

module.exports = utilityHandlers;
