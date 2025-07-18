const MockPrologReasonerProvider = jest.fn().mockImplementation(() => {
  return {
    executeQuery: jest.fn().mockImplementation((knowledgeBase, query, options) => {
      if (query === 'is_blue(sky)?') {
        return Promise.resolve({
          results: [{ X: 'yes' }],
          proof: 'mock proof',
        });
      }
      if (query === 'fact(a).') {
        return Promise.resolve({
          results: [{ X: 'a' }],
          proof: 'mock proof',
        });
      }
      return Promise.resolve({ results: [] });
    }),
    validate: jest.fn().mockImplementation((knowledgeBase) => {
      if (knowledgeBase.includes('invalid')) {
        return Promise.resolve({ isValid: false, error: 'Invalid Prolog' });
      }
      return Promise.resolve({ isValid: true });
    }),
    history: [],
  };
});

module.exports = MockPrologReasonerProvider;
