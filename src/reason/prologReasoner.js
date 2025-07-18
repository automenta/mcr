// src/reasonerProviders/prologReasoner.js
const prolog = require('tau-prolog');
const logger = require('../util/logger');

/**
 * Helper to format Prolog answers.
 * @param {*} answer - An answer from Tau Prolog.
 * @returns {string|object} - A simplified representation of the anwer.
 */
function formatAnswer(answer) {
	if (
		prolog.type &&
		typeof prolog.type.is_substitution === 'function' &&
		prolog.type.is_substitution(answer)
	) {
		if (answer.lookup('Goal') && answer.lookup('Goal').toString() === 'true') {
			return true;
		}
		const result = {};
		let hasBindings = false;
		for (const V_key in answer.links) {
			if (V_key.startsWith('_')) {
				continue;
			}
			result[V_key] = answer.links[V_key].toString();
			hasBindings = true;
		}
		return hasBindings ? result : true;
	}
	return answer.toString();
}

/**
 * Traverses the derivation tree from Tau Prolog and formats it into a serializable object.
 * @param {object} termNode - A node from the Tau Prolog derivation tree.
 * @param {pl.type.Session} session - The Tau Prolog session, for formatting terms.
 * @returns {object|null} A simplified, serializable representation of the trace.
 */
function formatTrace(termNode, session) {
	try {
		if (!termNode || termNode.goal === null) {
			return { goal: 'fail', children: [] };
		}

		// Safely access goal and links
		const goal = termNode.goal;
		const links = termNode.links;
		let formattedGoal = 'true'; // Default for successful, non-binding goals

		if (prolog.type.is_goal(goal)) {
			try {
				// format_term can be complex, so wrap it in a try-catch
				formattedGoal = session.format_term(goal, { session, links });
			} catch (e) {
				logger.error(
					`[PrologReasoner] Error formatting term in formatTrace: ${e.message}`,
					{ term: goal.toString() } // Log the term that caused the error
				);
				formattedGoal = 'error_formatting_term';
			}
		} else {
			// Handle cases where the goal is not a standard goal object
			formattedGoal = 'unknown_goal_type';
			logger.warn(
				'[PrologReasoner] formatTrace encountered a non-goal object:',
				goal
			);
		}

		// Safely map children
		const children = Array.isArray(termNode.children)
			? termNode.children.map(child => formatTrace(child, session))
			: [];

		return {
			goal: formattedGoal,
			children,
		};
	} catch (error) {
		logger.error(
			`[PrologReasoner] Unexpected error in formatTrace: ${error.message}`,
			{ error }
		);
		return { goal: 'error', children: [] };
	}
}

/**
 * Executes a Prolog query against a given knowledge base.
 * @param {string} knowledgeBase - A string containing all Prolog facts and rules.
 * @param {string} query - The Prolog query string (e.g., "human(X).").
 * @param {object} [options={}] - Options for execution.
 * @param {number} [options.limit=10] - Maximum number of answers to retrieve.
 * @param {boolean} [options.trace=false] - Whether to capture the proof trace.
 * @returns {Promise<{results: Array<object|string|boolean>, trace: object|null}>} A promise that resolves to an object
 *          containing formatted answers and the proof trace if requested.
 * @throws {Error} If there's a syntax error or other issue with the Prolog execution.
 */
async function executeQuery(knowledgeBase, query, options = {}) {
	const { limit = 10, trace = false } = options;
	const session = prolog.create(1000);
	const results = [];

	function getProofTrace() {
		if (!trace) return null;
		const tree = session.thread.get_tree();
		return tree ? formatTrace(tree, session) : null;
	}

	return new Promise((resolve, reject) => {
		try {
			session.consult(knowledgeBase, {
				success: () => {
					session.query(query, {
						success: () => {
							function processNextAnswer() {
								session.answer({
									success: answer => {
										if (
											answer === false ||
											(prolog.type &&
												typeof prolog.type.is_theta_nil === 'function' &&
												prolog.type.is_theta_nil(answer))
										) {
											resolve({ results, trace: getProofTrace() });
											return;
										}

										const formatted = formatAnswer(answer);
										results.push(formatted);

										if (results.length >= limit) {
											resolve({ results, trace: getProofTrace() });
											return;
										}
										processNextAnswer();
									},
									error: err => {
										reject(new Error(`Prolog error processing answer: ${err}`));
									},
									fail: () => {
										resolve({ results, trace: getProofTrace() });
									},
									limit: () => {
										resolve({ results, trace: getProofTrace() });
									},
								});
							}
							processNextAnswer();
						},
						error: err => {
							reject(new Error(`Prolog query error: ${err}`));
						},
					});
				},
				error: err => {
					reject(new Error(`Prolog knowledge base error: ${err}`));
				},
			});
		} catch (error) {
			reject(new Error(`Unexpected Prolog error: ${error.message}`));
		}
	});
}

/**
 * Validates the syntax of a given knowledge base.
 * @param {string} knowledgeBase - A string containing the Prolog facts and rules.
 * @returns {Promise<{isValid: boolean, error?: string}>} A promise that resolves to an object
 *          indicating if the knowledge base is valid.
 */
async function validateKnowledgeBase(knowledgeBase) {
	const kbSnippet =
		knowledgeBase.substring(0, 200) + (knowledgeBase.length > 200 ? '...' : '');

	try {
		const session = prolog.create(100);
		let consultError = null;

		try {
			session.consult(knowledgeBase);
		} catch (syncError) {
			consultError = syncError;
		}

		if (!consultError) {
			const consultPromise = new Promise(resolveConsult => {
				session.consult(knowledgeBase, {
					success: () => resolveConsult(null),
					error: err => resolveConsult(err),
				});
			});
			consultError = await consultPromise;
		}

		if (consultError) {
			return { isValid: false, error: String(consultError) };
		}

		return { isValid: true };
	} catch (e) {
		return { isValid: false, error: e.message };
	}
}

module.exports = {
	name: 'prolog',
	executeQuery,
	validate: validateKnowledgeBase,
};
