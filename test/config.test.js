// Mock logger and process.exit first
const mockLoggerWarn = jest.fn();
const mockLoggerError = jest.fn();
const mockLoggerFatal = jest.fn();
const mockLoggerInfo = jest.fn();
const mockProcessExit = jest
  .spyOn(process, 'exit')
  .mockImplementation((_code) => {
    // Prefixed code
    // throw new Error(`process.exit called with ${_code}`); // Make it throw to stop execution
    // Or just record the call if preferred, but throwing helps ensure the test stops there.
    // For tests expecting exit, this is fine. For those not, it helps catch unexpected exits.
    // console.log(`process.exit(${code}) called`);
  });

jest.mock('dotenv'); // Mock dotenv before any application code is required

jest.mock('../src/logger', () => ({
  logger: {
    warn: mockLoggerWarn,
    error: mockLoggerError,
    fatal: mockLoggerFatal,
    info: mockLoggerInfo, // Mock info as ConfigManager uses it
    debug: jest.fn(),
  },
  // ... other logger exports if needed by ConfigManager indirectly
}));

const ConfigManager = require('../src/config');
const dotenv = require('dotenv'); // Mocked version

describe('ConfigManager', () => {
  let originalEnv;

  beforeAll(() => {
    originalEnv = { ...process.env };
  });

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv }; // Reset process.env
    ConfigManager._config = null; // Crucial: Reset internal cache
    dotenv.config.mockReturnValue({}); // Default mock for dotenv
  });

  afterAll(() => {
    process.env = originalEnv; // Restore original environment
    mockProcessExit.mockRestore(); // Clean up spy
  });

  describe('load and get', () => {
    test('should load mostly default configuration when provider is set to ollama (no API key needed)', () => {
      process.env.MCR_LLM_PROVIDER = 'ollama'; // Set to ollama to avoid API key requirement for this specific test
      // MCR_LLM_OLLAMA_BASE_URL will use its default 'http://localhost:11434'

      const config = ConfigManager.get();
      expect(config.server.host).toBe('0.0.0.0');
      expect(config.server.port).toBe(8080);
      expect(config.llm.provider).toBe('ollama');
      expect(config.llm.model.openai).toBe('gpt-4o'); // This would still be its default from process.env if not set
      expect(config.llm.model.ollama).toBe('llama3'); // Default for ollama model
      expect(config.llm.ollamaBaseUrl).toBe('http://localhost:11434');
      expect(config.logging.level).toBe('info');
      expect(config.session.storagePath).toBe('./sessions_data');
      expect(config.ontology.storagePath).toBe('./ontologies_data');
      expect(dotenv.config).toHaveBeenCalledTimes(1);
      expect(mockProcessExit).not.toHaveBeenCalled();
    });

    test('should load configuration from environment variables', () => {
      process.env.HOST = '127.0.0.1';
      process.env.PORT = '9090';
      process.env.MCR_LLM_PROVIDER = 'gemini';
      process.env.MCR_LLM_MODEL_GEMINI = 'gemini-1.5-pro';
      process.env.GEMINI_API_KEY = 'test-gemini-key';
      process.env.LOG_LEVEL = 'debug';
      process.env.MCR_SESSION_STORAGE_PATH = '/data/s';
      process.env.MCR_ONTOLOGY_STORAGE_PATH = '/data/o';
      process.env.MCR_DEBUG_MODE = 'true';

      const config = ConfigManager.get();
      expect(config.server.host).toBe('127.0.0.1');
      expect(config.server.port).toBe(9090);
      expect(config.llm.provider).toBe('gemini');
      expect(config.llm.model.gemini).toBe('gemini-1.5-pro');
      expect(config.llm.apiKey.gemini).toBe('test-gemini-key');
      expect(config.logging.level).toBe('debug');
      expect(config.session.storagePath).toBe('/data/s');
      expect(config.ontology.storagePath).toBe('/data/o');
      expect(config.debugMode).toBe(true);
      expect(mockProcessExit).not.toHaveBeenCalled();
    });

    test('should cache configuration after first load', () => {
      process.env.MCR_LLM_PROVIDER = 'ollama'; // No API key needed, should load fine
      process.env.MCR_LLM_OLLAMA_BASE_URL = 'http://mockhost:11434';

      const config1 = ConfigManager.get();
      expect(dotenv.config).toHaveBeenCalledTimes(1);
      const config2 = ConfigManager.get();
      expect(dotenv.config).toHaveBeenCalledTimes(1); // Should not call dotenv.config again
      expect(config2).toBe(config1); // Should return the cached instance
      expect(mockProcessExit).not.toHaveBeenCalled();
    });
  });

  describe('validation - Exiting Behavior (default)', () => {
    test('should exit if OpenAI provider is selected but API key is missing', () => {
      process.env.MCR_LLM_PROVIDER = 'openai';
      delete process.env.OPENAI_API_KEY;
      ConfigManager.get(); // Will call load() which calls validate()
      expect(mockProcessExit).toHaveBeenCalledWith(1);
      expect(mockLoggerFatal).toHaveBeenCalledWith(
        expect.stringContaining(
          'Application cannot start due to configuration errors. Exiting.'
        )
      );
    });

    test('should exit if Gemini provider is selected but API key is missing', () => {
      process.env.MCR_LLM_PROVIDER = 'gemini';
      delete process.env.GEMINI_API_KEY;
      ConfigManager.get();
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    test('should exit if Ollama provider is selected but base URL is missing', () => {
      process.env.MCR_LLM_PROVIDER = 'ollama';
      process.env.MCR_LLM_OLLAMA_BASE_URL = ''; // Set to empty to bypass default
      ConfigManager.get();
      expect(mockProcessExit).toHaveBeenCalledWith(1);
      expect(mockLoggerError).toHaveBeenCalledWith(
        expect.stringContaining('MCR_LLM_OLLAMA_BASE_URL is missing or empty')
      );
    });

    test('should exit if Ollama base URL is invalid', () => {
      process.env.MCR_LLM_PROVIDER = 'ollama';
      process.env.MCR_LLM_OLLAMA_BASE_URL = 'not-a-valid-url';
      ConfigManager.get();
      expect(mockProcessExit).toHaveBeenCalledWith(1);
      expect(mockLoggerError).toHaveBeenCalledWith(
        expect.stringContaining('not a valid URL')
      );
    });

    test('should exit for invalid MCR_LLM_PROVIDER', () => {
      process.env.MCR_LLM_PROVIDER = 'unknown_provider';
      // No need to set API keys as this check comes first for provider
      ConfigManager.get();
      expect(mockProcessExit).toHaveBeenCalledWith(1);
      expect(mockLoggerError).toHaveBeenCalledWith(
        expect.stringContaining("Invalid MCR_LLM_PROVIDER: 'unknown_provider'")
      );
    });

    test('should exit for invalid PORT (non-numeric)', () => {
      process.env.MCR_LLM_PROVIDER = 'ollama'; // Satisfy LLM provider validation
      process.env.MCR_LLM_OLLAMA_BASE_URL = 'http://localhost:11434'; // Satisfy LLM provider validation
      process.env.PORT = 'abc';
      ConfigManager.get();
      expect(mockProcessExit).toHaveBeenCalledWith(1);
      expect(mockLoggerError).toHaveBeenCalledWith(
        expect.stringContaining("Invalid PORT: 'abc'")
      );
    });

    test('should exit for invalid PORT (out of range)', () => {
      process.env.MCR_LLM_PROVIDER = 'ollama'; // Satisfy LLM provider validation
      process.env.MCR_LLM_OLLAMA_BASE_URL = 'http://localhost:11434'; // Satisfy LLM provider validation
      process.env.PORT = '70000';
      ConfigManager.get();
      expect(mockProcessExit).toHaveBeenCalledWith(1);
      expect(mockLoggerError).toHaveBeenCalledWith(
        expect.stringContaining("Invalid PORT: '70000'")
      );
    });
  });

  describe('validation - Non-Exiting Behavior (exitOnFailure: false)', () => {
    test('should throw error if OpenAI API key is missing', () => {
      process.env.MCR_LLM_PROVIDER = 'openai';
      delete process.env.OPENAI_API_KEY;
      // process.env.PORT = '1234'; // Ensure PORT is valid if that check comes first
      expect(() => ConfigManager.load({ exitOnFailure: false })).toThrow(
        /OPENAI_API_KEY is missing or empty/
      );
      expect(mockProcessExit).not.toHaveBeenCalled();
    });

    test('should throw error if Gemini API key is missing', () => {
      process.env.MCR_LLM_PROVIDER = 'gemini';
      delete process.env.GEMINI_API_KEY;
      // process.env.PORT = '1234';
      expect(() => ConfigManager.load({ exitOnFailure: false })).toThrow(
        /GEMINI_API_KEY is missing or empty/
      );
    });

    test('should throw error if Ollama base URL is missing', () => {
      process.env.MCR_LLM_PROVIDER = 'ollama';
      process.env.MCR_LLM_OLLAMA_BASE_URL = ''; // Set to empty to bypass default
      // process.env.PORT = '1234';
      expect(() => ConfigManager.load({ exitOnFailure: false })).toThrow(
        /MCR_LLM_OLLAMA_BASE_URL is missing or empty/
      );
    });

    test('should throw error if Ollama base URL is invalid', () => {
      process.env.MCR_LLM_PROVIDER = 'ollama';
      process.env.MCR_LLM_OLLAMA_BASE_URL = 'invalid-url';
      // process.env.PORT = '1234';
      expect(() => ConfigManager.load({ exitOnFailure: false })).toThrow(
        /not a valid URL/
      );
    });
  });

  describe('specific value handling', () => {
    test('should correctly parse MCR_DEBUG_MODE', () => {
      // Satisfy provider checks to ensure debugMode parsing is reached
      process.env.MCR_LLM_PROVIDER = 'ollama';
      process.env.MCR_LLM_OLLAMA_BASE_URL = 'http://localhost:11434';

      process.env.MCR_DEBUG_MODE = 'true';
      expect(ConfigManager.get().debugMode).toBe(true);

      ConfigManager._config = null; // Reset for next part
      process.env.MCR_DEBUG_MODE = 'false';
      expect(ConfigManager.get().debugMode).toBe(false);

      ConfigManager._config = null; // Reset for next part
      delete process.env.MCR_DEBUG_MODE;
      expect(ConfigManager.get().debugMode).toBe(false);
    });

    test('should handle LOG_LEVEL case-insensitively and default for invalid', () => {
      process.env.LOG_LEVEL = 'DEBUG'; // Uppercase
      // Provide necessary keys for successful load
      process.env.MCR_LLM_PROVIDER = 'ollama';
      process.env.MCR_LLM_OLLAMA_BASE_URL = 'http://localhost:1234';

      let config = ConfigManager.get();
      expect(config.logging.level).toBe('debug');
      expect(mockLoggerWarn).not.toHaveBeenCalled();

      ConfigManager._config = null;
      process.env.LOG_LEVEL = 'invalid_level';
      config = ConfigManager.get();
      expect(config.logging.level).toBe('info'); // Defaults to info
      expect(mockLoggerWarn).toHaveBeenCalledWith(
        expect.stringContaining(
          "Invalid LOG_LEVEL: 'invalid_level'. Defaulting to 'info'."
        )
      );
    });

    test('should load successfully with Ollama provider and valid URL', () => {
      process.env.MCR_LLM_PROVIDER = 'ollama';
      process.env.MCR_LLM_OLLAMA_BASE_URL = 'http://my-ollama:11434';
      const config = ConfigManager.get();
      expect(config.llm.provider).toBe('ollama');
      expect(config.llm.ollamaBaseUrl).toBe('http://my-ollama:11434');
      expect(mockProcessExit).not.toHaveBeenCalled();
    });
  });
});
