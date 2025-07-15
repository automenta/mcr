// tests/evolution/optimizer.test.js

const OptimizationCoordinator = require('../../src/evolution/optimizer');
const mcrService = require('../../src/mcrService');
const { Evaluator } = require('../../src/evaluation/evaluator');

jest.mock('../../src/mcrService');
jest.mock('../../src/evaluation/evaluator');

describe('Evolution Optimizer', () => {
  let optimizer;

  beforeEach(() => {
    optimizer = new OptimizationCoordinator();
    Evaluator.mockClear();
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
      const inputCases = [{ nl: 'Test assertion.', expected: 'expected_fact.' }];
      const mockEvaluate = jest.fn().mockResolvedValue({ exactMatchProlog: 1 });
      Evaluator.prototype.evaluate = mockEvaluate;


      const results = await optimizer.optimizeInLoop(strategy, inputCases);

      expect(mcrService.createSession).toHaveBeenCalled();
      expect(mcrService._refineLoop).toHaveBeenCalled();
      expect(mockEvaluate).toHaveBeenCalledWith(['refined_fact.'], 'expected_fact.');
      expect(results[0].metrics.exactMatchProlog).toBe(1);
      expect(mcrService.deleteSession).toHaveBeenCalledWith('test-session');
    });
  });
});
