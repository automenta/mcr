const { ChatGoogleGenerativeAI } = require("@langchain/google-genai");
const logger = require('../logger').logger;

const GeminiProvider = {
    name: 'gemini',
    initialize: (llmConfig) => {
        const { apiKey, model } = llmConfig;
        if (!apiKey.gemini) {
            logger.warn("Gemini API key not provided. Gemini LLM service will not be available for this provider.", { internalErrorCode: 'GEMINI_API_KEY_MISSING' });
            return null;
        }
        try {
            return new ChatGoogleGenerativeAI({
                apiKey: apiKey.gemini,
                modelName: model.gemini,
                temperature: 0
            });
        } catch (error) {
            logger.error(`Failed to initialize Gemini provider client: ${error.message}`, {
                internalErrorCode: 'GEMINI_CLIENT_INIT_FAILED',
                originalError: error.message,
                stack: error.stack
            });
            return null;
        }
    }
};

module.exports = GeminiProvider;
