// src/evalCases/baseEvals.js

/**
 * @type {import('../evaluator').EvaluationCase[]}
 */
const baseEvals = [
	{
		id: 'BE001_SimpleAssert',
		description: "Simple fact assertion: 'The sky is blue.'",
		naturalLanguageInput: 'The sky is blue.',
		inputType: 'assert',
		expectedProlog: ['is_color(sky, blue).'],
		metrics: ['exactMatchProlog'],
		tags: ['assertion', 'simple-fact', 'core', 'reduced-set'],
	},
	{
		id: 'BE002_SimpleRule',
		description: "Simple rule assertion: 'All humans are mortal.'",
		naturalLanguageInput: 'All humans are mortal.',
		inputType: 'assert',
		expectedProlog: ['mortal(X) :- is_a(X, human).'],
		metrics: ['exactMatchProlog'],
		tags: ['assertion', 'simple-rule', 'core', 'reduced-set'],
	},
	// {
	//   id: "BE003",
	//   description: "Assertion requiring list in SIR: 'H2O is composed of Hydrogen and Oxygen.'",
	//   naturalLanguageInput: "H2O is composed of Hydrogen and Oxygen.",
	//   inputType: "assert",
	//   expectedProlog: ["is_composed_of(h2o, [hydrogen, oxygen])."],
	//   metrics: ["exactMatchProlog"],
	//   tags: ["assertion", "list-argument", "sir-specific"],
	//   notes: "This case tests if the strategy correctly generates a list for the components."
	// },
	// {
	//   id: "BE004",
	//   description: "Query based on asserted fact: 'Is the sky blue?' after asserting 'The sky is blue.'",
	//   naturalLanguageInput: "Is the sky blue?",
	//   inputType: "query",
	//   expectedProlog: "is_color(sky, blue).",
	//   expectedAnswer: "Yes, the sky is blue.",
	//   metrics: ["exactMatchProlog", "exactMatchAnswer"],
	//   tags: ["query", "simple-query", "core", "dependent-BE001"],
	//   notes: "This case implicitly depends on BE001 being asserted in the same session by the strategy being tested."
	// },
	// {
	//   id: "BE005",
	//   description: "Query for variable based on rule: 'Who is mortal?' after asserting 'All humans are mortal.' and 'Socrates is a human.'",
	//   naturalLanguageInput: "Who is mortal?",
	//   inputType: "query",
	//   expectedProlog: "mortal(X).",
	//   expectedAnswer: "Socrates is mortal.",
	//   metrics: ["exactMatchProlog", "exactMatchAnswer"],
	//   tags: ["query", "rule-query", "core", "dependent-BE002"],
	//   notes: "Depends on BE002 and an assertion like 'is_a(socrates, human).' being present in the session. The NL answer match might be less strict."
	// },
	{
		id: 'BE006_NegatedFact',
		description:
			"Negated fact assertion: 'Paris is not the capital of Germany.'",
		naturalLanguageInput: 'Paris is not the capital of Germany.',
		inputType: 'assert',
		expectedProlog: ['not(is_capital_of(paris, germany)).'],
		metrics: ['exactMatchProlog'],
		tags: ['assertion', 'negation', 'core', 'reduced-set'],
		notes:
			'Tests handling of negation. Expected Prolog is for SIR-style negation.',
	},
	// {
	//   id: "BE007",
	//   description: "Query involving negation: 'Is Paris the capital of Germany?' after asserting it's not.",
	//   naturalLanguageInput: "Is Paris the capital of Germany?",
	//   inputType: "query",
	//   expectedProlog: "is_capital_of(paris, germany).",
	//   expectedAnswer: "No, Paris is not the capital of Germany.",
	//   metrics: ["exactMatchProlog", "exactMatchAnswer"],
	//   tags: ["query", "negation-query", "core", "dependent-BE006"],
	//   notes: "Depends on BE006. Tests querying a fact known to be false."
	// },
];

const fs = require('fs');
const path = require('path');
const logger = require('../util/logger'); // Assuming logger is available

/**
 * Loads all evaluation cases from .js and .json files in the specified directory.
 * @param {string} casesDir The directory to load cases from. Defaults to 'src/evalCases'.
 * @returns {import('../evaluator').EvaluationCase[]} An array of all loaded evaluation cases.
 */
/**
 * Recursively loads all evaluation cases from .js and .json files
 * within the specified directory and its subdirectories.
 * @param {string} currentPath The current directory or file path to scan.
 * @param {string} rootCasesDir The root directory for evaluation cases, used for relative path logging.
 * @returns {import('../evaluator').EvaluationCase[]} An array of all loaded evaluation cases.
 */
function loadCasesRecursively(currentPath, rootCasesDir) {
	let cases = [];
	const stats = fs.statSync(currentPath);

	if (stats.isDirectory()) {
		const files = fs.readdirSync(currentPath);
		for (const file of files) {
			cases.push(
				...loadCasesRecursively(path.join(currentPath, file), rootCasesDir)
			);
		}
	} else if (
		stats.isFile() &&
		(currentPath.endsWith('.js') || currentPath.endsWith('.json'))
	) {
		const relativePath = path.relative(rootCasesDir, currentPath);
		try {
			// Check if the file is the entry point itself to avoid self-requiring issues if not handled carefully
			// This specific check might be too broad or unnecessary depending on file structure and how require resolves.
			// if (path.basename(currentPath) === path.basename(__filename) && path.dirname(currentPath) === __dirname) {
			//     logger.debug(`[loadCasesRecursively] Skipping self-require: ${currentPath}`);
			//     return cases; // Skip
			// }

			const casesFromFile = require(currentPath); // require() caches, which is fine
			if (Array.isArray(casesFromFile)) {
				// Add source file info for better traceability if needed later
				// casesFromFile.forEach(c => c.sourceFile = relativePath);
				cases.push(...casesFromFile);
				logger.debug(
					`[loadCasesRecursively] Loaded ${casesFromFile.length} cases from ${relativePath}`
				);
			} else {
				logger.warn(
					`[loadCasesRecursively] File ${relativePath} does not export an array. Skipping.`
				);
			}
		} catch (loadErr) {
			logger.error(
				`[loadCasesRecursively] Error loading or parsing cases from ${relativePath}: ${loadErr.message}`
			);
		}
	}
	return cases;
}

/**
 * Loads all evaluation cases from .js and .json files in the specified directory, including subdirectories.
 * @param {string} casesRootDir The root directory to load cases from. Defaults to 'src/evalCases' (i.e., path.join(__dirname)).
 * @returns {import('../evaluator').EvaluationCase[]} An array of all loaded evaluation cases.
 */
function loadAllEvalCases(casesRootDir = path.join(__dirname)) {
	logger.info(
		`[loadAllEvalCases] Starting recursive load of evaluation cases from root: ${casesRootDir}`
	);
	if (
		!fs.existsSync(casesRootDir) ||
		!fs.statSync(casesRootDir).isDirectory()
	) {
		logger.error(
			`[loadAllEvalCases] Evaluation cases directory not found or not a directory: ${casesRootDir}`
		);
		return [];
	}
	const allLoadedCases = loadCasesRecursively(casesRootDir, casesRootDir);
	logger.info(
		`[loadAllEvalCases] Total evaluation cases loaded recursively from ${casesRootDir}: ${allLoadedCases.length}`
	);
	return allLoadedCases;
}

module.exports = {
	baseEvals, // Export individual set if needed elsewhere
	loadAllEvalCases, // Export the loader function
};
