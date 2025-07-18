const MCREngine = require('../src/mcrEngine');
const { ErrorCodes } = require('../src/errors');
const MockLLMProvider = require('./__mocks__/llmProvider');
const MockPrologReasonerProvider = require('./__mocks__/prologReasonerProvider');

describe('MCR Engine (mcrEngine.js)', () => {
  let sessionId;
  let mcrEngine;

  beforeEach(async () => {
    mcrEngine = new MCREngine();
    mcrEngine.llmProvider = new MockLLMProvider();
    mcrEngine.reasonerProvider = new MockPrologReasonerProvider();
    sessionId = 'test-session-id';
    await mcrEngine.createSession(sessionId);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('assertNLToSession', () => {
    it('should successfully assert a natural language statement', async () => {
      const nlText = 'The sky is blue.';
      const result = await mcrEngine.assertNLToSession(sessionId, nlText, {
        useLoops: false,
      });
      expect(result.success).toBe(true);
      expect(result.message).toBe('Facts asserted successfully.');
      expect(result.addedFacts).toEqual(['is_blue(sky).']);
      const session = await mcrEngine.getSession(sessionId);
      expect(session.facts).toContain('is_blue(sky).');
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
  });

  describe('querySessionWithNL', () => {
    it('should successfully query a session with NL', async () => {
      const nlQuestion = 'Is the sky blue?';
      await mcrEngine.assertNLToSession(sessionId, 'The sky is blue.', {
        useLoops: false,
      });
      const result = await mcrEngine.querySessionWithNL(
        sessionId,
        nlQuestion,
        { useLoops: false }
      );
      expect(result.success).toBe(true);
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
          query: '{{prolog}}',
          bindingsVar: 'results',
        },
      ];
      const results = [];
      for await (const result of mcrEngine.executeProgram(sessionId, program)) {
        results.push(result);
      }
      expect(results).toHaveLength(3);
      expect(results[0].op).toBe('status');
      expect(results[1].op).toBe('result');
      expect(results[1].data.prolog).toBe('is_blue(sky).');
    });
  });

  describe('Hybrid Loop', () => {
    it('should converge after one refinement loop', async () => {
      const nlText = 'The sun is hot.';
      mcrEngine.llmProvider.generate = jest.fn()
        .mockResolvedValueOnce({ text: 'is_hot(sun, invalid).' })
        .mockResolvedValueOnce({ text: 'is_hot(sun).' });
      const result = await mcrEngine.assertNLToSession(sessionId, nlText, {
        useLoops: true,
      });
      expect(result.success).toBe(true);
      expect(result.addedFacts).toEqual(['is_hot(sun).']);
      expect(result.loopIterations).toBe(2);
      expect(result.loopConverged).toBe(true);
    });
  });

  describe('Context Graph', () => {
    it('should remain immutable', async () => {
      const session = await mcrEngine.getSession(sessionId);
      const originalContextGraph = session.contextGraph;
      await mcrEngine.assertNLToSession(sessionId, 'The grass is green.');
      const newSession = await mcrEngine.getSession(sessionId);
      expect(newSession.contextGraph).not.toBe(originalContextGraph);
    });
  });

  describe('Evolution Module', () => {
    it('should run the evolution process', async () => {
      mcrEngine.config.evolution.enabled = true;
      const result = await mcrEngine.evolve(sessionId, 'some input');
      expect(result.success).toBe(true);
      expect(result.message).toBe('Evolution process completed.');
    });
  });
});
