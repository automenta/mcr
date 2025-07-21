const MCREngine = require('../src/core/mcrEngine');

describe('MCR Engine Hybrid Functionality', () => {
	let sessionId;
	let mcrEngine;

	beforeEach(async () => {
		jest.mock('../src/llm/ollamaProvider');
		jest.mock('../src/reason/prologReasoner');
		const MockLLMProvider = require('../src/llm/ollamaProvider');
		const MockPrologReasonerProvider = require('../src/reason/prologReasoner');
		mcrEngine = new MCREngine();
		mcrEngine.config.kg.enabled = true;
		mcrEngine.llmProvider = new MockLLMProvider();
		mcrEngine.reasonerProvider = new MockPrologReasonerProvider();
		sessionId = 'test-session-id';
		await mcrEngine.sessionManager.createSession(sessionId);
	});

	afterEach(() => {
		jest.clearAllMocks();
	});

	describe('Hybrid Session Management', () => {
		it('should have an embeddings map on the session object', async () => {
			const session = await mcrEngine.getSession(sessionId);
			expect(session.embeddings).toBeDefined();
			expect(session.embeddings).toBeInstanceOf(Map);
		});

		it('should have a knowledge graph on the session object when enabled', async () => {
			const session = await mcrEngine.getSession(sessionId);
			expect(session.kbGraph).not.toBeNull();
			expect(session.kbGraph).toBeDefined();
		});
	});
});
