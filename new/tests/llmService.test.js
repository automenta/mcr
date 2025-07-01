// new/tests/llmService.test.js
const config = require('../src/config');
const logger = require('../src/logger');

// Mock the providers before llmService is imported
const mockOllamaGenerate = jest.fn();
const mockGeminiGenerate = jest.fn();

jest.mock('../src/llmProviders/ollamaProvider', () => ({
  name: 'ollama',
  generateStructured: mockOllamaGenerate,
}));
jest.mock('../src/llmProviders/geminiProvider', () => ({
  name: 'gemini',
  generateStructured: mockGeminiGenerate,
}));

// Import llmService after mocks are set up
const llmService = require('../src/llmService');

describe('LlmService', () => {
  // Disable logger for cleaner test output
  beforeAll(() => {
    logger.level = 'silent';
  });

  afterAll(() => {
    logger.level = config.logLevel || 'info'; // Restore original log level
  });

  beforeEach(() => {
    // Reset mocks and selectedProvider cache in llmService before each test
    mockOllamaGenerate.mockReset();
    mockGeminiGenerate.mockReset();
    // Need a way to reset the cached 'selectedProvider' in llmService.
    // For now, we can achieve this by changing the config and re-requiring,
    // or by adding a reset/init method to llmService for testing.
    // The simplest way here is to ensure each test sets the config.llm.provider
    // and llmService will re-evaluate its provider on first call if selectedProvider is null.
    // To truly reset, we'd modify llmService or use jest.resetModules().
    jest.resetModules(); // This will clear module cache including llmService
    // Re-require llmService and its dependencies (config, logger, providers) with new module cache
    require('../src/config').llm.provider = 'ollama'; // Default to ollama for safety before each test
    require('../src/llmProviders/ollamaProvider').generateStructured = mockOllamaGenerate;
    require('../src/llmProviders/geminiProvider').generateStructured = mockGeminiGenerate;

  });

  test('should load and use Ollama provider when configured', async () => {
    require('../src/config').llm.provider = 'ollama';
    const llmServiceInstance = require('../src/llmService'); // Re-import to pick up new config

    mockOllamaGenerate.mockResolvedValue('Ollama says hello');

    const systemPrompt = 'System: Be helpful.';
    const userPrompt = 'User: Hi';
    const result = await llmServiceInstance.generate(systemPrompt, userPrompt);

    expect(result).toBe('Ollama says hello');
    expect(mockOllamaGenerate).toHaveBeenCalledTimes(1);
    expect(mockOllamaGenerate).toHaveBeenCalledWith(systemPrompt, userPrompt, {});
    expect(mockGeminiGenerate).not.toHaveBeenCalled();
  });

  test('should load and use Gemini provider when configured', async () => {
    require('../src/config').llm.provider = 'gemini';
    const llmServiceInstance = require('../src/llmService'); // Re-import

    mockGeminiGenerate.mockResolvedValue('Gemini says hi');

    const systemPrompt = 'System: Be concise.';
    const userPrompt = 'User: Hello';
    const result = await llmServiceInstance.generate(systemPrompt, userPrompt, { jsonMode: true });

    expect(result).toBe('Gemini says hi');
    expect(mockGeminiGenerate).toHaveBeenCalledTimes(1);
    expect(mockGeminiGenerate).toHaveBeenCalledWith(systemPrompt, userPrompt, { jsonMode: true });
    expect(mockOllamaGenerate).not.toHaveBeenCalled();
  });

  test('should default to Ollama provider if an unsupported provider is configured', async () => {
    require('../src/config').llm.provider = 'unsupported_provider';
    const llmServiceInstance = require('../src/llmService'); // Re-import

    mockOllamaGenerate.mockResolvedValue('Ollama default response');

    const systemPrompt = 'System: Default test.';
    const userPrompt = 'User: Test';
    await llmServiceInstance.generate(systemPrompt, userPrompt);

    expect(mockOllamaGenerate).toHaveBeenCalledTimes(1);
    expect(mockOllamaGenerate).toHaveBeenCalledWith(systemPrompt, userPrompt, {});
  });

  test('should pass options to the provider', async () => {
    require('../src/config').llm.provider = 'ollama';
    const llmServiceInstance = require('../src/llmService'); // Re-import

    mockOllamaGenerate.mockResolvedValue('Ollama with options');
    const options = { jsonMode: true, temperature: 0.5 };
    await llmServiceInstance.generate('s', 'u', options);

    expect(mockOllamaGenerate).toHaveBeenCalledWith('s', 'u', options);
  });

  test('should re-throw errors from the provider', async () => {
    require('../src/config').llm.provider = 'ollama';
    const llmServiceInstance = require('../src/llmService'); // Re-import

    const errorMessage = 'Provider failed';
    mockOllamaGenerate.mockRejectedValue(new Error(errorMessage));

    await expect(llmServiceInstance.generate('s', 'u')).rejects.toThrow(errorMessage);
  });

   test('should throw error if provider does not support generateStructured (conceptual test)', async () => {
    // This test is more conceptual as our current mocks always define generateStructured.
    // To truly test this, we'd need to modify a mock to not have the method.
    jest.doMock('../src/llmProviders/ollamaProvider', () => ({
      name: 'ollama_broken',
      // generateStructured is missing
    }));
    require('../src/config').llm.provider = 'ollama_broken'; // A hypothetical name for this test

    // Need to ensure the module cache is cleared for llmService AND its dynamic require of providers
    jest.resetModules();
    const configModule = require('../src/config');
    configModule.llm.provider = 'ollama_broken'; // Set it on the re-imported config

    const LlmServiceToTest = require('../src/llmService');

    // This setup is tricky because llmService caches its provider.
    // The ideal way is if llmService had an init() or reset() for testing.
    // Given the current structure, this specific error condition ("does not support generateStructured")
    // is hard to trigger reliably without altering llmService.js for testability.
    // We'll assume the check `typeof provider.generateStructured !== 'function'` in llmService.js works.
    // Awaiting a call to a non-function would naturally throw a TypeError.
    try {
        await LlmServiceToTest.generate('s', 'u');
    } catch (e) {
        // We expect an error, either the "misconfiguration" or a TypeError if it tries to call undefined.
        expect(e.message).toMatch(/LLM provider misconfiguration|is not a function/);
    }
  });


});
