const { ChatOpenAI } = require("@langchain/openai");
const logger = require('../logger').logger; // Use the logger object

const OpenAiProvider = {
    name: 'openai',
    initialize: (llmConfig) => {
        const { apiKey, model } = llmConfig;
        if (!apiKey.openai) {
            logger.warn("OpenAI API key not provided. OpenAI LLM service will not be available for this provider.", { internalErrorCode: 'OPENAI_API_KEY_MISSING' });
            return null; // Or throw an error if initialization must succeed
        }
        try {
            return new ChatOpenAI({
                apiKey: apiKey.openai,
                modelName: model.openai,
                temperature: 0
            });
        } catch (error) {
            logger.error(`Failed to initialize OpenAI provider client: ${error.message}`, {
                internalErrorCode: 'OPENAI_CLIENT_INIT_FAILED',
                originalError: error.message,
                stack: error.stack
            });
            return null; // Or throw
        }
    }
};

module.exports = OpenAiProvider;
