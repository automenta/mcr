const { ChatOpenAI } = require('@langchain/openai');
const logger = require('../logger').logger;

const OpenAiProvider = {
  name: 'openai',
  initialize: (llmConfig) => {
    const { apiKey, model } = llmConfig;
    if (!apiKey.openai) {
      // logger.warn removed, will throw error instead
      // { internalErrorCode: 'OPENAI_API_KEY_MISSING' }
      throw new Error(
        'OpenAI API key (OPENAI_API_KEY) not provided. OpenAI LLM service cannot be initialized.'
      );
    }
    try {
      const client = new ChatOpenAI({
        apiKey: apiKey.openai,
        modelName: model.openai,
        temperature: 0,
      });
      logger.info(`OpenAI provider client initialized successfully for model ${model.openai}.`);
      return client;
    } catch (error) {
      logger.error(
        `Failed to initialize OpenAI provider client: ${error.message}`,
        {
          internalErrorCode: 'OPENAI_CLIENT_INIT_FAILED',
          originalError: error.message,
          stack: error.stack,
        }
      );
      // Re-throw the error or a new specific error to be caught by LlmService.init
      throw new Error(`Failed to initialize OpenAI provider: ${error.message}`);
    }
  },
};

module.exports = OpenAiProvider;
