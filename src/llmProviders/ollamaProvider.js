const { ChatOllama } = require("@langchain/community/chat_models/ollama");
const logger = require('../logger').logger;

const OllamaProvider = {
    name: 'ollama',
    initialize: (llmConfig) => {
        const { model, ollamaBaseUrl } = llmConfig;
        try {
            return new ChatOllama({
                baseUrl: ollamaBaseUrl,
                model: model.ollama,
                temperature: 0
            });
        } catch (error) {
            logger.error(`Failed to initialize Ollama provider client: ${error.message}`, {
                internalErrorCode: 'OLLAMA_CLIENT_INIT_FAILED',
                ollamaBaseUrl,
                model: model.ollama,
                originalError: error.message,
                stack: error.stack
            });
            return null;
        }
    }
};

module.exports = OllamaProvider;
