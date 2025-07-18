class MockLLMProvider {
  constructor() {
    this.history = [];
  }

  async generate(systemPrompt, userPrompt, options) {
    this.history.push({ systemPrompt, userPrompt, options });
    if (userPrompt.includes('invalid')) {
      return { text: 'invalid_prolog.' };
    }
    if (userPrompt.includes('refine')) {
      return { text: 'is_hot(sun).' };
    }
    if (userPrompt.includes('translate')) {
      return { text: 'is_blue(sky).' };
    }
    if (userPrompt.includes('query')) {
      return { text: 'is_blue(sky)?' };
    }
    return { text: 'default mock response' };
  }
}

module.exports = MockLLMProvider;
