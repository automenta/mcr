const ConfigManager = require('../src/config');
const dotenv = require('dotenv');
const logger = require('../src/logger');

// Mock external modules
jest.mock('dotenv');
jest.mock('../src/logger');

describe('ConfigManager', () => {
    let originalEnv;

    beforeAll(() => {
        originalEnv = process.env; // Save original process.env
    });

    beforeEach(() => {
        jest.clearAllMocks();
        // Reset process.env for each test to ensure isolation
        process.env = { ...originalEnv };
        dotenv.config.mockReturnValue({}); // Default mock for dotenv.config
    });

    afterAll(() => {
        process.env = originalEnv; // Restore original process.env
    });

    describe('load', () => {
        test('should load default configuration when no environment variables are set', () => {
            // No process.env modifications needed, as it's reset to originalEnv (which might be empty for these specific vars)
            const config = ConfigManager.load();

            expect(config.server.host).toBe('0.0.0.0');
            expect(config.server.port).toBe(8080);
            expect(config.llm.provider).toBe('openai');
            expect(config.llm.model.openai).toBe('gpt-4o');
            expect(config.llm.model.gemini).toBe('gemini-pro');
            expect(config.llm.model.ollama).toBe('llama3');
            expect(config.llm.apiKey.openai).toBeUndefined(); // No key by default
            expect(config.llm.apiKey.gemini).toBeUndefined(); // No key by default
            expect(config.llm.ollamaBaseUrl).toBe('http://localhost:11434');
            expect(config.logging.level).toBe('info');
            expect(config.logging.file).toBe('mcr.log');
            expect(config.session.storagePath).toBe('./sessions');
            expect(config.ontology.storagePath).toBe('./ontologies');
            expect(dotenv.config).toHaveBeenCalled();
        });

        test('should load configuration from environment variables when set', () => {
            process.env.HOST = '127.0.0.1';
            process.env.PORT = '9000';
            process.env.MCR_LLM_PROVIDER = 'gemini';
            process.env.MCR_LLM_MODEL_GEMINI = 'gemini-ultra';
            process.env.GEMINI_API_KEY = 'test-gemini-key';
            process.env.LOG_LEVEL = 'debug';
            process.env.MCR_SESSION_STORAGE_PATH = '/app/sessions';
            process.env.MCR_ONTOLOGY_STORAGE_PATH = '/app/ontologies';

            const config = ConfigManager.load();

            expect(config.server.host).toBe('127.0.0.1');
            expect(config.server.port).toBe(9000);
            expect(config.llm.provider).toBe('gemini');
            expect(config.llm.model.gemini).toBe('gemini-ultra');
            expect(config.llm.apiKey.gemini).toBe('test-gemini-key');
            expect(config.logging.level).toBe('debug');
            expect(config.session.storagePath).toBe('/app/sessions');
            expect(config.ontology.storagePath).toBe('/app/ontologies');
        });

        test('should parse port as integer', () => {
            process.env.PORT = '1234';
            const config = ConfigManager.load();
            expect(config.server.port).toBe(1234);
        });

        test('should handle non-numeric port gracefully (defaults to 8080)', () => {
            process.env.PORT = 'not-a-number';
            const config = ConfigManager.load();
            expect(config.server.port).toBe(8080);
        });
    });

    describe('validate', () => {
        test('should warn if OpenAI provider is selected but API key is missing', () => {
            const config = {
                llm: { provider: 'openai', apiKey: { openai: undefined } }
            };
            ConfigManager.validate(config);
            expect(logger.warn).toHaveBeenCalledWith("MCR_LLM_PROVIDER is 'openai' but OPENAI_API_KEY is not set. OpenAI functionality will not work.");
        });

        test('should warn if Gemini provider is selected but API key is missing', () => {
            const config = {
                llm: { provider: 'gemini', apiKey: { gemini: undefined } }
            };
            ConfigManager.validate(config);
            expect(logger.warn).toHaveBeenCalledWith("MCR_LLM_PROVIDER is 'gemini' but GEMINI_API_KEY is not set. Gemini functionality will not work.");
        });

        test('should not warn if Ollama provider is selected (no API key needed)', () => {
            const config = {
                llm: { provider: 'ollama', apiKey: {} }
            };
            ConfigManager.validate(config);
            expect(logger.warn).not.toHaveBeenCalled();
        });

        test('should not warn if API keys are present for selected provider', () => {
            const config = {
                llm: { provider: 'openai', apiKey: { openai: 'some-key' } }
            };
            ConfigManager.validate(config);
            expect(logger.warn).not.toHaveBeenCalled();

            const config2 = {
                llm: { provider: 'gemini', apiKey: { gemini: 'some-key' } }
            };
            ConfigManager.validate(config2);
            expect(logger.warn).not.toHaveBeenCalled();
        });

        test('should not warn for unsupported provider (handled by LLMService init)', () => {
            const config = {
                llm: { provider: 'unsupported', apiKey: {} }
            };
            ConfigManager.validate(config);
            expect(logger.warn).not.toHaveBeenCalled();
        });
    });
});
