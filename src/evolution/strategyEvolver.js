// src/evolution/strategyEvolver.js
const crypto = require('crypto');
const logger = require('../util/logger');
const { initDb } = require('../store/database'); // closeDb removed
const llmService = require('../llmService'); // Assuming llmService is set up and provides a 'generate' method
const {
	prompts,
	fillTemplate,
	getPromptTemplateByName,
	addOrUpdatePromptTemplate,
} = require('../prompts'); // Need to manage prompts

class StrategyEvolver {
	constructor(config = {}) {
		this.config = config;
	}

	/**
	 * Selects a node from the strategy graph for mutation.
	 * Initial implementation: selects the first LLM_Call node.
	 * @param {object} strategyJson The strategy JSON definition.
	 * @returns {object | null} The selected node object or null if no suitable node found.
	 */
	selectNodeForMutation(strategyJson) {
		if (!strategyJson || !Array.isArray(strategyJson.nodes)) {
			logger.warn(
				'[StrategyEvolver] Invalid strategy JSON or no nodes array found.'
			);
			return null;
		}
		// For now, select the first LLM_Call node
		const llmNode = strategyJson.nodes.find(
			node => node.type === 'LLM_Call' && node.prompt_template_name
		);
		if (!llmNode) {
			logger.warn(
				'[StrategyEvolver] No LLM_Call node with a prompt_template_name found in the strategy.'
			);
			return null;
		}
		logger.info(
			`[StrategyEvolver] Selected node for mutation: ${llmNode.id} (template: ${llmNode.prompt_template_name})`
		);
		return llmNode;
	}

	/**
	 * Fetches examples where the given strategy (by its hash) performed poorly.
	 * @param {string} strategyHash SHA-256 hash of the strategy JSON.
	 * @param {number} limit Max number of failing examples to fetch.
	 * @returns {Promise<Array<object>>} Array of { example_id, naturalLanguageInput, expectedProlog, metrics }
	 */
	async getFailingExamples(strategyHash, limit = 3) {
		logger.info(
			`[StrategyEvolver] Fetching failing examples for strategy hash: ${strategyHash}`
		);
		try {
			const db = await initDb();
			// Query for examples where this strategy hash had a false 'exactMatchProlog' or 'prologStructureMatch'
			// And also include the natural language input from the evalCases (this is tricky as DB doesn't store NL input directly)
			// For now, we'll just fetch example_id and metrics. The Optimizer/Evaluator context might need to provide NL input.
			// This is a limitation: The DB stores example_id, but not the NL input directly.
			// We need to load eval cases to get the NL input.
			// For "Iterative Critique", we need NL input, (optionally) expected output, and what the strategy produced.

			// Let's find example_ids where key metrics are false.
			const rows = await new Promise((resolve, reject) => {
				const query = `
                    SELECT example_id, metrics, raw_output
                    FROM performance_results
                    WHERE strategy_hash = ?
                      AND (
                        json_extract(metrics, '$.exactMatchProlog') = 0 OR
                        json_extract(metrics, '$.prologStructureMatch') = 0 OR
                        json_extract(metrics, '$.exactMatchAnswer') = 0 OR
                        json_extract(metrics, '$.semanticSimilarityAnswer') = 0
                      )
                    ORDER BY timestamp DESC
                    LIMIT ?;
                `;
				db.all(query, [strategyHash, limit], (err, rows) => {
					if (err) {
						logger.error(
							`[StrategyEvolver] Error querying failing examples: ${err.message}`
						);
						return reject(err);
					}
					resolve(rows);
				});
			});

			if (!rows || rows.length === 0) {
				logger.info(
					`[StrategyEvolver] No failing examples found for strategy hash ${strategyHash} based on current criteria.`
				);
				return [];
			}

			// Now, we need to enrich these with NL input and expected output from the actual eval cases.
			// This requires access to eval case definitions. For simplicity, assume eval cases are loaded elsewhere
			// and accessible, e.g., via a function or passed in.
			// This is a temporary workaround. Ideally, this logic is closer to evaluation case data.
			const { loadAllEvalCases } = require('../evalCases/baseEvals'); // Temporary direct import
			const allEvalCases = loadAllEvalCases(); // Loads all cases from configured paths
			const evalCaseMap = new Map(allEvalCases.map(ec => [ec.id, ec]));

			const enrichedExamples = rows
				.map(row => {
					const evalCase = evalCaseMap.get(row.example_id);
					if (evalCase) {
						return {
							exampleId: row.example_id,
							naturalLanguageInput: evalCase.naturalLanguageInput,
							expectedOutput:
								evalCase.expectedProlog || evalCase.expectedAnswer, // Depending on type
							actualOutput: row.raw_output,
							metrics: JSON.parse(row.metrics),
						};
					}
					return null; // Case not found, should not happen if DB is consistent with eval files
				})
				.filter(Boolean);

			logger.info(
				`[StrategyEvolver] Found ${enrichedExamples.length} enriched failing examples.`
			);
			return enrichedExamples;
		} catch (error) {
			logger.error(
				`[StrategyEvolver] Error getting failing examples: ${error.message}`,
				{ stack: error.stack }
			);
			return [];
		}
	}

