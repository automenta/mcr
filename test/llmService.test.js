const LlmService = require('../src/llmService');
const { ChatOpenAI } = require("@langchain/openai");
const { ChatGoogleGenerativeAI } = require("@langchain/google-genai");
const { ChatOllama } = require("@langchain/community/chat_models/ollama");
const { JsonOutputParser, StringOutputParser } = require("@langchain/core/output_parsers");
const { PromptTemplate } = require("@langchain/core/prompts");
const logger = require('../src/logger');
const ApiError = require('../src/errors');
const ConfigManager = require('../src/config');
const PROMPT_TEMPLATES = require('../src/prompts');

// Mock external modules
jest.mock("@langchain/openai");
jest.mock("@langchain/google-genai");
jest.mock("@langchain/community/chat_models/ollama");
jest.mock("@langchain/core/output_parsers");
jest.mock("@langchain/core/prompts");
jest.mock('../src/logger');
jest.mock('../src/errors');
jest.mock('../src/config');
jest.mock('../src/prompts');

describe('LlmService', () => {
    let mockChatClient;
    let mockPipe;
    let mockInvoke;

    beforeAll(() => {
        // Mock the chain.pipe().invoke() pattern
        mockInvoke = jest.fn();
        mockPipe = jest.fn(() => ({
            invoke: mockInvoke
        }));

        mockChatClient = {
            pipe: mockPipe
        };

        // Mock the constructors to return our mock client
        ChatOpenAI.mockImplementation(() => mockChatClient);
        ChatGoogleGenerativeAI.mockImplementation(() => mockChatClient);
        ChatOllama.mockImplementation(() => mockChatClient);

        // Mock PromptTemplate.fromTemplate().format()
        PromptTemplate.fromTemplate.mockImplementation((template) => ({
            format: jest.fn((input) => `Formatted: ${template} ${JSON.stringify(input)}`)
        }));

        // Mock output parsers
        JsonOutputParser.mockImplementation(() => ({ type: 'json' }));
        StringOutputParser.mockImplementation(() => ({ type: 'string' }));

        // Mock ApiError constructor
        ApiError.mockImplementation((status, message) => ({ status, message }));

        // Mock PROMPT_TEMPLATES
        PROMPT_TEMPLATES.NL_TO_RULES = 'NL_TO_RULES_TEMPLATE';
        PROMPT_TEMPLATES.QUERY_TO_PROLOG = 'QUERY_TO_PROLOG_TEMPLATE';
        PROMPT_TEMPLATES.RESULT_TO_NL = 'RESULT_TO_NL_TEMPLATE';
        PROMPT_TEMPLATES.RULES_TO_NL = 'RULES_TO_NL_TEMPLATE';
        PROMPT_TEMPLATES.EXPLAIN_QUERY = 'EXPLAIN_QUERY_TEMPLATE';
    });

    beforeEach(() => {
        jest.clearAllMocks();
        // Reset _client before each test to ensure init is called correctly
        LlmService._client = null;
    });

    describe('Initialization (init)', () => {
        test('should initialize with OpenAI if configured and API key is present', () => {
            ConfigManager.load.mockReturnValue({
                llm: { provider: 'openai', model: { openai: 'gpt-4o' }, apiKey: { openai: 'sk-test' } }
            });
            LlmService.init();
            expect(ChatOpenAI).toHaveBeenCalledWith({ apiKey: 'sk-test', modelName: 'gpt-4o', temperature: 0 });
            expect(LlmService._client).toBe(mockChatClient);
            expect(logger.info).toHaveBeenCalledWith("LLM Service initialized with provider: 'openai' and model: 'gpt-4o'");
        });

        test('should not initialize OpenAI if API key is missing', () => {
            ConfigManager.load.mockReturnValue({
                llm: { provider: 'openai', model: { openai: 'gpt-4o' }, apiKey: { openai: null } }
            });
            LlmService.init();
            expect(ChatOpenAI).not.toHaveBeenCalled();
            expect(LlmService._client).toBeNull();
            expect(logger.warn).toHaveBeenCalledWith("OpenAI API key not provided. OpenAI LLM service will not be available.");
        });

        test('should initialize with Gemini if configured and API key is present', () => {
            ConfigManager.load.mockReturnValue({
                llm: { provider: 'gemini', model: { gemini: 'gemini-pro' }, apiKey: { gemini: 'gemini-test' } }
            });
            LlmService.init();
            expect(ChatGoogleGenerativeAI).toHaveBeenCalledWith({ apiKey: 'gemini-test', modelName: 'gemini-pro', temperature: 0 });
            expect(LlmService._client).toBe(mockChatClient);
            expect(logger.info).toHaveBeenCalledWith("LLM Service initialized with provider: 'gemini' and model: 'gemini-pro'");
        });

        test('should not initialize Gemini if API key is missing', () => {
            ConfigManager.load.mockReturnValue({
                llm: { provider: 'gemini', model: { gemini: 'gemini-pro' }, apiKey: { gemini: null } }
            });
            LlmService.init();
            expect(ChatGoogleGenerativeAI).not.toHaveBeenCalled();
            expect(LlmService._client).toBeNull();
            expect(logger.warn).toHaveBeenCalledWith("Gemini API key not provided. Gemini LLM service will not be available.");
        });

        test('should initialize with Ollama if configured', () => {
            ConfigManager.load.mockReturnValue({
                llm: { provider: 'ollama', model: { ollama: 'llama3' }, ollamaBaseUrl: 'http://localhost:11434' }})
            ;
            LlmService.init();
            expect(ChatOllama).toHaveBeenCalledWith({ baseUrl: 'http://localhost:11434', model: 'llama3', temperature: 0 });
            expect(LlmService._client).toBe(mockChatClient);
            expect(logger.info).toHaveBeenCalledWith("LLM Service initialized with provider: 'ollama' and model: 'llama3'");
        });

        test('should handle unsupported LLM provider', () => {
            ConfigManager.load.mockReturnValue({
                llm: { provider: 'unsupported', model: {}, apiKey: {} }
            });
            LlmService.init();
            expect(LlmService._client).toBeNull();
            expect(logger.error).toHaveBeenCalledWith("Unsupported LLM provider: unsupported. LLM service will not be available.");
        });

        test('should handle errors during client instantiation', () => {
            ChatOpenAI.mockImplementationOnce(() => { throw new Error('Instantiation failed'); });
            ConfigManager.load.mockReturnValue({
                llm: { provider: 'openai', model: { openai: 'gpt-4o' }, apiKey: { openai: 'sk-test' } }
            });
            LlmService.init();
            expect(LlmService._client).toBeNull();
            expect(logger.error).toHaveBeenCalledWith("Failed to initialize LLM provider 'openai': Instantiation failed");
        });
    });

    describe('LLM Invocation (_invokeChain)', () => {
        beforeEach(() => {
            // Ensure client is initialized for these tests
            ConfigManager.load.mockReturnValue({
                llm: { provider: 'openai', model: { openai: 'gpt-4o' }, apiKey: { openai: 'sk-test' } }
            });
            LlmService.init();
        });

        test('should throw ApiError if LLM client is not initialized', async () => {
            LlmService._client = null; // Manually set to null for this test
            await expect(LlmService._invokeChain('template', {}, new StringOutputParser()))
                .rejects.toEqual(expect.objectContaining({ status: 503, message: "LLM Service unavailable. Check configuration and API keys." }));
            expect(logger.error).toHaveBeenCalledWith("LLM Service not available or not initialized correctly.");
            expect(ApiError).toHaveBeenCalledWith(503, "LLM Service unavailable. Check configuration and API keys.");
        });

        test('should call prompt format and chain invoke with correct arguments', async () => {
            mockInvoke.mockResolvedValue('LLM Response');
            const mockInput = { key: 'value' };
            const mockOutputParser = { type: 'test-parser' };

            const result = await LlmService._invokeChain('TEST_TEMPLATE', mockInput, mockOutputParser);

            expect(PromptTemplate.fromTemplate).toHaveBeenCalledWith('TEST_TEMPLATE');
            expect(PromptTemplate.fromTemplate().format).toHaveBeenCalledWith(mockInput);
            expect(mockPipe).toHaveBeenCalledWith(mockOutputParser);
            expect(mockInvoke).toHaveBeenCalledWith('Formatted: TEST_TEMPLATE {"key":"value"}');
            expect(result).toBe('LLM Response');
        });

        test('should handle errors during LLM invocation', async () => {
            mockInvoke.mockRejectedValue(new Error('LLM API error'));

            await expect(LlmService._invokeChain('template', {}, new StringOutputParser()))
                .rejects.toEqual(expect.objectContaining({ status: 502, message: "Error communicating with LLM provider: LLM API error" }));
            expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('LLM invocation error'));
            expect(ApiError).toHaveBeenCalledWith(502, expect.stringContaining('Error communicating with LLM provider'));
        });
    });

    describe('Specific LLM Functions', () => {
        beforeEach(() => {
            // Ensure client is initialized for these tests
            ConfigManager.load.mockReturnValue({
                llm: { provider: 'openai', model: { openai: 'gpt-4o' }, apiKey: { openai: 'sk-test' } }
            });
            LlmService.init();
        });

        test('nlToRules should call _invokeChain with correct template and parser', async () => {
            mockInvoke.mockResolvedValue(['rule1.', 'rule2.']);
            const text = 'Some text';
            const existingFacts = 'fact1.';
            const ontologyContext = 'onto1.';

            const result = await LlmService.nlToRules(text, existingFacts, ontologyContext);

            expect(mockPipe).toHaveBeenCalledWith(expect.objectContaining({ type: 'json' }));
            expect(PromptTemplate.fromTemplate().format).toHaveBeenCalledWith({
                existing_facts: existingFacts,
                ontology_context: ontologyContext,
                text_to_translate: text
            });
            expect(result).toEqual(['rule1.', 'rule2.']);
        });

        test('nlToRules should throw ApiError if LLM does not return an array', async () => {
            mockInvoke.mockResolvedValue('not an array');
            await expect(LlmService.nlToRules('text')).rejects.toEqual(expect.objectContaining({ status: 422 }));
            expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("LLM failed to produce a valid JSON array of rules."));
            expect(ApiError).toHaveBeenCalledWith(422, "LLM failed to produce a valid JSON array of rules.");
        });

        test('queryToProlog should call _invokeChain with correct template and parser', async () => {
            mockInvoke.mockResolvedValue('prolog_query.');
            const question = 'Is this true?';

            const result = await LlmService.queryToProlog(question);

            expect(mockPipe).toHaveBeenCalledWith(expect.objectContaining({ type: 'string' }));
            expect(PromptTemplate.fromTemplate().format).toHaveBeenCalledWith({ question });
            expect(result).toBe('prolog_query.');
        });

        test('resultToNl should call _invokeChain with correct template and parser', async () => {
            mockInvoke.mockResolvedValue('Natural language answer.');
            const originalQuestion = 'What is it?';
            const logicResult = 'true.';
            const style = 'formal';

            const result = await LlmService.resultToNl(originalQuestion, logicResult, style);

            expect(mockPipe).toHaveBeenCalledWith(expect.objectContaining({ type: 'string' }));
            expect(PromptTemplate.fromTemplate().format).toHaveBeenCalledWith({
                style,
                original_question: originalQuestion,
                logic_result: logicResult
            });
            expect(result).toBe('Natural language answer.');
        });

        test('rulesToNl should call _invokeChain with correct template and parser', async () => {
            mockInvoke.mockResolvedValue('Rules explained.');
            const rules = ['rule1.', 'rule2.'];
            const style = 'conversational';

            const result = await LlmService.rulesToNl(rules, style);

            expect(mockPipe).toHaveBeenCalledWith(expect.objectContaining({ type: 'string' }));
            expect(PromptTemplate.fromTemplate().format).toHaveBeenCalledWith({
                style,
                prolog_rules: rules.join('\n')
            });
            expect(result).toBe('Rules explained.');
        });

        test('explainQuery should call _invokeChain with correct template and parser', async () => {
            mockInvoke.mockResolvedValue('Query explanation.');
            const query = 'query(X).';
            const facts = 'fact(a).';
            const ontologyContext = 'ontology(b).';

            const result = await LlmService.explainQuery(query, facts, ontologyContext);

            expect(mockPipe).toHaveBeenCalledWith(expect.objectContaining({ type: 'string' }));
            expect(PromptTemplate.fromTemplate().format).toHaveBeenCalledWith({
                query,
                facts,
                ontology_context: ontologyContext
            });
            expect(result).toBe('Query explanation.');
        });
    });
});