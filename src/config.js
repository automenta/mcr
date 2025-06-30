const dotenv = require('dotenv');
const { logger } = require('./logger');

const SUPPORTED_PROVIDERS = ['openai', 'gemini', 'ollama'];

const ConfigManager = {
  _config: null,

  load(options) {
    const effectiveOptions = {
      exitOnFailure: process.env.NODE_ENV === 'test' ? false : true,
      forceReload: false,
      ...options,
    };

    if (this._config && !effectiveOptions.forceReload) {
      return this._config;
    }

    dotenv.config();
    const loadedConfig = {
      server: {
        host: process.env.HOST || '0.0.0.0',
        port: parseInt(process.env.PORT || '8080', 10),
      },
      llm: {
        provider: (process.env.MCR_LLM_PROVIDER || 'openai').toLowerCase(),
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
        level: (process.env.LOG_LEVEL || 'info').toLowerCase(),
      },
      session: {
        storagePath: process.env.MCR_SESSION_STORAGE_PATH || './sessions_data',
      },
      ontology: {
        storagePath:
          process.env.MCR_ONTOLOGY_STORAGE_PATH || './ontologies_data',
      },
      debugMode: process.env.MCR_DEBUG_MODE === 'true',
    };

    try {
      this.validate(loadedConfig);
      this._config = loadedConfig;
      logger.info('Configuration loaded and validated successfully.');
      return this._config;
    } catch (error) {
      logger.error(`Configuration validation failed: ${error.message}`);
      if (effectiveOptions.exitOnFailure) {
        logger.fatal(
          'Application cannot start due to configuration errors. Exiting.'
        );
        process.exit(1);
      } else {
        throw error;
      }
    }
    return undefined;
  },

  validate(configToValidate) {
    const { provider, apiKey, ollamaBaseUrl } = configToValidate.llm;

    if (!SUPPORTED_PROVIDERS.includes(provider)) {
      throw new Error(
        `Invalid MCR_LLM_PROVIDER: '${provider}'. Supported providers are: ${SUPPORTED_PROVIDERS.join(', ')}.`
      );
    }

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
      if (
        provider === check.name &&
        (!apiKey[check.keyName] || apiKey[check.keyName].trim() === '')
      ) {
        throw new Error(
          `Configuration Error: MCR_LLM_PROVIDER is set to '${check.name}', but its API key ${check.envVar} is missing or empty. ` +
            `Please set ${check.envVar} in your .env file or environment variables.`
        );
      }
    }

    if (provider === 'ollama') {
      if (!ollamaBaseUrl || ollamaBaseUrl.trim() === '') {
        throw new Error(
          `Configuration Error: MCR_LLM_PROVIDER is 'ollama', but MCR_LLM_OLLAMA_BASE_URL is missing or empty. ` +
            `Please set MCR_LLM_OLLAMA_BASE_URL (e.g., 'http://localhost:11434').`
        );
      }
      try {
        new URL(ollamaBaseUrl);
      } catch {
        throw new Error(
          `Configuration Error: MCR_LLM_OLLAMA_BASE_URL ('${ollamaBaseUrl}') is not a valid URL.`
        );
      }
    }

    if (
      isNaN(configToValidate.server.port) ||
      configToValidate.server.port <= 0 ||
      configToValidate.server.port > 65535
    ) {
      throw new Error(
        `Invalid PORT: '${process.env.PORT}'. Must be a number between 1 and 65535.`
      );
    }
    const validLogLevels = [
      'error',
      'warn',
      'info',
      'http',
      'verbose',
      'debug',
      'silly',
    ];
    if (!validLogLevels.includes(configToValidate.logging.level)) {
      logger.warn(
        `Invalid LOG_LEVEL: '${configToValidate.logging.level}'. Defaulting to 'info'. ` +
          `Supported levels are: ${validLogLevels.join(', ')}.`
      );
      configToValidate.logging.level = 'info';
    }

    return true;
  },

  get(options) {
    if (!this._config || (options && options.forceReload)) {
      return this.load(options);
    }
    return this._config;
  },
};

module.exports = ConfigManager;
