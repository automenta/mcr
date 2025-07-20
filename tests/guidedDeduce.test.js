const MCREngine = require('../src/mcrEngine');
const MockLLMProvider = require('./__mocks__/llmProvider');
const MockPrologReasonerProvider = require('./__mocks__/prologReasonerProvider');

describe('guidedDeduce', () => {
	let sessionId;
	const mcrEngine = new MCREngine();
    mcrEngine.llmProvider = new MockLLMProvider();
    mcrEngine.reasonerProvider = new MockPrologReasonerProvider();

	beforeEach(async () => {
		sessionId = 'test-session-id';
		await mcrEngine.createSession(sessionId);
		await mcrEngine.addFacts(sessionId, ['fact(a).', 'fact(b).']);
	});

	afterEach(() => {
		jest.clearAllMocks();
	});

	it('should return a result based on facts', async () => {
		const results = await mcrEngine.querySessionWithNL(sessionId, 'What facts are there?');
		expect(results.answer).toContain('fact(a)');
        expect(results.answer).toContain('fact(b)');
	});
});
