const MCREngine = require('../src/core/mcrEngine');
jest.mock('../src/llm/ollamaProvider');
jest.mock('../src/reason/prologReasoner');
const MockLLMProvider = require('../src/llm/ollamaProvider');
const MockPrologReasonerProvider = require('../src/reason/prologReasoner');
const ontologyService = require('../src/ontologyService');
const fs = require('fs');
const path = require('path');

jest.mock('../src/evaluation/metrics.js', () => {
	return jest.fn().mockImplementation(() => {
		return {
			evaluate: jest.fn().mockResolvedValue({
				accuracy: 1,
				precision: 1,
				recall: 1,
				f1: 1,
			}),
		};
	});
});

describe('MCR Engine (mcrEngine.js)', () => {
	let sessionId;
	const mcrEngine = new MCREngine();
	mcrEngine.llmProvider = new MockLLMProvider();
	mcrEngine.reasonerProvider = new MockPrologReasonerProvider();
	const tempOntologyDir = path.join(__dirname, 'temp_ontologies');

	beforeAll(() => {
		if (!fs.existsSync(tempOntologyDir)) {
			fs.mkdirSync(tempOntologyDir);
		}
		ontologyService.configureOntologyService({ ontologyDir: tempOntologyDir });
	});

	afterAll(() => {
		fs.rmSync(tempOntologyDir, { recursive: true, force: true });
	});

	beforeEach(async () => {
		sessionId = 'test-session-id';
		await mcrEngine.sessionManager.createSession(sessionId);
	});

	afterEach(() => {
		jest.clearAllMocks();
	});

	describe('assertNLToSession', () => {
		it('should successfully assert a natural language statement', async () => {
			const nlText = 'The sky is blue.';
			await mcrEngine.assertNLToSession(sessionId, nlText, {
				useLoops: false,
			});
			const session = await mcrEngine.sessionManager.getSession(sessionId);
			expect(session.facts).toContain('is_blue(sky).');
		});
	});

	describe('querySessionWithNL', () => {
		it('should successfully query a session with NL', async () => {
			const nlQuestion = 'Is the sky blue?';
			await mcrEngine.sessionManager.addFacts(sessionId, ['is_blue(sky).']);
			const result = await mcrEngine.querySessionWithNL(sessionId, nlQuestion, {
				useLoops: false,
			});
			expect(result.answer).toBe('Yes, the sky is blue.');
		});
	});
});