	/**
	 * Uses an LLM to critique and rewrite a prompt based on failing examples.
	 * @param {string} originalPromptContent The content of the prompt to rewrite.
	 * @param {Array<object>} failingExamples Array of { naturalLanguageInput, expectedOutput, actualOutput, metrics }.
	 * @param {string} promptGoal A description of what the original prompt was trying to achieve.
	 * @returns {Promise<string|null>} The rewritten prompt content or null if failed.
	 */
	async critiqueAndRewritePrompt(
		originalPromptContent,
		failingExamples,
		promptGoal = 'Translate natural language to a specific structured format.'
	) {
		if (failingExamples.length === 0) {
			logger.info(
				'[StrategyEvolver] No failing examples provided for critique. Cannot rewrite prompt.'
			);
			// Optionally, could try a generic rewrite without examples, e.g., "Make this prompt more robust."
			return null;
		}

		const examplesString = failingExamples
			.map((ex, idx) => {
				return `Example ${idx + 1}:
Natural Language Input: "${ex.naturalLanguageInput}"
Expected Output (Fragment): ${JSON.stringify(ex.expectedOutput, null, 2)}
Actual Output by Original Prompt: ${ex.actualOutput}
Metrics for this example: ${JSON.stringify(ex.metrics)}
---`;
			})
			.join('\n\n');

		const critiquePromptTemplate = prompts.CRITIQUE_AND_REWRITE_PROMPT; // Assuming this exists
		if (!critiquePromptTemplate) {
			logger.error(
				'[StrategyEvolver] CRITIQUE_AND_REWRITE_PROMPT template not found in prompts.js. Cannot proceed.'
			);
			// Fallback: create a generic one here, but it's better to have it in prompts.js
			// For now, let's define a very basic one if not found
			const fallbackSystem =
				'You are an expert prompt engineer. Your task is to critique and rewrite a given prompt to improve its performance based on examples where it failed.';
			const fallbackUser = `The original prompt is designed to: ${promptGoal}

Original Prompt:
"""
${originalPromptContent}
"""

This prompt failed on the following examples:
${examplesString}

Please provide a critique of why the original prompt might have failed on these examples and then provide a rewritten prompt that addresses these failures.
The rewritten prompt should aim to achieve the original goal more effectively.

Your response should be JUST the rewritten prompt text, without any preamble or explanation.
Do NOT wrap the rewritten prompt in markdown code blocks. Output only the raw text of the new prompt.
`;
			logger.warn('[StrategyEvolver] Using fallback critique prompt template.');
			const rewrittenPrompt = await llmService.generate(
				fallbackSystem,
				fallbackUser
			);
			return rewrittenPrompt ? rewrittenPrompt.trim() : null;
		}

		const userPrompt = fillTemplate(critiquePromptTemplate.user, {
			original_prompt: originalPromptContent,
			failure_examples: examplesString,
			prompt_goal: promptGoal,
		});
		const systemPrompt =
			critiquePromptTemplate.system ||
			'You are an expert prompt engineer. Rewrite the given prompt to address the failures shown in the examples.';

		try {
			logger.info(
				'[StrategyEvolver] Sending prompt for critique and rewrite to LLM...'
			);
			const llmResponse = await llmService.generate(systemPrompt, userPrompt);
			if (llmResponse) {
				logger.info('[StrategyEvolver] LLM returned rewritten prompt.');
				// Expecting the LLM to return just the prompt text based on typical instructions.
				return llmResponse.trim();
			} else {
				logger.warn(
					'[StrategyEvolver] LLM returned empty response for prompt rewrite.'
				);
				return null;
			}
		} catch (error) {
			logger.error(
				`[StrategyEvolver] LLM call for prompt rewrite failed: ${error.message}`,
				{ stack: error.stack }
			);
			return null;
		}
	}

