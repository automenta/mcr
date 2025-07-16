// new/tests/llmService.test.js
// const config = require('../src/config'); // Unused at top level
// const logger = require('../src/logger'); // Unused at top level

// new/tests/llmService.test.js

// Mock config first at the top level
const mockConfig = {
	llm: {
		provider: 'ollama', // Default for tests, can be overridden per test
		anthropic: { apiKey: 'test-key', defaultModel: 'test-model' },
		openai: { apiKey: 'test-key', defaultModel: 'test-model' },
		gemini: { apiKey: 'test-key', defaultModel: 'test-model' },
		ollama: { host: 'test-host', defaultModel: 'test-model' },
	},
	logLevel: 'info', // Default, will be set to silent in beforeAll
	reasoner: { provider: 'test-reasoner' },
	server: { port: 3000, host: 'localhost' },
	session: { storagePath: './test-sessions', defaultTimeoutMinutes: 60 },
	ontology: { storagePath: './test-ontologies', autoLoad: true },
};
// jest.mock('../src/config', () => mockConfig); // This line caused the error

jest.mock('../src/config', () => ({
	// Define the mock directly in the factory
	llm: {
		provider: 'ollama', // Default for tests, can be overridden per test
		anthropic: { apiKey: 'test-key', defaultModel: 'test-model' },
		openai: { apiKey: 'test-key', defaultModel: 'test-model' },
		gemini: { apiKey: 'test-key', defaultModel: 'test-model' },
		ollama: { host: 'test-host', defaultModel: 'test-model' },
	},
	logLevel: 'info', // Default, will be set to silent in beforeAll
	reasoner: { provider: 'test-reasoner' },
	server: { port: 3000, host: 'localhost' },
	session: { storagePath: './test-sessions', defaultTimeoutMinutes: 60 },
	ontology: { storagePath: './test-ontologies', autoLoad: true },
}));

// Mock logger (can be done more simply if not changing levels)
jest.mock('../src/util/logger', () => ({
	info: jest.fn(),
	warn: jest.fn(),
	error: jest.fn(),
	debug: jest.fn(),
	level: 'info', // Default, will be set to silent
}));

// Mock the providers before llmService is imported
const mockOllamaGenerate = jest.fn();
const mockGeminiGenerate = jest.fn();

jest.mock('../src/llm/ollamaProvider', () => ({
	name: 'ollama',
	generate: mockOllamaGenerate,
}));
jest.mock('../src/llm/geminiProvider', () => ({
	name: 'gemini',
	generate: mockGeminiGenerate,
}));

// Import llmService after mocks are set up
// const llmService = require('../src/llmService'); // Will be required inside tests after config changes

