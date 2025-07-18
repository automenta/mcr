const MockLLMProvider = jest.fn().mockImplementation(() => {
  return {
    generate: jest.fn().mockImplementation((systemPrompt, userPrompt, options) => {
      if (userPrompt.includes('invalid')) {
        return Promise.resolve({ text: 'invalid_prolog.' });
      }
      if (userPrompt.includes('refine')) {
        return Promise.resolve({ text: 'is_hot(sun).' });
      }
      if (userPrompt.includes('translate')) {
        return Promise.resolve({ text: '{"statementType": "fact", "fact": {"predicate": "is_blue", "arguments": ["sky"]}}' });
      }
      if (userPrompt.includes('query')) {
        return Promise.resolve({ text: 'is_blue(sky)?' });
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
