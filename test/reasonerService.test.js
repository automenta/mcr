const ReasonerService = require('../src/reasonerService');
const pl = require('tau-prolog');
const logger = require('../src/logger');
const ApiError = require('../src/errors');

jest.mock('tau-prolog');
jest.mock('../src/logger');
jest.mock('../src/errors');

describe('ReasonerService', () => {
  // @TODO: Fix failing tests - disabling for now (re-enabling)
  let mockPrologSession;

  beforeEach(() => {
    jest.clearAllMocks();

    ApiError.mockImplementation((status, message) => ({ status, message }));

    mockPrologSession = {
      consult: jest.fn(),
      query: jest.fn(),
      answer: jest.fn(),
      format_answer: jest.fn((answer) => `formatted(${answer})`),
    };
    pl.create.mockReturnValue(mockPrologSession);
    pl.is_substitution = jest.fn((sub) => sub === 'substitution');
  });

  test('should successfully run a query and return formatted answers', async () => {
    const facts = ['fact1.', 'fact2.'];
    const query = 'query(X).';

    mockPrologSession.consult.mockImplementation((kb, callbacks) =>
      callbacks.success()
    );

    mockPrologSession.query.mockImplementation((_q, callbacks) =>
      callbacks.success()
    );

    mockPrologSession.answer
      .mockImplementationOnce((callback) => callback('substitution'))
      .mockImplementationOnce((callback) => callback('substitution'))
      .mockImplementationOnce((callback) =>
        callback({ indicator: 'the_end/0' })
      );

    const result = await ReasonerService.runQuery(facts, query);

    expect(pl.create).toHaveBeenCalled();
    expect(mockPrologSession.consult).toHaveBeenCalledWith(
      facts.join(' '),
      expect.any(Object)
    );
    expect(mockPrologSession.query).toHaveBeenCalledWith(
      query,
      expect.any(Object)
    );
    expect(mockPrologSession.answer).toHaveBeenCalledTimes(3);
    expect(mockPrologSession.format_answer).toHaveBeenCalledWith(
      'substitution',
      { quoted: true }
    );
    expect(result).toEqual([
      'formatted(substitution)',
      'formatted(substitution)',
    ]);
  });

  test('should return an empty array if no solutions are found', async () => {
    const facts = ['fact1.'];
    const query = 'no_solution(X).';

    mockPrologSession.consult.mockImplementation((kb, callbacks) =>
      callbacks.success()
    );
    mockPrologSession.query.mockImplementation((_q, callbacks) =>
      callbacks.success()
    );
    mockPrologSession.answer.mockImplementationOnce((callback) =>
      callback({ indicator: 'the_end/0' })
    );

    const result = await ReasonerService.runQuery(facts, query);

    expect(result).toEqual([]);
    expect(mockPrologSession.answer).toHaveBeenCalledTimes(1);
  });

  test('should reject with ApiError on consult failure', async () => {
    const facts = ['invalid_fact.'];
    const query = 'query(X).';
    const consultError = 'Consultation Error';

    mockPrologSession.consult.mockImplementation((kb, callbacks) =>
      callbacks.error(consultError)
    );

    await expect(ReasonerService.runQuery(facts, query)).rejects.toEqual(
      expect.objectContaining({
        status: 422,
        message: `Prolog knowledge base is invalid: ${consultError}`,
        errorCode: 'PROLOG_CONSULT_FAILED',
      })
    );
    expect(logger.error).toHaveBeenCalledWith(
      'Prolog knowledge base is invalid.', // Updated to match actual log message in reasonerService
      expect.objectContaining({
        details: consultError,
        internalErrorCode: 'PROLOG_CONSULT_ERROR',
      })
    );
    expect(ApiError).toHaveBeenCalledWith(
      422,
      `Prolog knowledge base is invalid: ${consultError}`,
      'PROLOG_CONSULT_FAILED'
    );
  });

  test('should reject with ApiError on query failure', async () => {
    const facts = ['fact1.'];
    const query = 'invalid_query(X).';
    const queryError = 'Query Error';

    mockPrologSession.consult.mockImplementation((kb, callbacks) =>
      callbacks.success()
    );
    mockPrologSession.query.mockImplementation((_q, callbacks) =>
      callbacks.error(queryError)
    );

    await expect(ReasonerService.runQuery(facts, query)).rejects.toEqual(
      expect.objectContaining({
        status: 422,
        message: `Prolog query failed: ${queryError}`,
        errorCode: 'PROLOG_QUERY_FAILED',
      })
    );
    expect(logger.error).toHaveBeenCalledWith(
      'Prolog query failed.', // Updated to match actual log message
      expect.objectContaining({
        query,
        details: queryError,
        internalErrorCode: 'PROLOG_QUERY_ERROR',
      })
    );
    expect(ApiError).toHaveBeenCalledWith(
      422,
      `Prolog query failed: ${queryError}`,
      'PROLOG_QUERY_FAILED'
    );
  });

  test('should reject with ApiError on error during answer processing', async () => {
    const facts = ['fact1.'];
    const query = 'query(X).';

    mockPrologSession.consult.mockImplementation((kb, callbacks) =>
      callbacks.success()
    );
    mockPrologSession.query.mockImplementation((_q, callbacks) =>
      callbacks.success()
    );
    mockPrologSession.answer.mockImplementationOnce((callback) => {
      callback('substitution');
      throw new Error('Answer processing error');
    });

    await expect(ReasonerService.runQuery(facts, query)).rejects.toEqual(
      expect.objectContaining({
        status: 500,
        message: 'Prolog answer processing error: Answer processing error',
        errorCode: 'PROLOG_ANSWER_ERROR',
      })
    );
    expect(logger.error).toHaveBeenCalledWith(
      'Error processing Prolog answer.', // Updated to match actual log message
      expect.objectContaining({
        internalErrorCode: 'PROLOG_ANSWER_PROCESSING_ERROR',
        originalError: 'Answer processing error',
      })
    );
    expect(ApiError).toHaveBeenCalledWith(
      500,
      'Prolog answer processing error: Answer processing error',
      'PROLOG_ANSWER_ERROR'
    );
  });

  test('should reject with ApiError on error during Prolog answer initiation', async () => {
    const facts = ['fact1.'];
    const query = 'query(X).';

    mockPrologSession.consult.mockImplementation((kb, callbacks) =>
      callbacks.success()
    );
    mockPrologSession.query.mockImplementation(
      (
        _q,
        callbacks // Make query itself succeed
      ) => callbacks.success()
    );
    // First call to prologSession.answer (inside the query success callback) will throw
    mockPrologSession.answer.mockImplementationOnce(() => {
      throw new Error('Answer initiation error');
    });

    await expect(ReasonerService.runQuery(facts, query)).rejects.toEqual(
      expect.objectContaining({
        status: 500,
        message: 'Prolog answer initiation error: Answer initiation error',
        errorCode: 'PROLOG_ANSWER_INIT_ERROR',
      })
    );
    expect(logger.error).toHaveBeenCalledWith(
      'Error initiating Prolog answer callback.', // Updated to match actual log message
      expect.objectContaining({
        internalErrorCode: 'PROLOG_ANSWER_INIT_ERROR',
        originalError: 'Answer initiation error',
      })
    );
    expect(ApiError).toHaveBeenCalledWith(
      500,
      'Prolog answer initiation error: Answer initiation error',
      'PROLOG_ANSWER_INIT_ERROR'
    );
  });

  test('should reject with ApiError on general Prolog session setup error', async () => {
    const facts = ['fact1.'];
    const query = 'query(X).';

    pl.create.mockImplementation(() => {
      throw new Error('Session setup error');
    });

    await expect(ReasonerService.runQuery(facts, query)).rejects.toEqual(
      expect.objectContaining({
        status: 500,
        message: 'Prolog session error: Session setup error',
        errorCode: 'PROLOG_SESSION_ERROR',
      })
    );
    expect(logger.error).toHaveBeenCalledWith(
      'Error during Prolog session setup.', // Updated to match actual log message
      expect.objectContaining({
        internalErrorCode: 'PROLOG_SESSION_SETUP_ERROR',
        originalError: 'Session setup error',
        factsCount: facts.length,
        query,
      })
    );
    expect(ApiError).toHaveBeenCalledWith(
      500,
      'Prolog session error: Session setup error',
      'PROLOG_SESSION_ERROR'
    );
  });
});
