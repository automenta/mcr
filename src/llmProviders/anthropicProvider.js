const { ChatAnthropic } = require('@langchain/anthropic');
const logger = require('../logger').logger;

const AnthropicProvider = {
  name: 'anthropic',
  initialize: (llmConfig) => {
    const apiKey = llmConfig.apiKey.anthropic;
    const modelName = llmConfig.model.anthropic;

    if (!apiKey || apiKey.trim() === '') {
      // logger.warn removed, will throw error instead
      // { internalErrorCode: 'ANTHROPIC_API_KEY_MISSING' }
      throw new Error(
        'Anthropic API key (ANTHROPIC_API_KEY) not provided. Anthropic LLM service cannot be initialized.'
      );
    }

    if (!modelName || modelName.trim() === '') {
      // logger.warn removed, will throw error instead
      // { internalErrorCode: 'ANTHROPIC_MODEL_MISSING' }
      throw new Error(
        'Anthropic model name (MCR_LLM_MODEL_ANTHROPIC) not configured. Anthropic LLM service cannot be initialized.'
      );
    }

    try {
      const client = new ChatAnthropic({
        anthropicApiKey: apiKey,
        modelName,
        temperature: 0, // For consistency
      });
      logger.info(`Anthropic provider client initialized successfully for model ${modelName}.`);
      return client;
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
      // Re-throw the error or a new specific error to be caught by LlmService.init
      throw new Error(`Failed to initialize Anthropic provider: ${error.message}`);
    }
  },
};

module.exports = AnthropicProvider;
