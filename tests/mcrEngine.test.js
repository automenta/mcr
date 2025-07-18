const MCREngine = require('../src/mcrEngine');
const { ErrorCodes } = require('../src/errors');
const MockLLMProvider = require('./__mocks__/llmProvider');
const MockPrologReasonerProvider = require('./__mocks__/prologReasonerProvider');
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
  mcrEngine.getLlmProvider(new MockLLMProvider());
  mcrEngine.getReasonerProvider(new MockPrologReasonerProvider());

  beforeEach(async () => {
    sessionId = 'test-session-id';
    await mcrEngine.createSession(sessionId);
  });

  afterEach(() => {
    jest.clearAllMocks();
    mcrEngine.deleteSession(sessionId);
  });

  describe('assertNLToSession', () => {
    it('should successfully assert a natural language statement', async () => {
      const nlText = 'The sky is blue.';
      const result = await mcrEngine.assertNLToSession(sessionId, nlText, {
        useLoops: false,
      });
      const session = await mcrEngine.getSession(sessionId);
      expect(session.facts).toContain('is_blue(sky).');
    });
  });

  describe('querySessionWithNL', () => {
    it('should successfully query a session with NL', async () => {
      const nlQuestion = 'Is the sky blue?';
      await mcrEngine.addFacts(sessionId, ['is_blue(sky).']);
      const result = await mcrEngine.querySessionWithNL(
        sessionId,
        nlQuestion,
        { useLoops: false }
      );
      expect(result.answer).toBe('Yes, the sky is blue.');
    });
  });

  describe('Hybrid Execution Engine (HEE)', () => {
    it('should execute a simple program', async () => {
      const program = [
        {
          op: 'neural',
          prompt: {
            system: 'system prompt',
            user: 'translate to prolog',
          },
          outputVar: 'prolog',
        },
        {
          op: 'symbolic',
          query: 'is_blue(sky).',
          bindingsVar: 'results',
        },
      ];
      const results = [];
      for await (const result of mcrEngine.executeProgram(sessionId, program)) {
        results.push(result);
      }
      expect(results).toHaveLength(5);
    });
  });

  describe('Hybrid Loop', () => {
    it('should converge after one refinement loop', async () => {
      const nlText = 'The sun is hot.';
      const result = await mcrEngine.assertNLToSession(sessionId, nlText, {
        useLoops: true,
      });
      const session = await mcrEngine.getSession(sessionId);
      expect(session.facts).toContain('is_hot(sun).');
    });
  });

  describe('Context Graph', () => {
    it('should remain immutable', async () => {
      const session = await mcrEngine.getSession(sessionId);
      const originalContextGraph = session.contextGraph;
      await mcrEngine.addFacts(sessionId, ['is_green(grass).']);
      const newSession = await mcrEngine.getSession(sessionId);
      expect(newSession.contextGraph).not.toBe(originalContextGraph);
    });
  });

  describe('Evolution Module', () => {
    it('should run the evolution process', async () => {
      mcrEngine.config.evolution.enabled = true;
      const result = await mcrEngine.evolve(sessionId, 'some input');
      expect(result.success).toBe(true);
    });
  });
});
