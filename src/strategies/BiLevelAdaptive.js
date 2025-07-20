const logger = require('../util/logger');
const { MCRError, ErrorCodes } = require('../errors');

/**
 * @file src/strategies/BiLevelAdaptive.js
 * Implements the Bi-Level Adaptive translation strategy.
 */

/**
 * Translates natural language to Prolog clauses using a bi-level approach.
 *
 * @param {object} llmProvider - An instance of an LLM provider.
 * @param {string} naturalLanguageText - The natural language text to translate.
 * @param {string} lexiconSummary - A summary of the current lexicon.
 * @returns {Promise<{clauses: string[], intermediateModel: object}>} - The translated Prolog clauses and the intermediate model.
 */
async function translateToLogic(
	llmProvider,
	naturalLanguageText,
	lexiconSummary
) {
	logger.info(
		`[BiLevelAdaptive] Starting translation for: "${naturalLanguageText}"`
	);

	// Upper-level prompt to generate the JSON model
	const upperLevelPrompt = {
		system:
			"You are an expert in knowledge representation. Convert the user's input into a structured JSON model. The model should have keys 'p' (problem), 't' (task), 'V' (variables), 'C' (constraints), and 'O' (objective).",
		user: `Input: "${naturalLanguageText}"\nLexicon: ${lexiconSummary}\n\nGenerate the JSON model.`,
	};

	const modelResult = await llmProvider.callLLM(
		upperLevelPrompt.system,
		upperLevelPrompt.user
	);
	let intermediateModel;
	try {
		intermediateModel = JSON.parse(modelResult.text);
	} catch (error) {
		throw new MCRError(
			ErrorCodes.JSON_PARSING_FAILED,
			`Failed to parse intermediate model: ${error.message}`
		);
	}

	logger.info(
		'[BiLevelAdaptive] Intermediate model generated:',
		intermediateModel
	);

	// Lower-level prompt to generate Prolog clauses from the model
	const lowerLevelPrompt = {
		system:
			'You are an expert in Prolog. Convert the given JSON model into Prolog clauses.',
		user: `JSON Model: ${JSON.stringify(intermediateModel, null, 2)}\n\nGenerate the Prolog clauses.`,
	};

	const clausesResult = await llmProvider.callLLM(
		lowerLevelPrompt.system,
		lowerLevelPrompt.user
	);
	const clauses = clausesResult.text
		.split('\n')
		.map(c => c.trim())
		.filter(c => c.length > 0);

	logger.info('[BiLevelAdaptive] Prolog clauses generated:', clauses);

	return { clauses, intermediateModel };
}

module.exports = {
	translateToLogic,
};