	/**
	 * Creates a new strategy JSON definition with an updated prompt.
	 * The new prompt is stored dynamically or by creating a new template.
	 * @param {object} originalStrategyJson The original strategy JSON.
	 * @param {string} targetNodeId The ID of the node whose prompt is to be updated.
	 * @param {string} newPromptContent The new prompt text.
	 * @returns {object | null} New strategy JSON object or null.
	 */
	createEvolvedStrategyJson(
		originalStrategyJson,
		targetNodeId,
		newPromptContent
	) {
		const newStrategy = JSON.parse(JSON.stringify(originalStrategyJson)); // Deep copy

		// Generate new ID and name
		const evolutionSuffix = `_evo_${crypto.randomBytes(4).toString('hex')}`;
		newStrategy.id = `${originalStrategyJson.id}${evolutionSuffix}`;
		newStrategy.name = `${originalStrategyJson.name} (Evolved ${new Date().toISOString().substring(0, 10)})`;
		newStrategy.description = `Evolved version of ${originalStrategyJson.id}. Original description: ${originalStrategyJson.description || ''}`;
		newStrategy.source_strategy_hash = crypto
			.createHash('sha256')
			.update(JSON.stringify(originalStrategyJson))
			.digest('hex'); // Track lineage

		const nodeToUpdate = newStrategy.nodes.find(
			node => node.id === targetNodeId
		);
		if (!nodeToUpdate) {
			logger.error(
				`[StrategyEvolver] Node ${targetNodeId} not found in new strategy copy. This should not happen.`
			);
			return null;
		}

		// How to handle the new prompt:
		// Option 1: Embed directly in the node (requires StrategyExecutor to support it)
		// nodeToUpdate.prompt_text = newPromptContent; // A new field
		// delete nodeToUpdate.prompt_template_name; // Remove old one

		// Option 2: Create a new dynamic prompt template and reference it (requires prompts.js to support dynamic additions)
		const newPromptTemplateName = `evo_${originalStrategyJson.id}_${targetNodeId}_${crypto.randomBytes(4).toString('hex')}`;
		addOrUpdatePromptTemplate(newPromptTemplateName, {
			// Assuming a simple structure for new prompts; might need system/user distinction
			name: newPromptTemplateName,
			description: `Evolved prompt for strategy ${newStrategy.id}, node ${targetNodeId}`,
			system: '', // Or derive from original if possible, or make it part of LLM output
			user: newPromptContent,
			tags: ['evolved', originalStrategyJson.id],
			isDynamic: true, // Flag to indicate it's not from a static file
		});
		nodeToUpdate.prompt_template_name = newPromptTemplateName;
		logger.info(
			`[StrategyEvolver] Updated node ${targetNodeId} to use new dynamic prompt template: ${newPromptTemplateName}`
		);

		return newStrategy;
	}

