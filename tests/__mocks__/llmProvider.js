const MockLLMProvider = jest.fn().mockImplementation(() => {
	return {
		generate: jest
			.fn()
			.mockImplementation((systemPrompt, userPrompt, options) => {
				if (userPrompt.includes('invalid')) {
					return Promise.resolve({ text: 'invalid_prolog.' });
				}
				if (userPrompt.includes('The sun is hot.')) {
					return Promise.resolve({
						text: '{"statementType": "fact", "fact": {"predicate": "is_hot", "arguments": ["sun"]}}',
					});
				}
				if (userPrompt.includes('Is the sky blue?')) {
					return Promise.resolve({ text: 'Yes, the sky is blue.' });
				}
				if (userPrompt.includes('translate')) {
					return Promise.resolve({
						text: '{"statementType": "fact", "fact": {"predicate": "is_blue", "arguments": ["sky"]}}',
					});
				}
				if (systemPrompt.startsWith('You are an expert AI assistant that translates natural language questions into Prolog queries.') && userPrompt.includes('Question: "What facts are there?"')) {
					return Promise.resolve({ text: 'fact(X).' });
				}
				if (systemPrompt === 'hypothesize.system') {
					return Promise.resolve({ text: 'fact(a).\nfact(b).' });
				}
				if (systemPrompt.startsWith('You are an expert AI assistant that explains Prolog query results in concise, natural language.') && userPrompt.includes('Prolog Query Results:')) {
					return Promise.resolve({ text: 'The known facts are fact(a) and fact(b).' });
				}
				return Promise.resolve({ text: 'default mock response' });
			}),
		history: [],
	};
});

module.exports = MockLLMProvider;