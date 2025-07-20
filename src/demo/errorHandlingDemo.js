import ExampleBase from './ExampleBase.js';

class ErrorHandlingDemo extends ExampleBase {
	getName() {
		return 'Error Handling';
	}

	getDescription() {
		return 'Demonstrates how the system handles various error conditions and invalid inputs.';
	}

	async run() {
		this.dLog.step('Starting Error Handling Demo');

		// --- Test 1: Query without a session ---
		this.dLog.divider();
		this.dLog.step('Test 1: Querying without a session');
		this.dLog.info(
			'Expected outcome',
			'API call should fail, likely with a 404 or 400 error.'
		);
		try {
			await this.webSocketManager.invoke('query', {
				sessionId: 'invalid-session-id',
				naturalLanguageText: 'Test query',
			});
			await this.assertCondition(
				false,
				'',
				'Query attempt with invalid session ID should have failed, but it appeared to succeed.'
			);
		} catch (error) {
			this.dLog.error(
				'Query with invalid session ID failed as expected.',
				error.message
			);
			await this.assertCondition(
				true,
				`API call failed as expected.`,
				`API call failed but with an unexpected error.`
			);
		}

		if (!this.sessionId) {
			this.dLog.error(
				'Demo cannot continue without a session for further tests.'
			);
			return;
		}

		// --- Test 2: Asserting malformed fact ---
		this.dLog.divider();
		this.dLog.step('Test 2: Asserting a malformed/empty fact');
		this.dLog.info(
			'Expected outcome',
			'API call should fail or be gracefully handled, possibly with a 400 error or specific message.'
		);
		const malformedFactData = { text: '' }; // Empty fact
		try {
			const response = await this.webSocketManager.invoke('assert', {
				sessionId: this.sessionId,
				...malformedFactData,
			});
			if (
				response &&
				response.message &&
				response.message.toLowerCase().includes('ignored')
			) {
				await this.assertCondition(
					true,
					`Server gracefully ignored empty fact: ${response.message}`,
					''
				);
				this.dLog.mcrResponse(
					'Server response to empty fact',
					response.message
				);
			} else {
				await this.assertCondition(
					false,
					'',
					`Asserting empty fact did not result in a clear 'ignored' message. Response: ${JSON.stringify(response)}`
				);
			}
		} catch (error) {
			this.dLog.error(
				'Asserting malformed (empty) fact failed as expected.',
				error.message
			);
			await this.assertCondition(
				true,
				`API call for empty fact failed as expected.`,
				`API call for empty fact failed with an unexpected error.`
			);
		}

		// --- Test 3: Querying with malformed query ---
		this.dLog.divider();
		this.dLog.step('Test 3: Querying with malformed/empty query');
		this.dLog.info(
			'Expected outcome',
			'API call should fail or return a message indicating inability to process.'
		);
		const malformedQueryData = { naturalLanguageText: '' }; // Empty query
		try {
			const response = await this.webSocketManager.invoke('query', {
				sessionId: this.sessionId,
				...malformedQueryData,
			});
			if (
				response &&
				response.answer &&
				response.answer.toLowerCase().includes("don't know")
			) {
				await this.assertCondition(
					true,
					`Server responded to empty query with "${response.answer}" as expected.`,
					''
				);
				this.dLog.mcrResponse(
					'Server response to empty query',
					response.answer
				);
			} else if (response && response.error) {
				await this.assertCondition(
					true,
					`Server responded to empty query with an error message: "${response.error}"`,
					''
				);
				this.dLog.mcrResponse('Server error to empty query', response.error);
			} else {
				await this.assertCondition(
					false,
					'',
					`Querying with empty query did not result in a clear "don't know" or error. Response: ${JSON.stringify(response)}`
				);
			}
		} catch (error) {
			this.dLog.error(
				'Querying with malformed (empty) query failed as expected.',
				error.message
			);
			await this.assertCondition(
				true,
				`API call for empty query failed as expected.`,
				`API call for empty query failed with an unexpected error.`
			);
		}

		// --- Test 4: Asserting contradictory facts (Optional - behavior depends on reasoner capabilities) ---
		this.dLog.divider();
		this.dLog.step('Test 4: Asserting potentially contradictory facts');
		this.dLog.info(
			'Expected outcome',
			'System may accept, reject, or flag the contradiction. Logging this behavior is key.'
		);

		await this.assertFact('The ball is red.');
		const assertResponse = await this.assertFact('The ball is not red.'); // Or 'The ball is blue.'

		if (assertResponse) {
			this.dLog.info(
				'Contradictory fact assertion processed.',
				`Response: ${assertResponse.message}`
			);
			await this.assertCondition(
				true,
				'Potentially contradictory fact processed. System behavior observed.',
				''
			);

			// Optional: Query to see the effect
			const queryResult = await this.query('What color is the ball?');
			if (queryResult) {
				this.dLog.info(
					'Query result after contradictory assertion',
					queryResult.answer
				);
			}
		} else {
			await this.assertCondition(
				false,
				'',
				'Assertion of potentially contradictory fact failed unexpectedly.'
			);
		}

		this.dLog.success('Error handling scenarios tested.');
		this.dLog.divider();
	}
}

export default ErrorHandlingDemo;
