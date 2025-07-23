import ExampleBase from '../demo/ExampleBase.js';

class SimpleDemo extends ExampleBase {
	async run() {
		this.dLog.step('Starting simple demo');
		
		// Test NL handling
		this.dLog.info('Test', 'Testing natural language handling');
		const response1 = await this.handleNL('Hello, how are you?');
		this.dLog.mcrResponse('Response 1', response1);
		
		// Test fact assertion
		this.dLog.info('Test', 'Asserting a fact');
		const response2 = await this.assertFact('The sky is blue', 'nl');
		this.dLog.mcrResponse('Response 2', response2);
		
		// Test query
		this.dLog.info('Test', 'Asking a question');
		const response3 = await this.query('What color is the sky?', {});
		this.dLog.mcrResponse('Response 3', response3);
		
		// Test condition
		this.dLog.info('Test', 'Testing a condition');
		await this.assertCondition(
			response3.success,
			'Query was successful',
			'Query failed'
		);
		
		this.dLog.success('Demo completed successfully');
	}
}

module.exports = SimpleDemo;
