// tests/mcrService.test.js

const mcrService = require('../src/mcrService');
const llmService = require('../src/llmService');
const reasonerService = require('../src/reasonerService');
const sessionStore = require('../src/store/InMemorySessionStore');
const ontologyService = require('../src/ontologyService');
const strategyManager = require('../src/strategyManager');
const { MCRError, ErrorCodes } = require('../src/errors');

jest.mock('../src/llmService');
jest.mock('../src/reasonerService');
jest.mock('../src/store/InMemorySessionStore');
jest.mock('../src/ontologyService');
jest.mock('../src/strategyManager');

describe('MCR Service (mcrService.js)', () => {
  let sessionId;
  let mockSessionStoreInstance;

  beforeEach(() => {
    sessionId = 'test-session-id';
    mockSessionStoreInstance = new sessionStore();
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
      execute: jest.fn().mockResolvedValue([]),
    }));
    strategyManager.getOperationalStrategyJson.mockResolvedValue({
        id: 'mock-strategy',
        name: 'Mock Strategy',
        execute: jest.fn().mockResolvedValue([]),
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('assertNLToSession', () => {
    it('should successfully assert a natural language statement using SIR-R1-Assert strategy', async () => {
        const nlText = 'The sky is blue.';
        const prologFact = 'is_blue(sky).';
        strategyManager.getStrategy.mockReturnValue({
            id: 'SIR-R1-Assert',
            name: 'SIR-R1 Assert',
            execute: jest.fn().mockResolvedValue([prologFact]),
        });

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
        strategyManager.getStrategy.mockReturnValue({
            id: 'test-strategy',
            name: 'Test Strategy',
            execute: jest.fn().mockResolvedValue([]),
        });
        const result = await mcrService.assertNLToSession(sessionId, 'some text', { useLoops: false });
        expect(result.success).toBe(true);
        expect(result.message).toBe('No facts were extracted from the input.');
        expect(result.error).toBe(ErrorCodes.NO_FACTS_EXTRACTED);
    });

    it('should return SESSION_ADD_FACTS_FAILED if sessionStore.addFacts returns false', async () => {
        const nlText = 'The sky is blue.';
        const prologFact = 'is_blue(sky).';
        strategyManager.getStrategy.mockReturnValue({
            id: 'SIR-R1-Assert',
            name: 'SIR-R1 Assert',
            execute: jest.fn().mockResolvedValue([prologFact]),
        });
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
        strategyManager.getStrategy.mockReturnValue({
            id: 'SIR-R1-Query',
            name: 'SIR-R1 Query',
            execute: jest.fn().mockResolvedValue(prologQuery),
        });
        reasonerService.guidedDeduce.mockResolvedValue([{ proof: { answer: 'yes' }, probability: 1 }]);
        llmService.generate.mockResolvedValue({text: nlAnswer});
        const result = await mcrService.querySessionWithNL(sessionId, nlQuestion, { useLoops: false });
        expect(result.success).toBe(true);
        expect(result.answer).toBe(nlAnswer);
    });
  });
});
