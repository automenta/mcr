// tests/optimizer.test.js

const { OptimizationCoordinator } = require('../src/evolutionModule');
const MCREngine = require('../src/mcrEngine');
const { Evaluator } = require('../src/evaluation/metrics');

jest.mock('../src/mcrEngine', () => {
	return jest.fn().mockImplementation(() => {
		return {
			createSession: jest.fn(),
			deleteSession: jest.fn(),
			_refineLoop: jest.fn(),
			config: {
				evalCasesPath: 'src/evalCases',
			},
		};
	});
});
jest.mock('../src/evaluation/metrics', () => ({
	Evaluator: jest.fn().mockImplementation(() => {
		return {
			evaluate: jest.fn().mockResolvedValue({ exactMatchProlog: 1 }),
			run: jest.fn().mockResolvedValue(),
		};
	}),
}));

describe('Evolution Optimizer', () => {
	let optimizer;
	let mcrService;

	beforeEach(() => {
		mcrService = new MCREngine();
		optimizer = new OptimizationCoordinator(mcrService);
		mcrService.createSession.mockResolvedValue({ id: 'test-session' });
		mcrService.deleteSession.mockResolvedValue(true);
		mcrService._refineLoop.mockResolvedValue({
			result: ['refined_fact.'],
			iterations: 2,
			converged: true,
			history: [],
		});
	});

	afterEach(() => {
		jest.clearAllMocks();
	});

	describe('optimizeInLoop', () => {
		it('should use refinement loops during optimization and evaluate results', async () => {
			const strategy = { id: 'test-strategy' };
			const inputCases = [
				{ nl: 'Test assertion.', expected: 'expected_fact.' },
			];
			const results = await optimizer.optimizeInLoop(strategy, inputCases);

			expect(mcrService.createSession).toHaveBeenCalled();
			expect(mcrService._refineLoop).toHaveBeenCalled();
			expect(optimizer.evaluator.evaluate).toHaveBeenCalledWith(
				['refined_fact.'],
				'expected_fact.'
			);
			expect(results[0].metrics.exactMatchProlog).toBe(1);
			expect(mcrService.deleteSession).toHaveBeenCalledWith('test-session');
		});
	});
});
