const MCREngine = require('../src/core/mcrEngine');
jest.mock('../src/llm/ollamaProvider');
jest.mock('../src/reason/prologReasoner');
const MockLLMProvider = require('../src/llm/ollamaProvider');
const MockPrologReasonerProvider = require('../src/reason/prologReasoner');

describe('guidedDeduce', () => {
	let sessionId;
	const mcrEngine = new MCREngine();
	mcrEngine.llmProvider = new MockLLMProvider();
	mcrEngine.reasonerProvider = new MockPrologReasonerProvider();

	beforeEach(async () => {
		sessionId = 'test-session-id';
		await mcrEngine.sessionManager.createSession(sessionId);
		await mcrEngine.sessionManager.addFacts(sessionId, ['fact(a).', 'fact(b).']);
	});

	afterEach(() => {
		jest.clearAllMocks();
	});

	it('should return a result based on facts', async () => {
		const results = await mcrEngine.querySessionWithNL(
			sessionId,
			'What facts are there?'
		);
		expect(results.answer).toContain('fact(a)');
		expect(results.answer).toContain('fact(b)');
	});
});
