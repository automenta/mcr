const { ChatAnthropic } = require('@langchain/anthropic');
const logger = require('../logger').logger;

const AnthropicProvider = {
  name: 'anthropic',
  initialize: (llmConfig) => {
    const apiKey = llmConfig.apiKey.anthropic;
    const modelName = llmConfig.model.anthropic;

    if (!apiKey || apiKey.trim() === '') {
      logger.warn(
        'Anthropic API key (ANTHROPIC_API_KEY) not provided. Anthropic LLM service will not be available.',
        { internalErrorCode: 'ANTHROPIC_API_KEY_MISSING' }
      );
      return null;
    }

    if (!modelName || modelName.trim() === '') {
      logger.warn(
        'Anthropic model name (MCR_LLM_MODEL_ANTHROPIC) not configured. Service will not be available.',
        { internalErrorCode: 'ANTHROPIC_MODEL_MISSING' }
      );
      return null;
    }

    try {
      return new ChatAnthropic({
        anthropicApiKey: apiKey,
        modelName,
        temperature: 0, // For consistency
      });
    } catch (error) {
      logger.error(
        `Failed to initialize Anthropic provider client: ${error.message}`,
        {
          internalErrorCode: 'ANTHROPIC_CLIENT_INIT_FAILED',
          originalError: error.message,
          stack: error.stack,
          config: { modelName, apiKeyProvided: !!apiKey },
        }
      );
      return null;
    }
  },
};

module.exports = AnthropicProvider;
