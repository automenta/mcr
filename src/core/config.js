const path = require('path');

function loadServerConfig() {
  return {
    port: process.env.PORT || 8081,
    host: process.env.HOST || '0.0.0.0',
  };
}

function loadLlmConfig() {
  return {
    provider: process.env.MCR_LLM_PROVIDER || 'ollama',
    ollama: {
      model: process.env.MCR_LLM_MODEL_OLLAMA || 'llama3',
      embeddingModel: process.env.MCR_LLM_EMBEDDING_MODEL_OLLAMA || 'nomic-embed-text',
      baseURL: process.env.MCR_LLM_OLLAMA_BASE_URL || 'http://localhost:11434',
    },
    gemini: {
      apiKey: process.env.GEMINI_API_KEY,
      model: process.env.MCR_LLM_MODEL_GEMINI || 'gemini-pro',
    },
  };
}

function loadReasonerConfig() {
  return {
    provider: process.env.MCR_REASONER_PROVIDER || 'prolog',
  };
}

function loadEmbeddingConfig() {
  return {
    model: process.env.EMBEDDING_MODEL || 'all-MiniLM-L6-v2',
  };
}

function loadKgConfig() {
  return {
    enabled: process.env.KG_ENABLED === 'true',
  };
}

function loadOntologyConfig() {
  return {
    directory:
      process.env.MCR_ONTOLOGY_DIR ||
      path.resolve(__dirname, '../../ontologies'),
  };
}

function loadSessionStoreConfig() {
  return {
    type: process.env.MCR_SESSION_STORE_TYPE || 'memory',
    filePath:
      process.env.MCR_SESSION_STORE_FILE_PATH ||
      path.resolve(process.cwd(), './.sessions'),
  };
}

function loadEvolutionConfig() {
  return {
    enabled: process.env.MCR_EVOLUTION_ENABLED === 'true',
    iterations: parseInt(process.env.MCR_EVOLUTION_ITERATIONS, 10) || 1,
  };
}

function loadConfig() {
  return {
    server: loadServerConfig(),
    llm: loadLlmConfig(),
    reasoner: loadReasonerConfig(),
    embedding: loadEmbeddingConfig(),
    kg: loadKgConfig(),
    ontology: loadOntologyConfig(),
    logLevel: process.env.LOG_LEVEL || 'info',
    translationStrategy:
      process.env.MCR_TRANSLATION_STRATEGY || 'conditional-multi-assert',
    debugLevel: process.env.MCR_DEBUG_LEVEL || 'none',
    sessionStore: loadSessionStoreConfig(),
    evolution: loadEvolutionConfig(),
  };
}

module.exports = {
  loadConfig,
};
