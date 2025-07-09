const ExampleBase = require('./ExampleBase');
// demoUtils are not directly used by the class methods anymore, ExampleBase handles logging

class SimpleQADemo extends ExampleBase {
  getName() {
    return 'Simple Question Answering';
  }

  getDescription() {
    return 'Demonstrates basic session creation (implicitly), fact assertion, and querying.';
  }

  async run() {
    this.dLog.step('Starting Simple Question Answering Demo');
    // Session is already created and sessionId is available as this.sessionId

    this.dLog.divider();
    this.dLog.step('Asserting facts into the session');
    const fact1_nl = 'The sky is blue.';
    const fact2_nl = 'Grass is green.';

    this.dLog.nl('Asserting Fact 1 (NL)', fact1_nl);
    let assertResult = await this.assertFact(fact1_nl); // Uses ExampleBase.assertFact
    if (!assertResult.success) {
      this.dLog.error('Failed to assert Fact 1', assertResult.message || assertResult.error);
      // Optionally, throw or return to stop the demo
      return;
    }
    // Logging of added facts and fact count is handled by ExampleBase.assertFact and dLog customization

    this.dLog.nl('Asserting Fact 2 (NL)', fact2_nl);
    assertResult = await this.assertFact(fact2_nl);
    if (!assertResult.success) {
      this.dLog.error('Failed to assert Fact 2', assertResult.message || assertResult.error);
      return;
    }
    this.dLog.success('Facts asserted successfully!');

    this.dLog.divider();
    this.dLog.step('Querying: "What color is the sky?"');
    const query1_nl = 'What color is the sky?';
    this.dLog.nl('Query (NL)', query1_nl);
    const query1_response = await this.query(query1_nl, { debug: true }); // Uses ExampleBase.query
    if (!query1_response.success) {
      this.dLog.error('Query 1 failed', query1_response.message || query1_response.error);
      return;
    }
    // Logging of prolog query, results, and answer is handled by ExampleBase.query and dLog
    if (query1_response.debugInfo) {
      this.dLog.info('Debug Info for Query 1', query1_response.debugInfo);
    }
    this.dLog.success('Query 1 processed!');

    this.dLog.divider();
    this.dLog.step('Querying: "Is grass green?"');
    const query2_nl = 'Is grass green?';
    this.dLog.nl('Query (NL)', query2_nl);
    const query2_response = await this.query(query2_nl); // No debug option
    if (!query2_response.success) {
      this.dLog.error('Query 2 failed', query2_response.message || query2_response.error);
      return;
    }
    if (query2_response.debugInfo) { // Should not have debug if not requested, but check anyway
        this.dLog.info('Debug Info for Query 2', query2_response.debugInfo);
    }
    this.dLog.success('Query 2 processed!');

    // Session cleanup is handled by the caller of the demo run, not within the demo itself.
    this.dLog.step('Simple Q&A Demo Finished');
    this.dLog.divider();
  }
}

module.exports = SimpleQADemo;
