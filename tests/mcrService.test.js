// tests/mcrService.test.js

jest.mock('../src/store/InMemorySessionStore', () => {
  return jest.fn().mockImplementation(() => {
    return {
      initialize: jest.fn().mockResolvedValue(undefined),
      createSession: jest.fn(),
      getSession: jest.fn(),
      addFacts: jest.fn(),
      getKnowledgeBase: jest.fn(),
      getLexiconSummary: jest.fn(),
      deleteSession: jest.fn(),
    };
  });
});
jest.mock('../src/llmService');
jest.mock('../src/reasonerService');
jest.mock('../src/ontologyService');
jest.mock('../src/strategyManager');

const mcrService = require('../src/mcrService');
const llmService = require('../src/llmService');
const reasonerService = require('../src/reasonerService');
const InMemorySessionStore = require('../src/store/InMemorySessionStore');
const ontologyService = require('../src/ontologyService');
const strategyManager = require('../src/strategyManager');
const { MCRError, ErrorCodes } = require('../src/errors');

describe('MCR Service (mcrService.js)', () => {
  let sessionId;
  let mockSessionStoreInstance;

  beforeEach(() => {
    sessionId = 'test-session-id';
    mockSessionStoreInstance = new InMemorySessionStore();
    mcrService.sessionStore = mockSessionStoreInstance;

    llmService.generate.mockResolvedValue({ text: 'mock llm response' });
    reasonerService.executeQuery.mockResolvedValue({ results: [] });
    reasonerService.validateKnowledgeBase.mockResolvedValue({ isValid: true });
    mockSessionStoreInstance.getSession.mockResolvedValue({ id: sessionId, facts: [] });
    mockSessionStoreInstance.getKnowledgeBase.mockResolvedValue('');
    mockSessionStoreInstance.getLexiconSummary.mockResolvedValue('mock lexicon');
    mockSessionStoreInstance.addFacts.mockResolvedValue(true);
    ontologyService.getGlobalOntologyRulesAsString.mockResolvedValue('mock ontology rules');
    strategyManager.getStrategy.mockImplementation((id) => ({
      id,
      name: `Mock Strategy ${id}`,
      nodes: [],
      edges: [],
    }));
    strategyManager.getOperationalStrategyJson.mockResolvedValue({
        id: 'mock-strategy',
        name: 'Mock Strategy',
        nodes: [],
        edges: [],
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('assertNLToSession', () => {
    it('should successfully assert a natural language statement using SIR-R1-Assert strategy', async () => {
        const nlText = 'The sky is blue.';
        const prologFact = 'is_blue(sky).';
        const StrategyExecutor = require('../src/strategyExecutor');
        jest.spyOn(StrategyExecutor.prototype, 'execute').mockResolvedValue([prologFact]);

        const result = await mcrService.assertNLToSession(sessionId, nlText, { useLoops: false });
        expect(result.success).toBe(true);
        expect(result.message).toBe('Facts asserted successfully.');
        expect(result.addedFacts).toEqual([prologFact]);
    });

    it('should return session not found if sessionStore.getSession returns null', async () => {
        mockSessionStoreInstance.getSession.mockResolvedValue(null);
        const result = await mcrService.assertNLToSession(sessionId, 'Some text');
        expect(result.success).toBe(false);
        expect(result.message).toBe('Session not found.');
        expect(result.error).toBe('SESSION_NOT_FOUND');
    });

    it('should return NO_FACTS_EXTRACTED if strategy returns an empty array', async () => {
        const StrategyExecutor = require('../src/strategyExecutor');
        jest.spyOn(StrategyExecutor.prototype, 'execute').mockResolvedValue([]);

        const result = await mcrService.assertNLToSession(sessionId, 'some text', { useLoops: false });
        expect(result.success).toBe(true);
        expect(result.message).toBe('No facts were extracted from the input.');
        expect(result.error).toBe(ErrorCodes.NO_FACTS_EXTRACTED);
    });

    it('should return SESSION_ADD_FACTS_FAILED if sessionStore.addFacts returns false', async () => {
        const nlText = 'The sky is blue.';
        const prologFact = 'is_blue(sky).';
        const StrategyExecutor = require('../src/strategyExecutor');
        jest.spyOn(StrategyExecutor.prototype, 'execute').mockResolvedValue([prologFact]);
        mockSessionStoreInstance.addFacts.mockResolvedValue(false);
        const result = await mcrService.assertNLToSession(sessionId, nlText, { useLoops: false });
        expect(result.success).toBe(false);
        expect(result.message).toBe(
            'Error during assertion: Failed to add facts to session store after validation.'
        );
    });
  });

  describe('querySessionWithNL', () => {
    it('should successfully query a session with NL using SIR-R1-Query strategy', async () => {
        const nlQuestion = 'Is the sky blue?';
        const prologQuery = 'is_blue(sky).';
        const nlAnswer = 'The sky is blue.';
        const StrategyExecutor = require('../src/strategyExecutor');
        jest.spyOn(StrategyExecutor.prototype, 'execute').mockResolvedValue(prologQuery);
        reasonerService.guidedDeduce.mockResolvedValue([{ proof: { answer: 'yes' }, probability: 1 }]);
        llmService.generate.mockResolvedValue({text: nlAnswer});
        const result = await mcrService.querySessionWithNL(sessionId, nlQuestion, { useLoops: false });
        expect(result.success).toBe(true);
        expect(result.answer).toBe(nlAnswer);
    });
  });

  describe('Hybrid Session', () => {
    it('should set embeddings when asserting a fact', async () => {
        const nlText = 'The grass is green.';
        const prologFact = 'is_green(grass).';
        const embedding = [0.1, 0.2, 0.3];

        const StrategyExecutor = require('../src/strategyExecutor');
        jest.spyOn(StrategyExecutor.prototype, 'execute').mockResolvedValue([prologFact]);

        const mcr = require('../src/mcrService');
        mcr.embeddingBridge = {
            encode: jest.fn().mockResolvedValue(embedding),
        };
        const session = {
            id: sessionId,
            facts: [],
            embeddings: new Map(),
            kbGraph: null,
        };
        mockSessionStoreInstance.getSession.mockResolvedValue(session);

        await mcrService.assertNLToSession(sessionId, nlText, { useLoops: false });

        expect(session.embeddings.get(prologFact)).toEqual(embedding);
    });
  });

  describe('Refinement Loops', () => {
    it('should converge after one refinement loop', async () => {
        const nlText = 'The sun is hot.';
        const wrongProlog = 'is_hot(moon).';
        const correctProlog = 'is_hot(sun).';

        const StrategyExecutor = require('../src/strategyExecutor');
        const executeMock = jest.spyOn(StrategyExecutor.prototype, 'execute')
            .mockResolvedValueOnce([wrongProlog])
            .mockResolvedValueOnce([correctProlog]);

        reasonerService.validateKnowledgeBase
            .mockResolvedValueOnce({ isValid: false, error: 'Incorrect subject' })
            .mockResolvedValueOnce({ isValid: true });

        llmService.generate.mockResolvedValue({text: 'is_hot(sun).'});

        const result = await mcrService.assertNLToSession(sessionId, nlText, { useLoops: true });

        expect(result.success).toBe(true);
        expect(result.addedFacts).toEqual([correctProlog]);
        expect(result.loopIterations).toBe(2);
        expect(result.loopConverged).toBe(true);

        executeMock.mockRestore();
    });
  });
});
