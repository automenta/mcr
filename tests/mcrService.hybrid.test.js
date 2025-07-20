const MCREngine = require('../src/mcrEngine');

describe('MCR Engine Hybrid Functionality', () => {
	let sessionId;
	let mcrEngine;

	beforeEach(async () => {
		mcrEngine = new MCREngine();
		mcrEngine.config.kg.enabled = true;
        mcrEngine.llmProvider = new (require('./__mocks__/llmProvider'))();
        mcrEngine.reasonerProvider = new (require('./__mocks__/prologReasonerProvider'))();
		sessionId = 'test-session-id';
		await mcrEngine.createSession(sessionId);
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
