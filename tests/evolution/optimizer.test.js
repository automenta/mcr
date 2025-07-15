// tests/evolution/optimizer.test.js

const optimizer = require('../../src/evolution/optimizer');
const mcrService = require('../../src/mcrService');

jest.mock('../../src/mcrService', () => ({
  assertNLToSession: jest.fn(),
  querySessionWithNL: jest.fn(),
}));

describe('Evolution Optimizer', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('optimizeInLoop', () => {
    it('should use refinement loops during optimization', async () => {
      const strategy = { id: 'test-strategy' };
      const inputCases = [{ type: 'assertion', nl: 'Test assertion.' }];

      mcrService.assertNLToSession.mockResolvedValue({ success: true, loopIterations: 2 });

      await optimizer.optimizeInLoop(strategy, inputCases);

      expect(mcrService.assertNLToSession).toHaveBeenCalledWith(expect.any(String), 'Test assertion.', { useLoops: true });
    });

    it('should include hybrid metrics in performance results', async () => {
        const strategy = { id: 'test-strategy' };
        const inputCases = [{ type: 'query', nl: 'Test query?' }];

        mcrService.querySessionWithNL.mockResolvedValue({ success: true, embedding_sim: 0.95, prob_score: 0.88 });

        const results = await optimizer.optimizeInLoop(strategy, inputCases);

        expect(results.performance.embedding_sim).toBe(0.95);
        expect(results.performance.prob_score).toBe(0.88);
      });
  });
});
