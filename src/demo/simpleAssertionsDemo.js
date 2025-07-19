import ExampleBase from './ExampleBase.js';

class SimpleAssertionsDemo extends ExampleBase {
	getName() {
		return 'Simple Assertions';
	}

	getDescription() {
		return 'A basic demo asserting simple facts and querying them.';
	}

	async run() {
		this.dLog.step('Starting Simple Assertions Demo');

		if (!this.sessionId) {
			this.dLog.error(
				'Demo cannot continue without a session ID provided at instantiation.'
			);
			return;
		}

		this.dLog.divider();
		this.dLog.step('Asserting Facts');
		const factsToAssert = [
			'The sky is blue.',
			'Socrates is a human.',
			'human(X) :- is_a(X, human).',
			'mortal(X) :- human(X).',
			"John is Mary's father.",
			'Mary is a doctor.',
		];

		for (const fact of factsToAssert) {
			await this.assertFact(fact);
		}
		this.dLog.success('Facts asserted successfully.');

		this.dLog.divider();
		this.dLog.step('Querying Session');
		const questions = [
			{ q: 'What color is the sky?', expected: 'blue' },
			{ q: 'Is Socrates mortal?', expected: 'yes' },
			{ q: "Who is Mary's father?", expected: 'John' },
			{ q: 'Is Mary a doctor?', expected: 'yes' },
			{ q: 'Who is mortal?', expected: 'Socrates' },
		];

		for (const item of questions) {
			const result = await this.query(item.q);
			if (result) {
				const condition = result.answer
					.toLowerCase()
					.includes(item.expected.toLowerCase());
				await this.assertCondition(
					condition,
					`Query for "${item.q}" returned expected information. Answer: "${result.answer}"`,
					`Query for "${item.q}" - Expected to find "${item.expected}", got "${result.answer}"`
				);
			} else {
				await this.assertCondition(
					false,
					'',
					`Query for "${item.q}" failed or returned no result.`
				);
			}
		}
		this.dLog.success('Queries completed.');
		this.dLog.divider();
	}
}

export default SimpleAssertionsDemo;
