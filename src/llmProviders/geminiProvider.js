const { ChatGoogleGenerativeAI } = require('@langchain/google-genai');
const logger = require('../logger').logger;

const GeminiProvider = {
  name: 'gemini',
  initialize: (llmConfig) => {
    const { apiKey, model } = llmConfig;
    if (!apiKey.gemini) {
      // logger.warn removed, will throw error instead
      // { internalErrorCode: 'GEMINI_API_KEY_MISSING' }
      throw new Error(
        'Gemini API key (GEMINI_API_KEY) not provided. Gemini LLM service cannot be initialized.'
      );
    }
    try {
      const client = new ChatGoogleGenerativeAI({
        apiKey: apiKey.gemini,
        modelName: model.gemini,
        temperature: 0,
      });
      logger.info(`Gemini provider client initialized successfully for model ${model.gemini}.`);
      return client;
    } catch (error) {
      logger.error(
        `Failed to initialize Gemini provider client: ${error.message}`,
        {
          internalErrorCode: 'GEMINI_CLIENT_INIT_FAILED',
          originalError: error.message,
          stack: error.stack,
        }
      );
      // Re-throw the error or a new specific error to be caught by LlmService.init
      throw new Error(`Failed to initialize Gemini provider: ${error.message}`);
    }
  },
};

module.exports = GeminiProvider;
