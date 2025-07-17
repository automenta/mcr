// new/src/config.js
const path = require('path');
require('dotenv').config({ path: path.resolve(process.cwd(), '.env') }); // Load .env from root

const config = {
	server: {
		port: process.env.PORT || 8081,
		host: process.env.HOST || '0.0.0.0',
	},
	llm: {
		provider: process.env.MCR_LLM_PROVIDER || 'ollama', // Default to ollama
		ollama: {
			model: process.env.MCR_LLM_MODEL_OLLAMA || 'llama3',
			embeddingModel:
				process.env.MCR_LLM_EMBEDDING_MODEL_OLLAMA || 'nomic-embed-text',
			baseURL: process.env.MCR_LLM_OLLAMA_BASE_URL || 'http://localhost:11434',
		},
		gemini: {
			apiKey: process.env.GEMINI_API_KEY,
			model: process.env.MCR_LLM_MODEL_GEMINI || 'gemini-pro',
		},
		openai: {
			// Placeholder for future OpenAI integration
			apiKey: process.env.OPENAI_API_KEY,
			model: process.env.MCR_LLM_MODEL_OPENAI || 'gpt-4o', // Example default
		},
		anthropic: {
			// Placeholder for future Anthropic integration
			apiKey: process.env.ANTHROPIC_API_KEY,
			model: process.env.MCR_LLM_MODEL_ANTHROPIC || 'claude-3-opus-20240229', // Example default
		},
		generic_openai: {
			model: process.env.MCR_LLM_MODEL_GENERIC_OPENAI,
			baseURL: process.env.MCR_LLM_GENERIC_OPENAI_BASE_URL,
			apiKey: process.env.MCR_LLM_GENERIC_OPENAI_API_KEY, // Optional
		},
		// Future providers can be added here by defining their config structure
	},
	reasoner: {
		provider: process.env.MCR_REASONER_PROVIDER || 'prolog', // Default to prolog
		prolog: {
			// Tau-Prolog is embedded, so no specific paths needed for it usually
			// Add any specific prolog config here if necessary
		},
		type: process.env.REASONER_TYPE || 'prolog',
		ltnThreshold: parseFloat(process.env.LTN_THRESHOLD) || 0.7,
	},
	embedding: {
		model: process.env.EMBEDDING_MODEL || 'all-MiniLM-L6-v2',
	},
	kg: {
		enabled: process.env.KG_ENABLED === 'true',
	},
	ontology: {
		directory:
			process.env.MCR_ONTOLOGY_DIR ||
			require('path').resolve(__dirname, '../../ontologies'),
	},
	// Add other configurations as needed, e.g., logging level
	logLevel: process.env.LOG_LEVEL || 'info', // Ensure this is info
	// Default translation strategy
	translationStrategy:
		process.env.MCR_TRANSLATION_STRATEGY || 'conditional-multi-assert',
	// Debug level for API responses and potentially logs
	// Options: 'none', 'basic', 'verbose'. Default: 'none' (most restrictive)
	debugLevel: process.env.MCR_DEBUG_LEVEL || 'none',
	sessionStore: {
		type: process.env.MCR_SESSION_STORE_TYPE || 'memory', // 'memory' or 'file'
		filePath:
			process.env.MCR_SESSION_STORE_FILE_PATH ||
			path.resolve(process.cwd(), './.sessions'), // Default path for file store
	},
};

// Validation for required keys based on provider
function validateConfig() {
	const { provider, gemini, openai, anthropic } = config.llm; // Include new provider configs

	const selectedProvider = provider.toLowerCase(); // Normalize for comparison

	if (selectedProvider === 'gemini') {
		if (!gemini.apiKey) {
			throw new Error(
				'Configuration Error: MCR_LLM_PROVIDER is "gemini" but GEMINI_API_KEY is not set.'
			);
		}
	} else if (selectedProvider === 'openai') {
		// This block will activate if/when 'openai' is chosen as the provider
		if (!openai.apiKey) {
			throw new Error(
				'Configuration Error: MCR_LLM_PROVIDER is "openai" but OPENAI_API_KEY is not set.'
			);
		}
	} else if (selectedProvider === 'anthropic') {
		// This block will activate if/when 'anthropic' is chosen as the provider
		if (!anthropic.apiKey) {
			throw new Error(
				'Configuration Error: MCR_LLM_PROVIDER is "anthropic" but ANTHROPIC_API_KEY is not set.'
			);
		}
		// Ollama is the default and doesn't require an API key.
	} else if (selectedProvider === 'generic_openai') {
		if (!config.llm.generic_openai?.model) {
			throw new Error(
				'Configuration Error: MCR_LLM_PROVIDER is "generic_openai" but MCR_LLM_MODEL_GENERIC_OPENAI is not set.'
			);
		}
		if (!config.llm.generic_openai?.baseURL) {
			// Kept original config.llm path for baseURL check
			throw new Error(
				'Configuration Error: MCR_LLM_PROVIDER is "generic_openai" but MCR_LLM_GENERIC_OPENAI_BASE_URL is not set.'
			);
		}
	}
	// Add more validation for other providers or specific settings as needed.

	if (config.reasoner.type === 'ltn') {
		if (
			typeof config.reasoner.ltnThreshold !== 'number' ||
			config.reasoner.ltnThreshold < 0 ||
			config.reasoner.ltnThreshold > 1
		) {
			throw new Error(
				'Configuration Error: REASONER_TYPE is "ltn" but LTN_THRESHOLD is not a float between 0 and 1.'
			);
		}
	}

	// Validate debugLevel
	const validDebugLevels = ['none', 'basic', 'verbose'];
	if (!validDebugLevels.includes(config.debugLevel.toLowerCase())) {
		console.warn(
			// Warn and default, rather than throw, as it's not critical for startup
			`Warning: Invalid MCR_DEBUG_LEVEL "${config.debugLevel}". Allowed values: ${validDebugLevels.join(', ')}. Defaulting to "none".`
		);
		config.debugLevel = 'none';
	} else {
		config.debugLevel = config.debugLevel.toLowerCase(); // Ensure consistent casing
	}
}

// Call validation immediately after config object is defined.
// If validation fails, this will throw an error and prevent the module from being exported,
// effectively stopping the application from starting with invalid critical configuration.
try {
	validateConfig();
} catch (e) {
	// Log the error and rethrow to ensure the application startup is halted.
	// Using console.error directly here as logger might not be initialized yet,
	// or its configuration might depend on this config file itself.
	console.error(`[ConfigValidation] ${e.message}`);
	throw e; // Rethrow to halt execution
}

module.exports = config;
