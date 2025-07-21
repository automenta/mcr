class MockPrologReasonerProvider {
	constructor() {
		this.executeQuery = jest
			.fn()
			.mockImplementation((knowledgeBase, query) => {
				if (query === 'is_blue(sky).') {
					return Promise.resolve({
						results: [{ X: 'yes' }],
						proof: 'mock proof',
					});
				}
				if (query === 'fact(X).') {
					const facts = knowledgeBase
						.split('.')
						.filter(f => f.trim().startsWith('fact('));
					const results = facts.map(f => {
						const match = f.match(/fact\((.*)\)/);
						return { X: match[1] };
					});
					return Promise.resolve({ results, proof: 'mock proof' });
				}
				return Promise.resolve({ results: [] });
			});
		this.validate = jest.fn().mockImplementation(knowledgeBase => {
			if (typeof knowledgeBase !== 'string') {
				return Promise.resolve({ isValid: true });
			}
			if (knowledgeBase.includes('invalid')) {
				return Promise.resolve({ isValid: false, error: 'Invalid Prolog' });
			}
			return Promise.resolve({ isValid: true });
		});
		this.history = [];
	}
}

module.exports = MockPrologReasonerProvider;
