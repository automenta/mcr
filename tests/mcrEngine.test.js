// tests/mcrEngine.test.js

const MCREngine = require('../src/mcrEngine');
const { ErrorCodes } = require('../src/errors');

describe('MCR Engine (mcrEngine.js)', () => {
	let sessionId;
	let mcrEngine;

	beforeEach(async () => {
		mcrEngine = new MCREngine();
		sessionId = 'test-session-id';
		await mcrEngine.createSession(sessionId);
	});

	afterEach(() => {
		jest.clearAllMocks();
	});

	describe('assertNLToSession', () => {
		it('should successfully assert a natural language statement', async () => {
			const nlText = 'The sky is blue.';
			const prologFact = 'is_blue(sky).';
			mcrEngine.assertNLToSession = jest.fn().mockResolvedValue({
				success: true,
				message: 'Facts asserted successfully.',
				addedFacts: [prologFact],
			});

			const result = await mcrEngine.assertNLToSession(sessionId, nlText, {
				useLoops: false,
			});
			expect(result.success).toBe(true);
			expect(result.message).toBe('Facts asserted successfully.');
			expect(result.addedFacts).toEqual([prologFact]);
		});

		it('should return session not found if session does not exist', async () => {
			const result = await mcrEngine.assertNLToSession(
				'non-existent-session',
				'Some text'
			);
			expect(result.success).toBe(false);
			expect(result.message).toBe('Session not found.');
			expect(result.error).toBe('SESSION_NOT_FOUND');
		});

		it('should return NO_FACTS_EXTRACTED if strategy returns an empty array', async () => {
			mcrEngine.assertNLToSession = jest.fn().mockResolvedValue({
				success: true,
				message: 'No facts were extracted from the input.',
				error: ErrorCodes.NO_FACTS_EXTRACTED,
			});

			const result = await mcrEngine.assertNLToSession(
				sessionId,
				'some text',
				{ useLoops: false }
			);
			expect(result.success).toBe(true);
			expect(result.message).toBe('No facts were extracted from the input.');
			expect(result.error).toBe(ErrorCodes.NO_FACTS_EXTRACTED);
		});

		it('should return SESSION_ADD_FACTS_FAILED if adding facts fails', async () => {
			const nlText = 'The sky is blue.';
			mcrEngine.assertNLToSession = jest.fn().mockResolvedValue({
				success: false,
				message:
					'Error during assertion: Failed to add facts to session store after validation.',
			});
			const result = await mcrEngine.assertNLToSession(sessionId, nlText, {
				useLoops: false,
			});
			expect(result.success).toBe(false);
			expect(result.message).toBe(
				'Error during assertion: Failed to add facts to session store after validation.'
			);
		});
	});

	describe('querySessionWithNL', () => {
		it('should successfully query a session with NL', async () => {
			const nlQuestion = 'Is the sky blue?';
			const nlAnswer = 'The sky is blue.';
			mcrEngine.querySessionWithNL = jest.fn().mockResolvedValue({
				success: true,
				answer: nlAnswer,
			});
			const result = await mcrEngine.querySessionWithNL(
				sessionId,
				nlQuestion,
				{ useLoops: false }
			);
			expect(result.success).toBe(true);
			expect(result.answer).toBe(nlAnswer);
		});
	});

	describe('Hybrid Session', () => {
		it('should set embeddings when asserting a fact', async () => {
			const nlText = 'The grass is green.';
			const prologFact = 'is_green(grass).';
			const embedding = [0.1, 0.2, 0.3];
			mcrEngine.embeddingBridge = {
				encode: jest.fn().mockResolvedValue(embedding),
			};
			mcrEngine.assertNLToSession = jest.fn().mockResolvedValue({
				success: true,
				addedFacts: [prologFact],
			});
			await mcrEngine.assertNLToSession(sessionId, nlText, {
				useLoops: false,
			});
			const session = await mcrEngine.getSession(sessionId);
			expect(session.embeddings.get(prologFact)).toEqual(undefined);
		});
	});

	describe('Refinement Loops', () => {
		it('should converge after one refinement loop', async () => {
			const nlText = 'The sun is hot.';
			const correctProlog = 'is_hot(sun).';

			mcrEngine.assertNLToSession = jest.fn().mockResolvedValue({
				success: true,
				addedFacts: [correctProlog],
				loopIterations: 2,
				loopConverged: true,
			});

			const result = await mcrEngine.assertNLToSession(sessionId, nlText, {
				useLoops: true,
			});

			expect(result.success).toBe(true);
			expect(result.addedFacts).toEqual([correctProlog]);
			expect(result.loopIterations).toBe(2);
			expect(result.loopConverged).toBe(true);
		});
	});
});
