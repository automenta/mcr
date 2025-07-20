const MCREngine = require('../src/mcrEngine');
const MockLLMProvider = require('./__mocks__/llmProvider');
const MockPrologReasonerProvider = require('./__mocks__/prologReasonerProvider');

describe('guidedDeduce', () => {
	let sessionId;
	const mcrEngine = new MCREngine();
	mcrEngine.getLlmProvider(new MockLLMProvider());
	mcrEngine.getReasonerProvider(new MockPrologReasonerProvider());

	beforeEach(async () => {
		sessionId = 'test-session-id';
		await mcrEngine.createSession(sessionId);
		await mcrEngine.assertNLToSession(sessionId, 'fact(a). fact(b).');
	});

	afterEach(() => {
		jest.clearAllMocks();
		mcrEngine.deleteSession(sessionId);
	});

	it('should return a probabilistic result', async () => {
		const results = await mcrEngine.querySessionWithNL(sessionId, 'fact(X).');
		expect(results.answer).toBe('a');
	});
});
