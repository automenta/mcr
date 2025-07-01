const { ChatOpenAI } = require('@langchain/openai');
const logger = require('../logger').logger;

const GenericOpenaiProvider = {
  name: 'generic_openai',
  initialize: (llmConfig) => {
    const modelName = llmConfig.model.generic_openai;
    const baseURL = llmConfig.genericOpenaiBaseUrl;
    const apiKey = llmConfig.apiKey.generic_openai; // This can be undefined

    if (!baseURL || baseURL.trim() === '') {
      // logger.warn removed, will throw error instead
      // { internalErrorCode: 'GENERIC_OPENAI_BASE_URL_MISSING' }
      throw new Error(
        'GenericOpenaiProvider: Base URL (MCR_LLM_GENERIC_OPENAI_BASE_URL) is not configured. Service cannot be initialized.'
      );
    }

    if (!modelName || modelName.trim() === '') {
      // logger.warn removed, will throw error instead
      // { internalErrorCode: 'GENERIC_OPENAI_MODEL_MISSING' }
      throw new Error(
        'GenericOpenaiProvider: Model name (MCR_LLM_MODEL_GENERIC_OPENAI) is not configured. Service cannot be initialized.'
      );
    }

    try {
      const clientParams = {
        modelName,
        temperature: 0,
        configuration: {
          baseURL,
        },
      };
      if (apiKey && apiKey.trim() !== '') {
        clientParams.openAIApiKey = apiKey;
      } else {
        logger.info(
          'GenericOpenaiProvider: API key (MCR_LLM_GENERIC_OPENAI_API_KEY) is not provided. Attempting to connect without an API key.'
        );
      }

      const client = new ChatOpenAI(clientParams);
      logger.info(`GenericOpenaiProvider client initialized successfully for model ${modelName} at ${baseURL}.`);
      return client;
    } catch (error) {
      logger.error(
        `Failed to initialize GenericOpenaiProvider client: ${error.message}`,
        {
          internalErrorCode: 'GENERIC_OPENAI_CLIENT_INIT_FAILED',
          originalError: error.message,
          stack: error.stack,
          config: { modelName, baseURL, apiKeyProvided: !!apiKey },
        }
      );
      // Re-throw the error or a new specific error to be caught by LlmService.init
      throw new Error(`Failed to initialize GenericOpenaiProvider: ${error.message}`);
    }
  },
};

module.exports = GenericOpenaiProvider;
