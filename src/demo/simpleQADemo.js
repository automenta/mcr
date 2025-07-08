const mcrService = require('../mcrService'); // New MCR Service
const { demoLogger, delay } = require('./demoUtils');
// const { ApiError } = require('../errors'); // If needed for specific error handling

async function runSimpleQADemoAsync() {
  demoLogger.heading('Simple Question & Answering Demo');
  demoLogger.info(
    'Goal',
    'Demonstrate basic session creation, fact assertion, and querying using mcrService.'
  );
  let sessionId;

  try {
    // LLM Provider Info is logged by the calling command (demoCommands.js)

    // 1. Create Session
    demoLogger.step('1. Creating a new reasoning session');
    // mcrService.createSession is synchronous and returns the session object
    const sessionData = mcrService.createSession();
    sessionId = sessionData.sessionId;
    demoLogger.success(`Session created successfully!`);
    demoLogger.info('Session ID', sessionId);
    demoLogger.info('Initial Session State', sessionData);
    await delay(500);

    // 2. Assert Facts
    demoLogger.step('2. Asserting facts into the session');
    const fact1_nl = 'The sky is blue.';
    const fact2_nl = 'Grass is green.';

    demoLogger.nl('Fact 1 (NL)', fact1_nl);
    // mcrService.assertNLToSession is async
    let assertResult = await mcrService.assertNLToSession(sessionId, fact1_nl);
    if (!assertResult.success) {
      demoLogger.error(
        'Failed to assert Fact 1',
        assertResult.message || assertResult.error
      );
      throw new Error(
        assertResult.message || assertResult.error || 'Assertion failed'
      );
    }
    demoLogger.logic('Added Facts (Prolog)', assertResult.addedFacts);
    // To get total facts, we'd call getSession
    let currentSessionState = mcrService.getSession(sessionId);
    demoLogger.info('Total Facts in Session', currentSessionState.factCount);

    await delay(500);
    demoLogger.nl('Fact 2 (NL)', fact2_nl);
    assertResult = await mcrService.assertNLToSession(sessionId, fact2_nl);
    if (!assertResult.success) {
      demoLogger.error(
        'Failed to assert Fact 2',
        assertResult.message || assertResult.error
      );
      throw new Error(
        assertResult.message || assertResult.error || 'Assertion failed'
      );
    }
    demoLogger.logic('Added Facts (Prolog)', assertResult.addedFacts);
    currentSessionState = mcrService.getSession(sessionId);
    demoLogger.info('Total Facts in Session', currentSessionState.factCount);
    demoLogger.success('Facts asserted successfully!');
    await delay(500);

    // 3. Query 1
    demoLogger.step('3. Querying: "What color is the sky?"');
    const query1_nl = 'What color is the sky?';
    demoLogger.nl('Query (NL)', query1_nl);
    // mcrService.querySessionWithNL is async
    const query1_response = await mcrService.querySessionWithNL(
      sessionId,
      query1_nl,
      { debug: true }
    );
    if (!query1_response.success) {
      demoLogger.error(
        'Query 1 failed',
        query1_response.message || query1_response.error
      );
      throw new Error(
        query1_response.message || query1_response.error || 'Query 1 failed'
      );
    }
    demoLogger.logic(
      'Generated Prolog Query',
      query1_response.debugInfo?.prologQuery
    );
    demoLogger.logic(
      'Reasoner Result (Simplified)',
      query1_response.debugInfo?.prologResults
    ); // This was simpleResult before
    demoLogger.mcrResponse('MCR Answer (NL)', query1_response.answer);
    // zeroShotLmAnswer is not part of mcrService.querySessionWithNL response, remove for now
    // demoLogger.mcrResponse('Zero-shot LLM Answer (for comparison)', query1_response.zeroShotLmAnswer);
    if (query1_response.debugInfo)
      demoLogger.info('Debug Info', query1_response.debugInfo);
    demoLogger.success('Query 1 processed!');
    await delay(500);

    // 4. Query 2
    demoLogger.step('4. Querying: "Is grass green?"');
    const query2_nl = 'Is grass green?';
    demoLogger.nl('Query (NL)', query2_nl);
    const query2_response = await mcrService.querySessionWithNL(
      sessionId,
      query2_nl
    ); // No debug option
    if (!query2_response.success) {
      demoLogger.error(
        'Query 2 failed',
        query2_response.message || query2_response.error
      );
      throw new Error(
        query2_response.message || query2_response.error || 'Query 2 failed'
      );
    }
    demoLogger.logic(
      'Generated Prolog Query',
      query2_response.debugInfo?.prologQuery
    );
    demoLogger.logic(
      'Reasoner Result (Simplified)',
      query2_response.debugInfo?.prologResults
    );
    demoLogger.mcrResponse('MCR Answer (NL)', query2_response.answer);
    demoLogger.success('Query 2 processed!');
  } catch (err) {
    // err.response might not exist if error is not from an HTTP client (axios)
    const errorDetails = err.message || 'Unknown error during demo.';
    demoLogger.error('Simple Q&A Demo failed prematurely.', errorDetails);
    if (
      err.stack &&
      !err.message?.includes('Assertion failed') &&
      !err.message?.includes('Query')
    ) {
      // Avoid double printing stack for known errors
      console.error(err.stack);
    }
  } finally {
    if (sessionId) {
      demoLogger.divider();
      demoLogger.step('Cleaning up: Deleting session');
      try {
        // mcrService.deleteSession is synchronous
        const deleteResponse = mcrService.deleteSession(sessionId);
        demoLogger.cleanup(
          deleteResponse.message || `Session ${sessionId} deleted.`
        );
      } catch (cleanupError) {
        demoLogger.error(
          `Failed to delete session ${sessionId}`,
          cleanupError.message
        );
        if (cleanupError.stack) console.error(cleanupError.stack);
      }
    }
    demoLogger.heading('Simple Q&A Demo Finished');
  }
}

module.exports = { runSimpleQADemoAsync };