describe('LlmService', () => {
	let llmService; // To hold the re-required llmService instance
	let config; // To hold the re-required (mocked) config instance
	// let logger; // This was unused after removing its assignment in beforeEach

	beforeAll(() => {
		// Set logger level to silent for all tests in this suite
		require('../src/util/logger').level = 'silent';
	});

	afterAll(() => {
		// Restore original log level (if it matters for other suites)
		// This depends on how logger is shared/cached across test files by Jest
		require('../src/util/logger').level = mockConfig.logLevel || 'info';
	});

	beforeEach(() => {
		jest.resetModules(); // Crucial: clears the cache for all modules

		// Re-require the mocked config and logger
		config = require('../src/config');
		// logger = require('../src/logger'); // logger variable in this scope is unused

		// Reset call counts for provider mocks
		mockOllamaGenerate.mockReset();
		mockGeminiGenerate.mockReset();

		// Ensure provider mocks are active for the upcoming llmService import
		// These mocks are at the top level, so they are active unless overridden by jest.doMock
		// Forcing them to be re-applied to the fresh jest module cache might be needed if issues persist.
		// jest.mock('../src/llmProviders/ollamaProvider', () => ({ name: 'ollama', generateStructured: mockOllamaGenerate }));
		// jest.mock('../src/llmProviders/geminiProvider', () => ({ name: 'gemini', generateStructured: mockGeminiGenerate }));

		// llmService will be required in each test after setting the desired config.llm.provider
	});

	test('should load and use Ollama provider when configured', async () => {
		config.llm.provider = 'ollama'; // Set desired provider on the fresh mocked config
		llmService = require('../src/llmService'); // Import llmService, it will use the above config

		mockOllamaGenerate.mockResolvedValue('Ollama says hello');

		const systemPrompt = 'System: Be helpful.';
		const userPrompt = 'User: Hi';
		const result = await llmService.generate(systemPrompt, userPrompt);

		expect(result).toEqual({ text: 'Ollama says hello', costData: null });
		expect(mockOllamaGenerate).toHaveBeenCalledTimes(1);
		expect(mockOllamaGenerate).toHaveBeenCalledWith(
			systemPrompt,
			userPrompt,
			{}
		);
		expect(mockGeminiGenerate).not.toHaveBeenCalled();
	});

	test('should load and use Gemini provider when configured', async () => {
		config.llm.provider = 'gemini'; // Use the re-required config
		llmService = require('../src/llmService'); // Re-import

		mockGeminiGenerate.mockResolvedValue('Gemini says hi');

		const systemPrompt = 'System: Be concise.';
		const userPrompt = 'User: Hello';
		const result = await llmService.generate(systemPrompt, userPrompt, {
			jsonMode: true,
		});

		expect(result).toEqual({ text: 'Gemini says hi', costData: null });
		expect(mockGeminiGenerate).toHaveBeenCalledTimes(1);
		expect(mockGeminiGenerate).toHaveBeenCalledWith(systemPrompt, userPrompt, {
			jsonMode: true,
		});
		expect(mockOllamaGenerate).not.toHaveBeenCalled();
	});

	test('should default to Ollama provider if an unsupported provider is configured', async () => {
		config.llm.provider = 'unsupported_provider'; // Use the re-required config
		llmService = require('../src/llmService'); // Re-import

		mockOllamaGenerate.mockResolvedValue('Ollama default response');

		const systemPrompt = 'System: Default test.';
		const userPrompt = 'User: Test';
		await expect(llmService.generate(systemPrompt, userPrompt)).rejects.toThrow(
			/Configuration Error: Unsupported LLM provider configured: "unsupported_provider". Supported providers are "ollama", "gemini"./
		);
		expect(mockOllamaGenerate).not.toHaveBeenCalled(); // Ensure it didn't try to call Ollama
	});

	test('should pass options to the provider', async () => {
		config.llm.provider = 'ollama'; // Use the re-required config
		llmService = require('../src/llmService'); // Re-import

		mockOllamaGenerate.mockResolvedValue('Ollama with options');
		const options = { jsonMode: true, temperature: 0.5 };
		await llmService.generate('s', 'u', options);

		expect(mockOllamaGenerate).toHaveBeenCalledWith('s', 'u', options);
	});

	test('should re-throw errors from the provider', async () => {
		config.llm.provider = 'ollama'; // Use the re-required config
		llmService = require('../src/llmService'); // Re-import

		const errorMessage = 'Provider failed';
		mockOllamaGenerate.mockRejectedValue(new Error(errorMessage));

		await expect(llmService.generate('s', 'u')).rejects.toThrow(errorMessage);
	});

	test('should throw error if provider does not support generateStructured (conceptual test)', async () => {
		// This test checks if llmService correctly identifies a misconfigured provider
		// (i.e., one that is loaded but doesn't have the 'generate' method).

		// Configure to use 'ollama', but then mock the ollamaProvider to be broken.
		config.llm.provider = 'ollama';

		jest.doMock('../src/llm/ollamaProvider', () => ({
			name: 'ollama', // Keep the name consistent for lookup
			// generate method is intentionally missing
		}));

		llmService = require('../src/llmService'); // llmService will now load the "broken" ollamaProvider

		await expect(llmService.generate('s', 'u')).rejects.toThrow(
			'LLM provider misconfiguration.'
		);
	});
});