	/**
	 * Main method for evolving a strategy using Iterative Critique.
	 * @param {object} strategyJson The strategy JSON definition to evolve.
	 * @returns {Promise<object | null>} The new, evolved strategy JSON, or null if evolution failed.
	 */
	async evolveIterativeCritique(strategyJson) {
		logger.info(
			`[StrategyEvolver] Starting Iterative Critique for strategy: ${strategyJson.id}`
		);

		const originalStrategyHash = crypto
			.createHash('sha256')
			.update(JSON.stringify(strategyJson))
			.digest('hex');

		const nodeToMutate = this.selectNodeForMutation(strategyJson);
		if (!nodeToMutate) {
			logger.warn(
				'[StrategyEvolver] Could not select a node for mutation. Evolution aborted.'
			);
			return null;
		}

		const originalPromptTemplateName = nodeToMutate.prompt_template_name;
		const originalPromptObject = getPromptTemplateByName(
			originalPromptTemplateName
		);
		if (!originalPromptObject || !originalPromptObject.user) {
			// Check for user part, assuming system might be optional or global
			logger.error(
				`[StrategyEvolver] Could not retrieve original prompt content for template: ${originalPromptTemplateName}`
			);
			return null;
		}
		// For now, assume the 'user' part is the main content to be rewritten.
		// A more sophisticated approach might involve rewriting system prompts too, or combining them.
		const originalPromptContent = originalPromptObject.user;
		const promptGoal =
			originalPromptObject.description ||
			`Goal for prompt template ${originalPromptTemplateName}`;

		const failingExamples = await this.getFailingExamples(originalStrategyHash);
		if (failingExamples.length === 0) {
			logger.info(
				'[StrategyEvolver] No failing examples found for this strategy. Iterative critique cannot proceed effectively without them.'
			);
			// Could add a fallback mutation here, e.g., a generic prompt improvement without examples.
			return null;
		}

		const rewrittenPromptContent = await this.critiqueAndRewritePrompt(
			originalPromptContent,
			failingExamples,
			promptGoal
		);
		if (!rewrittenPromptContent) {
			logger.warn(
				'[StrategyEvolver] Prompt rewriting failed or returned no content.'
			);
			return null;
		}

		const newStrategyJson = this.createEvolvedStrategyJson(
			strategyJson,
			nodeToMutate.id,
			rewrittenPromptContent
		);
		if (newStrategyJson) {
			logger.info(
				`[StrategyEvolver] Successfully created new evolved strategy: ${newStrategyJson.id}`
			);
			return newStrategyJson;
		} else {
			logger.error(
				'[StrategyEvolver] Failed to create new strategy JSON from rewritten prompt.'
			);
			return null;
		}
	}

	async evolve(strategyJson, method = 'IterativeCritique') {
		// Ensure DB connection is managed if methods use it.
		// Typically, the calling context (Optimizer) would manage initDb/closeDb for a batch of operations.
		if (method === 'IterativeCritique') {
			return this.evolveIterativeCritique(strategyJson);
		} else {
			logger.warn(`[StrategyEvolver] Unknown evolution method: ${method}`);
			return null;
		}
	}
}

module.exports = StrategyEvolver;

// Helper to load evaluation cases - this is a temporary solution for getFailingExamples.
// This should ideally be part of a shared context or service.
// Make sure baseEvals.js exports loadAllEvalCases or similar.
// This was moved inside getFailingExamples to avoid top-level side effects during module load.
// const path = require('path');
// const fs = require('fs');
// function loadAllEvalCasesSync() {
//     const evalCasesDir = path.join(__dirname, '..', 'evalCases');
//     let allCases = [];
//     try {
//         const files = fs.readdirSync(evalCasesDir);
//         for (const file of files) {
//             if (file.endsWith('.js') || file.endsWith('.json')) {
//                 const filePath = path.join(evalCasesDir, file);
//                 const casesFromFile = require(filePath); // Direct require
//                 if (Array.isArray(casesFromFile)) {
//                     allCases.push(...casesFromFile);
//                 }
//             }
//         }
//     } catch (err) {
//         logger.error(`[StrategyEvolver/loadAllEvalCasesSync] Error loading eval cases: ${err.message}`);
//     }
//     return allCases;
// }

