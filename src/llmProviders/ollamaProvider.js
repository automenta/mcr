const { ChatOllama } = require('@langchain/community/chat_models/ollama');
const logger = require('../logger').logger;
const axios = require('axios');

/**
 * Checks the connection to the Ollama server and optionally if the model exists.
 * @param {string} ollamaBaseUrl - The base URL of the Ollama server.
 * @param {string} modelName - The name of the model to check.
 */
async function checkOllamaConnectionAsync(ollamaBaseUrl, modelName) {
  try {
    // First, check basic connectivity, e.g., by hitting the version endpoint
    await axios.get(`${ollamaBaseUrl}/api/version`, { timeout: 2000 });
    logger.debug(
      `Successfully connected to Ollama server at ${ollamaBaseUrl}.`
    );

    // Then, check if the specific model is available
    // This might involve listing tags or trying to get model info
    // For simplicity, we can try /api/show, which errors if model not found
    try {
      await axios.post(
        `${ollamaBaseUrl}/api/show`,
        { name: modelName },
        { timeout: 3000 }
      );
      logger.info(
        `Ollama model '${modelName}' is available on server ${ollamaBaseUrl}.`
      );
    } catch (modelError) {
      if (modelError.response && modelError.response.status === 404) {
        logger.warn(
          `Ollama model '${modelName}' not found on server ${ollamaBaseUrl}. ` +
            `Please ensure the model is pulled (e.g., 'ollama pull ${modelName}'). ` +
            `Error: ${modelError.message}`
        );
      } else {
        logger.warn(
          `Could not confirm availability of Ollama model '${modelName}' on server ${ollamaBaseUrl}. ` +
            `This might lead to errors if the model is not present. Error: ${modelError.message}`
        );
      }
      // Do not throw; allow initialization to proceed but with a warning.
    }
  } catch (error) {
    logger.warn(
      `Failed to connect to Ollama server at ${ollamaBaseUrl} or it is not responding as expected. ` +
        `Please ensure Ollama is running and accessible. Error: ${error.message}`
    );
    // Do not throw; allow initialization to proceed but with a warning.
  }
}

const OllamaProvider = {
  name: 'ollama',
  initialize: async (llmConfig) => { // Renamed from initializeAsync
    // Made initialize async
    const { model, ollamaBaseUrl } = llmConfig;

    // Perform the connection check before attempting to create the ChatOllama instance.
    // This provides an earlier, more specific warning if Ollama isn't reachable.
    await checkOllamaConnectionAsync(ollamaBaseUrl, model.ollama);

    try {
      const client = new ChatOllama({
        baseUrl: ollamaBaseUrl,
        model: model.ollama,
        temperature: 0,
      });
      // The ChatOllama constructor itself is synchronous and doesn't throw for bad URL/model initially.
      // Errors typically occur upon first invocation.
      logger.info(
        `Ollama provider client configured for model '${model.ollama}' at ${ollamaBaseUrl}.`
      );
      return client;
    } catch (error) {
      // This catch might be for unexpected constructor errors
      logger.error(
        `Failed to configure Ollama provider client: ${error.message}`,
        {
          internalErrorCode: 'OLLAMA_CLIENT_CONFIG_FAILED',
          ollamaBaseUrl,
          model: model.ollama,
          originalError: error.message,
          stack: error.stack,
        }
      );
      return null;
    }
  },
};

module.exports = OllamaProvider;
