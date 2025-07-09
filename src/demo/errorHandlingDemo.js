const ExampleBase = require('./ExampleBase'); // Use the new base class

class ErrorHandlingDemo extends ExampleBase {
  // constructor(sessionId, logCollector) { // No constructor needed if just calling super
  //   super(sessionId, logCollector);
  // }

  getName() {
    return 'Error Handling';
  }

  getDescription() {
    return 'Demonstrates how the system handles various error conditions and invalid inputs.';
  }

  async run() {
    this.dLog.step('Starting Error Handling Demo');

    // --- Test 1: Query without a session ---
    this.dLog.divider();
    this.dLog.step('Test 1: Querying without a session');
    this.dLog.info(
      'Expected outcome',
      'API call should fail, likely with a 404 or 400 error.'
    );
    try {
      const axios = (await import('axios')).default;
      const invalidSessionId = 'invalid-session-id-for-error-demo';
      this.dLog.apiCall(
        'POST',
        `${this.apiBaseUrl}/sessions/${invalidSessionId}/query`,
        { query: 'Test query' }
      );
      await axios.post(
        `${this.apiBaseUrl}/sessions/${invalidSessionId}/query`,
        { query: 'Test query' }
      );
      await this.assertCondition(
        false,
        '',
        'Query attempt with invalid session ID should have failed, but it appeared to succeed.'
      );
    } catch (error) {
      this.handleApiError(error, 'Query with invalid session ID');
      const expectedStatus =
        error.response &&
        (error.response.status === 404 || error.response.status === 400);
      await this.assertCondition(
        expectedStatus,
        `API call failed with status ${error.response ? error.response.status : 'N/A'} as expected.`,
        `API call failed but with an unexpected status ${error.response ? error.response.status : 'N/A'}. Expected 400 or 404.`
      );
    }

    // Create a session for subsequent tests
    // Session is now passed in constructor and available as this.sessionId
    // The initial tests for invalid session ID are done using raw axios.
    // For subsequent tests requiring a valid session, this.sessionId (if provided) will be used.
    if (!this.sessionId) {
      this.dLog.error(
        'Demo cannot continue without a session for further tests.'
      );
      return;
    }

    // --- Test 2: Asserting malformed fact ---
    // This depends on how strictly the backend validates the 'text' field.
    // For this demo, we'll assume it expects a non-empty string.
    this.dLog.divider();
    this.dLog.step('Test 2: Asserting a malformed/empty fact');
    this.dLog.info(
      'Expected outcome',
      'API call should fail or be gracefully handled, possibly with a 400 error or specific message.'
    );
    const malformedFactData = { text: '' }; // Empty fact
    try {
      const axios = (await import('axios')).default;
      this.dLog.apiCall(
        'POST',
        `${this.apiBaseUrl}/sessions/${this.sessionId}/assert`,
        malformedFactData
      );
      const response = await axios.post(
        `${this.apiBaseUrl}/sessions/${this.sessionId}/assert`,
        malformedFactData
      );
      // Check if the server accepted it but indicated an issue in the response body
      if (
        response.status === 200 &&
        response.data &&
        response.data.message &&
        response.data.message.toLowerCase().includes('ignored')
      ) {
        await this.assertCondition(
          true,
          `Server gracefully ignored empty fact: ${response.data.message}`,
          ''
        );
        this.dLog.mcrResponse(
          'Server response to empty fact',
          response.data.message
        );
      } else {
        await this.assertCondition(
          false,
          '',
          `Asserting empty fact did not result in a clear 'ignored' message. Status: ${response.status}, Data: ${JSON.stringify(response.data)}`
        );
      }
    } catch (error) {
      this.handleApiError(error, 'Asserting malformed (empty) fact');
      const expectedStatus = error.response && error.response.status === 400; // Or other relevant error code
      await this.assertCondition(
        expectedStatus,
        `API call for empty fact failed with status ${error.response ? error.response.status : 'N/A'} as expected.`,
        `API call for empty fact failed with an unexpected status ${error.response ? error.response.status : 'N/A'}. Expected 400 or specific handling.`
      );
    }

    // --- Test 3: Querying with malformed query ---
    this.dLog.divider();
    this.dLog.step('Test 3: Querying with malformed/empty query');
    this.dLog.info(
      'Expected outcome',
      'API call should fail or return a message indicating inability to process.'
    );
    const malformedQueryData = { query: '' }; // Empty query
    try {
      const axios = (await import('axios')).default;
      this.dLog.apiCall(
        'POST',
        `${this.apiBaseUrl}/sessions/${this.sessionId}/query`,
        malformedQueryData
      );
      const response = await axios.post(
        `${this.apiBaseUrl}/sessions/${this.sessionId}/query`,
        malformedQueryData
      );
      if (
        response.status === 200 &&
        response.data &&
        response.data.answer &&
        response.data.answer.toLowerCase().includes("don't know")
      ) {
        await this.assertCondition(
          true,
          `Server responded to empty query with "${response.data.answer}" as expected.`,
          ''
        );
        this.dLog.mcrResponse(
          'Server response to empty query',
          response.data.answer
        );
      } else if (
        response.status === 200 &&
        response.data &&
        response.data.error
      ) {
        await this.assertCondition(
          true,
          `Server responded to empty query with an error message: "${response.data.error}"`,
          ''
        );
        this.dLog.mcrResponse(
          'Server error to empty query',
          response.data.error
        );
      } else {
        await this.assertCondition(
          false,
          '',
          `Querying with empty query did not result in a clear "don't know" or error. Status: ${response.status}, Data: ${JSON.stringify(response.data)}`
        );
      }
    } catch (error) {
      this.handleApiError(error, 'Querying with malformed (empty) query');
      const expectedStatus = error.response && error.response.status === 400; // Or other relevant error code
      await this.assertCondition(
        expectedStatus,
        `API call for empty query failed with status ${error.response ? error.response.status : 'N/A'} as expected.`,
        `API call for empty query failed with an unexpected status ${error.response ? error.response.status : 'N/A'}. Expected 400 or specific handling.`
      );
    }

    // --- Test 4: Asserting contradictory facts (Optional - behavior depends on reasoner capabilities) ---
    // This test is highly dependent on the reasoner's ability to detect contradictions.
    // Some systems might allow them, others might flag them.
    this.dLog.divider();
    this.dLog.step('Test 4: Asserting potentially contradictory facts');
    this.dLog.info(
      'Expected outcome',
      'System may accept, reject, or flag the contradiction. Logging this behavior is key.'
    );

    await this.assertFact('The ball is red.');
    const assertResponse = await this.assertFact('The ball is not red.'); // Or 'The ball is blue.'

    if (assertResponse) {
      // This doesn't necessarily mean a contradiction was *handled* in a special way, just that the assertion was processed.
      // We're mostly observing the behavior.
      this.dLog.info(
        'Contradictory fact assertion processed.',
        `Response: ${assertResponse.message}`
      );
      await this.assertCondition(
        true,
        'Potentially contradictory fact processed. System behavior observed.',
        ''
      );

      // Optional: Query to see the effect
      const queryResult = await this.query('What color is the ball?');
      if (queryResult) {
        this.dLog.info(
          'Query result after contradictory assertion',
          queryResult.answer
        );
      }
    } else {
      await this.assertCondition(
        false,
        '',
        'Assertion of potentially contradictory fact failed unexpectedly.'
      );
    }

    this.dLog.success('Error handling scenarios tested.');
    this.dLog.divider();
  }
}

module.exports = ErrorHandlingDemo;
