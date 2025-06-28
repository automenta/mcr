
const dotenv = require('dotenv');

const ConfigManager = {
    load() {
        dotenv.config(); // Ensure .env is loaded
        const config = {
            server: {
                host: process.env.HOST || '0.0.0.0',
                port: parseInt(process.env.PORT || '8080', 10),
            },
            llm: {
                provider: process.env.MCR_LLM_PROVIDER || 'openai', // 'openai', 'gemini', 'ollama'
                model: {
                    openai: process.env.MCR_LLM_MODEL_OPENAI || 'gpt-4o',
                    gemini: process.env.MCR_LLM_MODEL_GEMINI || 'gemini-pro',
                    ollama: process.env.MCR_LLM_MODEL_OLLAMA || 'llama3',
                },
                apiKey: {
                    openai: process.env.OPENAI_API_KEY,
                    gemini: process.env.GEMINI_API_KEY,
                },
                ollamaBaseUrl: process.env.MCR_LLM_OLLAMA_BASE_URL || 'http://localhost:11434',
            },
            logging: {
                level: process.env.LOG_LEVEL || 'info',
                file: 'mcr.log',
            },
            session: {
                storagePath: process.env.MCR_SESSION_STORAGE_PATH || './sessions',
            }
        };
        this.validate(config);
        return config;
    },
    validate(config) {
        const { provider, apiKey } = config.llm;
        if (provider === 'openai' && !apiKey.openai) {
            console.warn("MCR_LLM_PROVIDER is 'openai' but OPENAI_API_KEY is not set. OpenAI functionality will not work.");
        }
        if (provider === 'gemini' && !apiKey.gemini) {
            console.warn("MCR_LLM_PROVIDER is 'gemini' but GEMINI_API_KEY is not set. Gemini functionality will not work.");
        }
    }
};

module.exports = ConfigManager;
