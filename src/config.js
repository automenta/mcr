const dotenv = require('dotenv');
const logger = require('./logger').logger;

const ConfigManager = {
  load() {
    dotenv.config();
    const config = {
      server: {
        host: process.env.HOST || '0.0.0.0',
        port: parseInt(process.env.PORT || '8080', 10),
      },
      llm: {
        provider: process.env.MCR_LLM_PROVIDER || 'openai',
        model: {
          openai: process.env.MCR_LLM_MODEL_OPENAI || 'gpt-4o',
          gemini: process.env.MCR_LLM_MODEL_GEMINI || 'gemini-pro',
          ollama: process.env.MCR_LLM_MODEL_OLLAMA || 'llama3',
        },
        apiKey: {
          openai: process.env.OPENAI_API_KEY,
          gemini: process.env.GEMINI_API_KEY,
        },
        ollamaBaseUrl:
          process.env.MCR_LLM_OLLAMA_BASE_URL || 'http://localhost:11434',
      },
      logging: {
        level: process.env.LOG_LEVEL || 'info',
        file: 'mcr.log',
      },
      session: {
        storagePath: process.env.MCR_SESSION_STORAGE_PATH || './sessions',
      },
      ontology: {
        storagePath: process.env.MCR_ONTOLOGY_STORAGE_PATH || './ontologies',
      },
      debugMode: process.env.MCR_DEBUG_MODE === 'true',
    };
    this.validate(config);
    return config;
  },
  validate(config) {
    const { provider, apiKey } = config.llm;
    const providerChecks = [
      {
        name: 'openai',
        keyName: 'openai',
        envVar: 'OPENAI_API_KEY',
        serviceName: 'OpenAI',
      },
      {
        name: 'gemini',
        keyName: 'gemini',
        envVar: 'GEMINI_API_KEY',
        serviceName: 'Gemini',
      },
    ];

    for (const check of providerChecks) {
      if (provider === check.name && !apiKey[check.keyName]) {
        logger.warn(
          `MCR_LLM_PROVIDER is '${check.name}' but ${check.envVar} is not set. ${check.serviceName} functionality will not work.`
        );
      }
    }
  },
};

module.exports = ConfigManager;
