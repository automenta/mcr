const { ChatOllama } = require('@langchain/community/chat_models/ollama');
const logger = require('../logger').logger;
const axios = require('axios');

/**
 * Checks the connection to the Ollama server and optionally if the model exists.
 * @param {string} ollamaBaseUrl - The base URL of the Ollama server.
 * @param {string} modelName - The name of the model to check.
 * @throws {Error} If the Ollama server is unreachable.
 */
async function checkOllamaConnectionAsync(ollamaBaseUrl, modelName) {
  try {
    // First, check basic connectivity, e.g., by hitting the version endpoint
    await axios.get(`${ollamaBaseUrl}/api/version`, { timeout: 2000 });
    logger.debug(
      `Successfully connected to Ollama server at ${ollamaBaseUrl}.`
    );

    // Then, check if the specific model is available
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
      // Model check failure is a warning, not an error that stops initialization.
    }
  } catch (connectionError) {
    // This catch is for errors during the initial connection attempt (axios.get to /api/version)
    const errorMessage = `Failed to connect to Ollama server at ${ollamaBaseUrl}. Ensure Ollama is running and accessible. Error: ${connectionError.message}`;
    logger.error(errorMessage, {
      internalErrorCode: 'OLLAMA_SERVER_CONNECTION_FAILED',
      ollamaBaseUrl,
      originalError: connectionError.message,
    });
    throw new Error(errorMessage); // Crucial: stop LlmService initialization
  }
}

const OllamaProvider = {
  name: 'ollama',
  initialize: async (llmConfig) => {
    const { model, ollamaBaseUrl } = llmConfig;

    // Perform the connection check. This will now throw if server is unreachable.
    await checkOllamaConnectionAsync(ollamaBaseUrl, model.ollama);

    try {
      const client = new ChatOllama({
        baseUrl: ollamaBaseUrl,
        model: model.ollama,
        temperature: 0,
      });
      logger.info(
        `Ollama provider client configured for model '${model.ollama}' at ${ollamaBaseUrl}.`
      );
      return client;
    } catch (error) {
      logger.error(
        `Failed to initialize Ollama provider client: ${error.message}`,
        {
          internalErrorCode: 'OLLAMA_CLIENT_INIT_FAILED',
          ollamaBaseUrl,
          model: model.ollama,
          originalError: error.message,
          stack: error.stack,
        }
      );
      // Re-throw the error or a new specific error to be caught by LlmService.init
      throw new Error(`Failed to initialize Ollama provider: ${error.message}`);
    }
  },
};

module.exports = OllamaProvider;
