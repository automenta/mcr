const { ChatOpenAI } = require('@langchain/openai');
const logger = require('../logger').logger;

const GenericOpenaiProvider = {
  name: 'generic_openai',
  initialize: (llmConfig) => {
    const modelName = llmConfig.model.generic_openai;
    const baseURL = llmConfig.genericOpenaiBaseUrl;
    const apiKey = llmConfig.apiKey.generic_openai; // This can be undefined

    if (!baseURL || baseURL.trim() === '') {
      logger.warn(
        'GenericOpenaiProvider: Base URL (MCR_LLM_GENERIC_OPENAI_BASE_URL) is not configured. Service will not be available.',
        { internalErrorCode: 'GENERIC_OPENAI_BASE_URL_MISSING' }
      );
      return null;
    }

    if (!modelName || modelName.trim() === '') {
      logger.warn(
        'GenericOpenaiProvider: Model name (MCR_LLM_MODEL_GENERIC_OPENAI) is not configured. Service will not be available.',
        { internalErrorCode: 'GENERIC_OPENAI_MODEL_MISSING' }
      );
      return null;
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

      return new ChatOpenAI(clientParams);
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
      return null;
    }
  },
};

module.exports = GenericOpenaiProvider;
