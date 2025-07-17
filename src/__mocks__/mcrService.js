console.log('mcrService mock loaded');
module.exports = {
	setSessionKnowledgeBase: jest.fn().mockResolvedValue(true),
	assertNLToSession: jest
		.fn()
		.mockResolvedValue({ success: true, addedFacts: ['test_fact.'] }),
	querySessionWithNL: jest
		.fn()
		.mockResolvedValue({ success: true, answer: 'Test answer.' }),
	translateNLToRulesDirect: jest
		.fn()
		.mockResolvedValue({ success: true, rules: ['test_rule.'] }),
	translateRulesToNLDirect: jest
		.fn()
		.mockResolvedValue({ success: true, explanation: 'Test explanation.' }),
	explainQuery: jest
		.fn()
		.mockResolvedValue({ success: true, explanation: 'Test explanation.' }),
	setTranslationStrategy: jest.fn().mockResolvedValue(true),
};