/**
 * Example Usage (for testing, not part of the class itself):
async function testEvolver() {
    // This requires a running DB populated by evaluator, and strategies/prompts.js set up.
    const strategyManager = require('../strategyManager'); // For getting a strategy to test
    await initDb();

    const strategyToTest = strategyManager.getStrategy("SIR-R1-ASSERT"); // Or any other strategy ID
    if (!strategyToTest) {
        logger.error("Test strategy not found. Ensure 'SIR-R1-ASSERT' exists or pick another.");
        await closeDb();
        return;
    }
    logger.info("Test strategy JSON:", strategyToTest);


    const evolver = new StrategyEvolver();
    const newStrategy = await evolver.evolve(strategyToTest);

    if (newStrategy) {
        logger.info("Test Evolved Strategy JSON:", newStrategy);
        // Further: save it, evaluate it, etc.
        const newHash = crypto.createHash('sha256').update(JSON.stringify(newStrategy)).digest('hex');
        logger.info("Hash of new strategy:", newHash);

        // Check if the new prompt was added to prompts.js (in-memory)
        const nodeWithNewPrompt = newStrategy.nodes.find(n => n.prompt_template_name && n.prompt_template_name.startsWith('evo_'));
        if (nodeWithNewPrompt) {
            const dynamicPrompt = getPromptTemplateByName(nodeWithNewPrompt.prompt_template_name);
            logger.info(`Dynamic prompt "${nodeWithNewPrompt.prompt_template_name}" content (user part):`, dynamicPrompt.user);
        }

    } else {
        logger.warn("Evolution test did not produce a new strategy.");
    }
    await closeDb();
}

if (require.main === module) {
    // Assuming prompts.js has CRITIQUE_AND_REWRITE_PROMPT
    // And llmService is configured (e.g. via .env)
    // And database has some results.
    // testEvolver().catch(err => logger.error("Test evolver error:", err));
}
*/

// Need to add CRITIQUE_AND_REWRITE_PROMPT to prompts.js
// Example (to be added in src/prompts.js):
/*
CRITIQUE_AND_REWRITE_PROMPT: {
    name: 'CRITIQUE_AND_REWRITE_PROMPT',
    description: 'Critiques an original prompt based on failure examples and rewrites it.',
    tags: ['evolution', 'meta'],
    system: `You are an expert prompt engineer. Your task is to meticulously analyze an original prompt, understand its goal, identify its weaknesses based on provided failure examples, and then rewrite it for improved performance.
Focus on clarity, specificity, and robustness in the rewritten prompt. Ensure the new prompt still aims to achieve the original goal.`,
    user: `The original prompt is designed to achieve the following goal:
"{{prompt_goal}}"

Original Prompt:
"""
{{original_prompt}}
"""

This original prompt produced incorrect or suboptimal outputs on the following examples:
---
{{failure_examples}}
---

Your tasks:
1.  **Critique (Mental Step - do not output this):** Briefly analyze why the original prompt might have failed for these examples. Consider issues like ambiguity, lack of context, insufficient constraints, or misinterpretation of intent.
2.  **Rewrite:** Provide a new, improved prompt that directly addresses these failures and is more likely to succeed on similar cases.

IMPORTANT INSTRUCTIONS:
- Your response MUST be ONLY the rewritten prompt text.
- Do NOT include any preamble, explanation, critique text, or markdown formatting (like \`\`\`json or \`\`\` text).
- The rewritten prompt should be ready to be used directly.
`,
    expectedFormat: 'text', // plain text output
    version: '1.0'
}
*/
// Also, prompts.js needs to export addOrUpdatePromptTemplate and getPromptTemplateByName
// And baseEvals.js needs to export loadAllEvalCases if that temporary solution is used.
// e.g. in prompts.js:
// let dynamicPrompts = {}; // Store dynamically added prompts
// function addOrUpdatePromptTemplate(name, templateObject) { dynamicPrompts[name] = templateObject; }
// function getPromptTemplateByName(templateName) { return PROMPT_TEMPLATES[templateName] || dynamicPrompts[templateName]; }
// module.exports = { prompts: PROMPT_TEMPLATES, fillTemplate, getPromptTemplateByName, addOrUpdatePromptTemplate };

// e.g. in src/evalCases/baseEvals.js
// function loadAllEvalCases() { /* existing logic to load from files */ return allCases; }
// module.exports = { ..., loadAllEvalCases }; (add to existing exports)
