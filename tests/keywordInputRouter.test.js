// tests/keywordInputRouter.test.js

const { KeywordInputRouter } = require('../src/evolutionModule');
const db = require('../src/store/database');
const logger = require('../src/util/logger');

jest.mock('../src/store/database');
jest.mock('../src/util/logger');

describe('KeywordInputRouter', () => {
	let keywordInputRouter;
	let mockDb;

	beforeEach(() => {
		mockDb = {
			all: jest.fn(),
		};
		keywordInputRouter = new KeywordInputRouter(mockDb);
	});

	afterEach(() => {
		jest.clearAllMocks();
	});

	describe('constructor', () => {
		it('should initialize with a db instance', () => {
			expect(keywordInputRouter.db).toBe(mockDb);
			expect(logger.info).toHaveBeenCalledWith(
				'[InputRouter] Initialized with database instance.'
			);
		});
	});

	describe('classifyInput', () => {
		it('should classify input with question marks as query', () => {
			const text = 'What is the capital of France?';
			expect(keywordInputRouter.classifyInput(text)).toBe('general_query');
		});

		it('should classify other input as assertion', () => {
			const text = 'The sky is blue.';
			expect(keywordInputRouter.classifyInput(text)).toBe('general_assert');
		});
	});

	describe('route', () => {
		it('should return strategy hash if recommended', async () => {
			const text = 'Test input';
			const llmModelId = 'test_model';
			const expectedHash = 'strategy123';
			keywordInputRouter.getBestStrategy = jest
				.fn()
				.mockResolvedValue(expectedHash);
			const result = await keywordInputRouter.route(text, llmModelId);
			expect(result).toBe(expectedHash);
		});

		it('should return null if no strategy is recommended', async () => {
			const text = 'Test input';
			const llmModelId = 'test_model';
			keywordInputRouter.getBestStrategy = jest.fn().mockResolvedValue(null);
			const result = await keywordInputRouter.route(text, llmModelId);
			expect(result).toBeNull();
		});
	});
});
