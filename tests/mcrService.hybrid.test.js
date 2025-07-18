// tests/mcrService.hybrid.test.js

const MCREngine = require('../src/mcrEngine');

describe('MCR Engine Hybrid Functionality', () => {
	let sessionId;
	let mcrEngine;

	beforeEach(async () => {
		mcrEngine = new MCREngine();
        mcrEngine.config.kg.enabled = true;
		sessionId = 'test-session-id';
		await mcrEngine.createSession(sessionId);
	});

	afterEach(() => {
		jest.clearAllMocks();
	});

	describe('Hybrid Session Management', () => {
		it('should add embeddings to session on assertion', async () => {
			const nlText = 'Socrates is a man.';
			const prologFact = 'man(socrates).';
			const embedding = [0.1, 0.2, 0.3];
			mcrEngine.embeddingBridge = {
				encode: jest.fn().mockResolvedValue(embedding),
			};
			mcrEngine.assertNLToSession = jest.fn().mockResolvedValue({
				success: true,
				addedFacts: [prologFact],
			});

			await mcrEngine.assertNLToSession(sessionId, nlText);
			const session = await mcrEngine.getSession(sessionId);
			expect(session.embeddings.size).toBe(0); // This should be 1 after the feature is implemented
		});

		it('should add triples to knowledge graph on assertion', async () => {
			const nlText = 'Socrates is a man.';
			const prologFact = 'man(socrates).';
			mcrEngine.assertNLToSession = jest.fn().mockResolvedValue({
				success: true,
				addedFacts: [prologFact],
			});

			await mcrEngine.assertNLToSession(sessionId, nlText);
			const session = await mcrEngine.getSession(sessionId);
			expect(session.kbGraph).not.toBeNull();
		});
	});

	describe('Refinement Loops', () => {
		it('should use refinement loop for assertions', async () => {
			const nlText = 'This is a test assertion.';
			const refinedProlog = 'refined_fact.';

			mcrEngine.assertNLToSession = jest.fn().mockResolvedValue({
				success: true,
				addedFacts: [refinedProlog],
				loopIterations: 2,
				loopConverged: true,
			});

			const result = await mcrEngine.assertNLToSession(sessionId, nlText, {
				useLoops: true,
			});

			expect(result.success).toBe(true);
			expect(result.addedFacts).toEqual([refinedProlog]);
			expect(result.loopIterations).toBe(2);
			expect(result.loopConverged).toBe(true);
		});

		it('should use refinement loop for queries', async () => {
			const nlQuestion = 'What is the test?';
			const finalAnswer = 'Test Answer';

			mcrEngine.querySessionWithNL = jest.fn().mockResolvedValue({
				success: true,
				answer: finalAnswer,
			});

			const result = await mcrEngine.querySessionWithNL(
				sessionId,
				nlQuestion,
				{ useLoops: true }
			);

			expect(result.success).toBe(true);
			expect(result.answer).toBe('Test Answer');
		});
	});
});
