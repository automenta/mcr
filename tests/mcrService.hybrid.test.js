// tests/mcrService.hybrid.test.js

jest.mock('../src/bridges/embeddingBridge', () => {
  return jest.fn().mockImplementation(() => {
    return {
      embed: jest.fn().mockResolvedValue([0.1, 0.2, 0.3]),
    };
  });
});

jest.mock('../src/bridges/kgBridge', () => {
  return jest.fn().mockImplementation(() => {
    return {
      addTriple: jest.fn(),
      search: jest.fn().mockResolvedValue([]),
    };
  });
});

const mcrService = require('../src/mcrService');
const EmbeddingBridge = require('../src/bridges/embeddingBridge');
const KnowledgeGraph = require('../src/bridges/kgBridge');

describe('MCR Service Hybrid Functionality', () => {
  let sessionId;

  beforeEach(async () => {
    // Reset mocks
    jest.clearAllMocks();

    // Initialize mcrService to set up session store etc.
    await mcrService.initialize();

    // Create a session for each test
    const sessionResponse = await mcrService.createSession();
    sessionId = sessionResponse.sessionId;

    // Mock configuration for hybrid features
    const config = require('../src/config');
    config.kg = { enabled: true };
    config.embeddings = { enabled: true };
  });

  afterEach(async () => {
    if (sessionId) {
      await mcrService.deleteSession(sessionId);
    }
  });

  describe('Hybrid Session Management', () => {
    it('should add embeddings to session on assertion', async () => {
      const nlText = 'Socrates is a man.';
      await mcrService.assertNLToSession(sessionId, nlText);

      const session = await mcrService.getSession(sessionId);
      expect(session.embeddings.size).toBe(1);
      expect(EmbeddingBridge().embed).toHaveBeenCalledWith(expect.any(String));
    });

    it('should add triples to knowledge graph on assertion', async () => {
      const nlText = 'Socrates is a man.';
      await mcrService.assertNLToSession(sessionId, nlText);

      const session = await mcrService.getSession(sessionId);
      expect(KnowledgeGraph().addTriple).toHaveBeenCalledWith('socrates', 'is_a', 'man');
    });
  });

  describe('Refinement Loops', () => {
    it('should use refinement loop for assertions', async () => {
      const nlText = 'This is a test assertion.';
      const initialProlog = 'test_assertion.';
      const refinedProlog = 'refined_assertion.';

      // Mock the initial translation to be inconsistent
      jest.spyOn(mcrService, '_translateNLToProlog').mockResolvedValueOnce({prolog: initialProlog, consistent: false});
      jest.spyOn(mcrService, '_translateNLToProlog').mockResolvedValueOnce({prolog: refinedProlog, consistent: true});

      const result = await mcrService.assertNLToSession(sessionId, nlText, { useLoops: true });

      expect(result.success).toBe(true);
      expect(result.addedFacts).toEqual([refinedProlog]);
      expect(mcrService._translateNLToProlog).toHaveBeenCalledTimes(2);
    });

    it('should use refinement loop for queries', async () => {
        const nlQuestion = 'What is the test?';
        const initialAnswer = 'Initial answer.';
        const refinedAnswer = 'Refined answer.';

        // Mock the initial translation to be inconsistent
        jest.spyOn(mcrService, '_translateLogicToNL').mockResolvedValueOnce({answer: initialAnswer, consistent: false});
        jest.spyOn(mcrService, '_translateLogicToNL').mockResolvedValueOnce({answer: refinedAnswer, consistent: true});

        const result = await mcrService.querySessionWithNL(sessionId, nlQuestion, { useLoops: true });

        expect(result.success).toBe(true);
        expect(result.answer).toBe(refinedAnswer);
        expect(mcrService._translateLogicToNL).toHaveBeenCalledTimes(2);
    });
  });
});
