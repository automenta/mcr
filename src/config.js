// new/src/config.js
const path = require('path');
require('dotenv').config({ path: path.resolve(process.cwd(), '.env') }); // Load .env from root

const config = {
  server: {
    port: process.env.PORT || 8080,
    host: process.env.HOST || '0.0.0.0',
  },
  llm: {
    provider: process.env.MCR_LLM_PROVIDER || 'ollama', // Default to ollama
    ollama: {
      model: process.env.MCR_LLM_MODEL_OLLAMA || 'llama3',
      baseURL: process.env.MCR_LLM_OLLAMA_BASE_URL || 'http://localhost:11434',
    },
    gemini: {
      apiKey: process.env.GEMINI_API_KEY,
      model: process.env.MCR_LLM_MODEL_GEMINI || 'gemini-pro',
    },
    // Future providers can be added here
  },
  reasoner: {
    provider: process.env.MCR_REASONER_PROVIDER || 'prolog', // Default to prolog
    prolog: {
      // Tau-Prolog is embedded, so no specific paths needed for it usually
      // Add any specific prolog config here if necessary
    },
  },
  ontology: {
    directory:
      process.env.MCR_ONTOLOGY_DIR ||
      require('path').resolve(__dirname, '../../ontologies'),
  },
  // Add other configurations as needed, e.g., logging level
  logLevel: process.env.LOG_LEVEL || 'info',
};

// Basic validation for required keys based on provider
function validateConfig() {
  const { provider, gemini } = config.llm;
  if (provider === 'gemini' && !gemini.apiKey) {
    console.warn(
      'Warning: MCR_LLM_PROVIDER is "gemini" but GEMINI_API_KEY is not set.'
    );
  }
  // Add more validation as needed
}

validateConfig();

module.exports = config;
