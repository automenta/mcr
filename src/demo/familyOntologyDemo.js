import ExampleBase from './ExampleBase.js';
import { readFileContentSafe } from './demoUtils.js';

class FamilyOntologyDemo extends ExampleBase {
	getName() {
		return 'Family Ontology';
	}

	getDescription() {
		return 'Demonstrates reasoning with a pre-loaded family ontology (family.pl).';
	}

	async run() {
		this.dLog.step('Starting Family Ontology Demo');

		if (!this.sessionId) {
			this.dLog.error(
				'Demo cannot continue without a session ID provided at instantiation.'
			);
			return;
		}

		this.dLog.divider();
		this.dLog.step('Loading Family Ontology');

		let ontologyContent;
		try {
			const response = await fetch('/ontologies/family.pl');
			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}
			ontologyContent = await response.text();
		} catch (e) {
			this.dLog.error('Could not load family ontology.', e.message);
			return;
		}

		if (!ontologyContent) {
			this.dLog.error(
				`Family ontology file could not be read. Demo cannot proceed with ontology loading.`
			);
			return;
		}

		this.dLog.info(
			'Ontology content snippet (first 200 chars)',
			ontologyContent.substring(0, 200) + '...'
		);

		try {
			const assertResponse = await this.assertFact(ontologyContent, 'prolog');

			if (
				assertResponse &&
				assertResponse.addedFacts &&
				assertResponse.addedFacts.length > 0
			) {
				this.dLog.success(
					`Ontology content asserted successfully. Statements found by server: ${assertResponse.addedFacts.length}`
				);
			} else if (assertResponse && assertResponse.message) {
				this.dLog.info(
					'Ontology assertion processed, but no new facts explicitly reported or message indicates other status.',
					assertResponse.message
				);
				if (
					assertResponse.message.toLowerCase().includes('error') ||
					assertResponse.message.toLowerCase().includes('fail')
				) {
					this.dLog.error(
						'Ontology assertion may have failed based on server message.',
						assertResponse.message
					);
					return;
				}
			} else {
				this.dLog.error(
					'Ontology assertion failed or server response was not as expected.'
				);
				return;
			}
		} catch (error) {
			this.dLog.error(
				'Critical error during family ontology assertion step',
				error.message
			);
			this.dLog.error(
				'Cannot proceed without the ontology loaded for this demo.'
			);
			return;
		}

		this.dLog.divider();
		this.dLog.step('Asserting Additional Facts (Optional)');
		await this.assertFact('Lisa is a student.');
		await this.assertFact('Maggie is a baby.');
		this.dLog.success('Additional facts asserted.');

		this.dLog.divider();
		this.dLog.step('Querying Family Relationships');

		const familyQueries = [
			{ q: "Who is Homer's wife?", expected: 'Marge' },
			{ q: "Who are Bart's parents?", expected: ['Homer', 'Marge'] },
			{ q: 'Is Bart male?', expected: 'yes' },
			{ q: "Who is Bart's grandfather?", expected: 'Abraham' },
			{ q: "Is Lisa Homer's daughter?", expected: 'yes' },
			{ q: "Who are Abraham's children?", expected: ['Homer', 'Herb'] },
			{ q: "Is Mona Abraham's wife?", expected: 'yes' },
			{ q: "What is Lisa's occupation?", expected: 'student' },
		];

		for (const item of familyQueries) {
			const result = await this.query(item.q);
			if (result && typeof result.answer === 'string') {
				let conditionMet = false;
				if (Array.isArray(item.expected)) {
					conditionMet = item.expected.every(exp =>
						result.answer.toLowerCase().includes(exp.toLowerCase())
					);
					await this.assertCondition(
						conditionMet,
						`Query "${item.q}" -> Answer: "${result.answer}" (Expected to include all: [${item.expected.join(', ')}])`,
						`Query "${item.q}" -> Answer: "${result.answer}" (Expected to include all: [${item.expected.join(', ')}], but did not)`
					);
				} else {
					conditionMet = result.answer
						.toLowerCase()
						.includes(item.expected.toLowerCase());
					await this.assertCondition(
						conditionMet,
						`Query "${item.q}" -> Answer: "${result.answer}" (Expected: "${item.expected}")`,
						`Query "${item.q}" -> Answer: "${result.answer}" (Expected: "${item.expected}", but was different)`
					);
				}
			} else {
				await this.assertCondition(
					false,
					'',
					`Query "${item.q}" failed, returned no result, or result.answer was not a string.`
				);
				if (result)
					this.dLog.info('Unexpected result structure for query', {
						query: item.q,
						result,
					});
			}
		}

		this.dLog.success('Family ontology queries completed.');
		this.dLog.divider();
	}
}

export default FamilyOntologyDemo;
