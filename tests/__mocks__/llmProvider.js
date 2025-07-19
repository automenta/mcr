const MockLLMProvider = jest.fn().mockImplementation(() => {
  return {
    generate: jest.fn().mockImplementation((systemPrompt, userPrompt, options) => {
      if (userPrompt.includes('invalid')) {
        return Promise.resolve({ text: 'invalid_prolog.' });
      }
      if (userPrompt.includes('The sun is hot.')) {
        return Promise.resolve({ text: '{"statementType": "fact", "fact": {"predicate": "is_hot", "arguments": ["sun"]}}' });
      }
      if (userPrompt.includes('Is the sky blue?')) {
        return Promise.resolve({ text: 'Yes, the sky is blue.' });
      }
      if (userPrompt.includes('translate')) {
        return Promise.resolve({ text: '{"statementType": "fact", "fact": {"predicate": "is_blue", "arguments": ["sky"]}}' });
      }
      if (userPrompt.includes('fact(X)')) {
        return Promise.resolve({ text: 'a' });
      }
      if (systemPrompt === 'hypothesize.system') {
        return Promise.resolve({ text: 'fact(a).\nfact(b).' });
      }
      return Promise.resolve({ text: 'default mock response' });
    }),
    history: [],
  };
});

module.exports = MockLLMProvider;
