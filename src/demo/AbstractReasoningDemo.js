import ExampleBase from './ExampleBase.js'; // Use the new base class

class AbstractReasoningDemo extends ExampleBase {
	// constructor(sessionId, logCollector) { // No constructor needed if just calling super
	//   super(sessionId, logCollector);
	// }

	getName() {
		return 'Abstract Reasoning';
	}

	getDescription() {
		return 'Demonstrates reasoning with fictional entities and rules that an LLM would not know, highlighting KB-driven answers.';
	}

	async run() {
		this.dLog.step('Starting Abstract Reasoning Demo');

		if (!this.sessionId) {
			this.dLog.error('Demo cannot continue without a session.');
			return;
		}

		this.dLog.divider();
		this.dLog.step('Asserting Fictional Facts and Rules');
		const factsAndRules = [
			// Using direct Prolog for clarity and to bypass NL translation issues for these specific structures
			{ fact: 'is_a(glorb, creature).', type: 'prolog' },
			{ fact: 'has_property(glorb, slimy).', type: 'prolog' },
			{ fact: 'is_a(flumph, glorb).', type: 'prolog' }, // Flumphs are a type of glorb
			{ fact: 'action(glorb, quibbles).', type: 'prolog' },
			{ fact: 'related_to(zorp, glorb).', type: 'prolog' },
			{ fact: 'says(floopy, "ni").', type: 'prolog' },
			// A rule
			{
				fact: 'can_fly(X) :- has_property(X, winged), is_a(X, creature).',
				type: 'prolog',
			},
			{ fact: 'has_property(griffon, winged).', type: 'prolog' },
			{ fact: 'is_a(griffon, creature).', type: 'prolog' },
		];

		for (const item of factsAndRules) {
			await this.assertFact(item.fact, item.type);
		}
		this.dLog.success('Fictional facts and rules asserted.');

		this.dLog.divider();
		this.dLog.step('Querying Abstract Knowledge Base');
		const queries = [
			{ q: 'Is a glorb a creature?', expected: 'yes' },
			{ q: 'What property does a glorb have?', expected: 'slimy' },
			{ q: 'Is a flumph a glorb?', expected: 'yes' },
			{ q: 'What action do glorbs perform?', expected: 'quibbles' },
			{ q: 'What is zorp related to?', expected: 'glorb' },
			{ q: 'Can a glorb fly?', expected: 'no' }, // No "winged" property asserted for glorb
			{ q: 'Can a griffon fly?', expected: 'yes' },
			{ q: 'What does a floopy say?', expected: 'ni' },
			{ q: 'Does a flumph quibble?', expected: 'yes' }, // This requires a rule: action(X, Y) :- is_a(X,Z), action(Z,Y).
			// For now, let's test without it and expect 'no' or 'I don't know'
			// then add the rule.
		];

		// Query for "Does a flumph quibble?" - expecting no, then add rule and expect yes.
		let flumphQuibbleQuery = queries.pop();

		for (const item of queries) {
			const result = await this.query(item.q);
			if (result && typeof result.answer === 'string') {
				const condition = result.answer
					.toLowerCase()
					.includes(item.expected.toLowerCase());
				await this.assertCondition(
					condition,
					`Query for "${item.q}" returned expected: "${item.expected}". Answer: "${result.answer}"`,
					`Query for "${item.q}" - Expected "${item.expected}", got "${result.answer}"`
				);
			} else {
				await this.assertCondition(
					false,
					'',
					`Query for "${item.q}" failed or returned no result (or not a string). Expected: "${item.expected}"`
				);
			}
		}

		// Test "Does a flumph quibble?" - Phase 1 (expecting no/unknown)
		this.dLog.info(
			'Testing query "Does a flumph quibble?" before adding inheritance rule...'
		);
		let result = await this.query(flumphQuibbleQuery.q);
		let expectedBeforeRule = 'no'; // Or "I don't know" - depends on LLM's fallback
		if (result && typeof result.answer === 'string') {
			const condition =
				result.answer.toLowerCase().includes(expectedBeforeRule) ||
				result.answer.toLowerCase().includes("don't know");
			await this.assertCondition(
				condition,
				`Query for "${flumphQuibbleQuery.q}" (before rule) correctly returned something like "${expectedBeforeRule}". Answer: "${result.answer}"`,
				`Query for "${flumphQuibbleQuery.q}" (before rule) - Expected "${expectedBeforeRule}", got "${result.answer}"`
			);
		} else {
			await this.assertCondition(
				false,
				'',
				`Query for "${flumphQuibbleQuery.q}" (before rule) failed or returned no result.`
			);
		}

		// Add the inheritance rule for actions
		this.dLog.step(
			'Asserting action inheritance rule: action(X,Y) :- is_a(X,Z), action(Z,Y).'
		);
		await this.assertFact(
			'action(X,Action) :- is_a(X,SuperType), action(SuperType,Action).',
			'prolog'
		);

		// Test "Does a flumph quibble?" - Phase 2 (expecting yes)
		this.dLog.info(
			'Testing query "Does a flumph quibble?" after adding inheritance rule...'
		);
		flumphQuibbleQuery.expected = 'yes'; // Now we expect yes
		result = await this.query(flumphQuibbleQuery.q);
		if (result && typeof result.answer === 'string') {
			const condition = result.answer
				.toLowerCase()
				.includes(flumphQuibbleQuery.expected.toLowerCase());
			await this.assertCondition(
				condition,
				`Query for "${flumphQuibbleQuery.q}" (after rule) returned expected: "${flumphQuibbleQuery.expected}". Answer: "${result.answer}"`,
				`Query for "${flumphQuibbleQuery.q}" (after rule) - Expected "${flumphQuibbleQuery.expected}", got "${result.answer}"`
			);
		} else {
			await this.assertCondition(
				false,
				'',
				`Query for "${flumphQuibbleQuery.q}" (after rule) failed or returned no result.`
			);
		}

		this.dLog.success('Abstract KB queries completed.');
		this.dLog.divider();
	}
}

export default AbstractReasoningDemo;
