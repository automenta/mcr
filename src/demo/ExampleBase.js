// src/demo/ExampleBase.js
class ExampleBase {
	constructor(sessionId, logCollector, webSocketManager) {
		if (!sessionId) {
			throw new Error('ExampleBase requires a sessionId during instantiation.');
		}
		if (typeof logCollector !== 'function') {
			throw new Error(
				'ExampleBase requires a logCollector function during instantiation.'
			);
		}
		if (!webSocketManager) {
			throw new Error('ExampleBase requires a webSocketManager during instantiation.');
		}
		this.sessionId = sessionId;
		this.logCollector = logCollector; // Function to call with log messages
		this.webSocketManager = webSocketManager;

		// Simplified dLog that uses the collector
		this.dLog = {
			step: text =>
				this.logCollector({ type: 'log', level: 'step', message: text }),
			info: (label, data) =>
				this.logCollector({
					type: 'log',
					level: 'info',
					message: `${label}: ${typeof data === 'object' ? JSON.stringify(data, null, 2) : data}`,
				}),
			nl: (label, text) =>
				this.logCollector({
					type: 'log',
					level: 'nl',
					message: `${label}: "${text}"`,
				}),
			logic: (label, text) =>
				this.logCollector({
					type: 'log',
					level: 'logic',
					message: `${label}: ${typeof text === 'object' ? JSON.stringify(text) : text}`,
				}),
			mcrResponse: (label, text) =>
				this.logCollector({
					type: 'log',
					level: 'mcr',
					message: `${label}: ${text}`,
				}),
			success: text =>
				this.logCollector({ type: 'log', level: 'success', message: text }),
			error: (text, details) =>
				this.logCollector({
					type: 'log',
					level: 'error',
					message: text,
					details: details,
				}),
			assertion: (status, message) =>
				this.logCollector({
					type: 'assertion',
					status: status,
					message: message,
				}),
			cleanup: text =>
				this.logCollector({ type: 'log', level: 'cleanup', message: text }),
			divider: (char = '-', length = 60) =>
				this.logCollector({
					type: 'log',
					level: 'divider',
					message: char.repeat(length),
				}),
			// Add apiCall if necessary, or let mcrService handle its own logging.
		};
	}

	async handleNL(naturalLanguageText) {
		this.dLog.info('Handling NL', { text: naturalLanguageText });
		const response = await this.webSocketManager.invoke('handle', {
			sessionId: this.sessionId,
			naturalLanguageText,
		});
		if (response.success) {
			this.dLog.success(`Handled: "${naturalLanguageText}".`);
		} else {
			this.dLog.error(
				`Failed to handle: "${naturalLanguageText}"`,
				response.message
			);
		}
		return response;
	}

	async assertFact(naturalLanguageText, type = 'nl') {
		this.dLog.info('Asserting Fact', { text: naturalLanguageText, type });
		let response;
		if (type === 'prolog') {
			response = await this.webSocketManager.invoke('assert', {
				sessionId: this.sessionId,
				prolog: naturalLanguageText,
			});
		} else {
			response = await this.handleNL(naturalLanguageText);
		}
		if (response.success) {
			this.dLog.success(
				`Asserted: "${naturalLanguageText}". Added: ${response.addedFacts?.length || 0} facts.`
			);
		} else {
			this.dLog.error(
				`Failed to assert: "${naturalLanguageText}"`,
				response.message
			);
		}
		return response; // Return the full MCR service response
	}

	async query(naturalLanguageQuestion, queryOptions = {}) {
		this.dLog.info('Querying', {
			question: naturalLanguageQuestion,
			options: queryOptions,
		});
		const response = await this.handleNL(naturalLanguageQuestion);
		if (response.success) {
			this.dLog.mcrResponse('Answer', response.answer);
		} else {
			this.dLog.error(
				`Query failed: "${naturalLanguageQuestion}"`,
				response.message
			);
		}
		return response; // Return the full MCR service response
	}

	async assertCondition(condition, successMessage, failureMessage) {
		if (condition) {
			this.dLog.assertion(true, successMessage);
		} else {
			this.dLog.assertion(false, failureMessage);
		}
		return condition;
	}

	// Placeholder for run, to be implemented by subclasses
	async run() {
		throw new Error('Demo subclasses must implement the run() method.');
	}
}

export default ExampleBase;
