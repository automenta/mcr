class MockPrologReasonerProvider {
  constructor() {
    this.history = [];
  }

  async executeQuery(knowledgeBase, query, options) {
    this.history.push({ knowledgeBase, query, options });
    if (query === 'is_blue(sky)?') {
      return {
        results: [{ X: 'yes' }],
        proof: 'mock proof',
      };
    }
    return { results: [] };
  }

  async validate(knowledgeBase) {
    this.history.push({ knowledgeBase });
    if (knowledgeBase.includes('invalid')) {
      return { isValid: false, error: 'Invalid Prolog' };
    }
    return { isValid: true };
  }
}

module.exports = MockPrologReasonerProvider;
