const crypto = require('crypto');
const logger = require('./util/logger');
const { initDb } = require('./store/database');
const MCREngine = require('./mcrEngine');
const {
	prompts,
	fillTemplate,
	getPromptTemplateByName,
	addOrUpdatePromptTemplate,
} = require('./prompts');
const { loadAllEvalCases } = require('./evalCases/baseEvals');
const fs = require('fs');
const path = require('path');
const { ErrorCodes, MCRError } = require('./errors');
const strategyManager = require('./strategyManager');
const { Evaluator } = require('./evaluation/metrics');

class CurriculumGenerator {
	constructor(config = {}) {
		this.config = config;
		this.generatedCasesDir =
			config.generatedCasesDir ||
			path.join(__dirname, '..', 'evalCases', 'generated');
		if (!fs.existsSync(this.generatedCasesDir)) {
			fs.mkdirSync(this.generatedCasesDir, { recursive: true });
		}
	}

	async identifyPoorPerformingCases(limit = 5) {
		logger.info(
			'[CurriculumGenerator] Identifying poor-performing evaluation cases...'
		);
		try {
			const db = await initDb();
			const rows = await new Promise((resolve, reject) => {
				const query = `
                    SELECT
                        example_id,
                        COUNT(*) as total_runs,
                        SUM(CASE WHEN json_extract(metrics, '$.exactMatchProlog') = 0 THEN 1 ELSE 0 END) as prolog_failures,
                        SUM(CASE WHEN json_extract(metrics, '$.exactMatchAnswer') = 0 THEN 1 ELSE 0 END) as answer_failures,
                        AVG(json_extract(metrics, '$.exactMatchProlog')) as avg_prolog_score,
                        AVG(json_extract(metrics, '$.exactMatchAnswer')) as avg_answer_score
                    FROM performance_results
                    WHERE json_extract(metrics, '$.exactMatchProlog') IS NOT NULL OR json_extract(metrics, '$.exactMatchAnswer') IS NOT NULL
                    GROUP BY example_id
                    HAVING (prolog_failures > 0 OR answer_failures > 0)
                    ORDER BY (CAST(prolog_failures AS REAL) / total_runs) DESC, total_runs DESC
                    LIMIT ?;
                `;
				db.all(query, [limit], (err, rows) => {
					if (err) {
						logger.error(
							`[CurriculumGenerator] Error querying poor-performing cases: ${err.message}`
						);
						return reject(err);
					}
					resolve(rows);
				});
			});

			if (!rows || rows.length === 0) {
				logger.info(
					'[CurriculumGenerator] No poor-performing cases found based on current criteria.'
				);
				return [];
			}

			const allEvalCases = loadAllEvalCases();
			const evalCaseMap = new Map(allEvalCases.map(ec => [ec.id, ec]));

			const enrichedCases = rows
				.map(row => {
					const fullCase = evalCaseMap.get(row.example_id);
					if (fullCase) {
						return {
							exampleId: row.example_id,
							totalRuns: row.total_runs,
							prologFailures: row.prolog_failures,
							answerFailures: row.answer_failures,
							failureRateProlog:
								row.total_runs > 0 ? row.prolog_failures / row.total_runs : 0,
							avgPrologScore: row.avg_prolog_score,
							avgAnswerScore: row.avg_answer_score,
							sampleCaseDetails: {
								naturalLanguageInput: fullCase.naturalLanguageInput,
								inputType: fullCase.inputType,
								expectedProlog: fullCase.expectedProlog,
								expectedAnswer: fullCase.expectedAnswer,
								description: fullCase.description,
								tags: fullCase.tags || [],
							},
						};
					}
					return null;
				})
				.filter(Boolean);

			logger.info(
				`[CurriculumGenerator] Identified ${enrichedCases.length} poor-performing cases for variation.`
			);
			return enrichedCases;
		} catch (error) {
			logger.error(
				`[CurriculumGenerator] Error identifying poor-performing cases: ${error.message}`,
				{ stack: error.stack }
			);
			return [];
		}
	}

	async generateCaseVariations(originalCase, numVariations = 2) {
		if (!originalCase || !originalCase.naturalLanguageInput) {
			logger.warn(
				'[CurriculumGenerator] Original case data is insufficient for generating variations.'
			);
			return [];
		}
		const engine = new MCREngine();
		const generatePromptTemplate = prompts.GENERATE_EVAL_CASES;
		if (!generatePromptTemplate) {
			logger.error(
				'[CurriculumGenerator] GENERATE_EVAL_CASES template not found in prompts.js. Cannot generate variations.'
			);
			return [];
		}

		const domain = originalCase.tags
			? originalCase.tags.find(t => t.startsWith('domain_')) || 'general'
			: 'general';
		const instructions = `Generate ${numVariations} variations of the following evaluation case.
The variations should test the same underlying concept or knowledge but use different phrasing, complexity, or slightly altered scenarios.
Ensure the 'expectedProlog' and 'expectedAnswer' are accurate for each new variation.
Maintain the original inputType ('${originalCase.inputType}').
Base new IDs on the original: '${originalCase.exampleId}_var_N'.
Original Case Description: ${originalCase.description}
Original Natural Language Input: "${originalCase.naturalLanguageInput}"
Original Expected Prolog: ${JSON.stringify(originalCase.expectedProlog)}
Original Expected Answer: "${originalCase.expectedAnswer || ''}"
`;

		const userPrompt = fillTemplate(generatePromptTemplate.user, {
			domain: domain,
			instructions: instructions,
		});
		const systemPrompt = generatePromptTemplate.system;

		try {
			logger.info(
				`[CurriculumGenerator] Requesting LLM to generate ${numVariations} variations for case: ${originalCase.exampleId || originalCase.naturalLanguageInput}`
			);
			const llmResponse = await engine.callLLM(systemPrompt, userPrompt);

			if (!llmResponse) {
				logger.warn(
					'[CurriculumGenerator] LLM returned empty response for case variations.'
				);
				return [];
			}

			let generatedCasesArray;
			try {
				generatedCasesArray = JSON.parse(llmResponse);
				if (!Array.isArray(generatedCasesArray)) {
					logger.warn(
						'[CurriculumGenerator] LLM response for variations was not a JSON array. Response:',
						llmResponse.substring(0, 200)
					);
					return [];
				}
			} catch (parseError) {
				logger.error(
					`[CurriculumGenerator] Failed to parse LLM response as JSON array: ${parseError.message}. Response: ${llmResponse.substring(0, 500)}`
				);
				const jsonMatch = llmResponse.match(/```json\s*([\s\S]*?)\s*```/);
				if (jsonMatch && jsonMatch[1]) {
					try {
						generatedCasesArray = JSON.parse(jsonMatch[1]);
						if (!Array.isArray(generatedCasesArray)) {
							logger.warn(
								'[CurriculumGenerator] Extracted content from markdown was not a JSON array.'
							);
							return [];
						}
						logger.info(
							'[CurriculumGenerator] Successfully parsed JSON from markdown block after initial failure.'
						);
					} catch (e) {
						logger.error(
							`[CurriculumGenerator] Failed to parse JSON from markdown block: ${e.message}`
						);
						return [];
					}
				} else {
					return [];
				}
			}

			const finalNewCases = [];
			for (const newCase of generatedCasesArray) {
				if (
					newCase &&
					newCase.id &&
					newCase.naturalLanguageInput &&
					newCase.inputType &&
					newCase.expectedProlog
				) {
					newCase.id =
						`${originalCase.exampleId}_var_${crypto.randomBytes(3).toString('hex')}_${newCase.id}`
							.replace(/[^a-zA-Z0-9_.-]/g, '_')
							.substring(0, 100);
					newCase.tags = [
						...(originalCase.tags || []),
						'generated',
						'variation',
					];
					newCase.notes =
						`Generated variation of ${originalCase.exampleId}. Original desc: ${originalCase.description}. ${newCase.notes || ''}`.substring(
							0,
							255
						);
					finalNewCases.push(newCase);
				} else {
					logger.warn(
						'[CurriculumGenerator] LLM generated an invalid case structure:',
						newCase
					);
				}
			}
			logger.info(
				`[CurriculumGenerator] LLM generated ${finalNewCases.length} valid case variations.`
			);
			return finalNewCases;
		} catch (error) {
			logger.error(
				`[CurriculumGenerator] LLM call for case variations failed: ${error.message}`,
				{ stack: error.stack }
			);
			return [];
		}
	}

	async generate() {
		logger.info(
			'[CurriculumGenerator] Starting curriculum generation cycle...'
		);
		let allNewlyGeneratedCases = [];

		const poorCases = await this.identifyPoorPerformingCases(3);
		if (poorCases.length === 0) {
			logger.info(
				'[CurriculumGenerator] No poor-performing cases identified to base variations on. For now, generation will stop.'
			);
			return [];
		}

		for (const poorCase of poorCases) {
			const variations = await this.generateCaseVariations(
				poorCase.sampleCaseDetails,
				1
			);
			if (variations.length > 0) {
				allNewlyGeneratedCases.push(...variations);
				this.saveGeneratedCases(
					variations,
					`variations_of_${poorCase.exampleId}`
				);
			}
		}

		if (allNewlyGeneratedCases.length > 0) {
			logger.info(
				`[CurriculumGenerator] Successfully generated ${allNewlyGeneratedCases.length} new evaluation cases in total.`
			);
		} else {
			logger.info(
				'[CurriculumGenerator] No new evaluation cases were generated in this cycle.'
			);
		}

		return allNewlyGeneratedCases;
	}

	saveGeneratedCases(casesArray, baseName = 'generated_curriculum') {
		if (!casesArray || casesArray.length === 0) return;

		const timestamp = new Date()
			.toISOString()
			.replace(/:/g, '-')
			.substring(0, 19);
		const fileName = `${baseName}_${timestamp}_${crypto.randomBytes(3).toString('hex')}.json`;
		const filePath = path.join(this.generatedCasesDir, fileName);

		try {
			fs.writeFileSync(filePath, JSON.stringify(casesArray, null, 2));
			logger.info(
				`[CurriculumGenerator] Saved ${casesArray.length} generated cases to: ${filePath}`
			);
		} catch (error) {
			logger.error(
				`[CurriculumGenerator] Error saving generated cases to ${filePath}: ${error.message}`
			);
		}
	}
}

const DEFAULT_ASSERT_CLASS = 'general_assert';
const DEFAULT_QUERY_CLASS = 'general_query';

class KeywordInputRouter {
	constructor(db) {
		if (!db) {
			throw new MCRError(
				ErrorCodes.INTERNAL_ERROR,
				'InputRouter requires a database instance.'
			);
		}
		this.db = db;
		logger.info('[InputRouter] Initialized with database instance.');
	}

	getStrategy(naturalLanguageText) {
		const nlLower = naturalLanguageText.toLowerCase();
		if (nlLower.includes('solve') || nlLower.includes('constraint')) {
			logger.info(
				'[InputRouter] "solve" or "constraint" keyword found, recommending bilevel-adaptive-assert strategy.'
			);
			return 'bilevel-adaptive-assert';
		}
		return null;
	}

	classifyInput(naturalLanguageText) {
		const nlLower = naturalLanguageText.toLowerCase();
		if (
			/\?$/.test(nlLower) ||
			[
				'who',
				'what',
				'where',
				'when',
				'why',
				'how',
				'are',
				'does',
				'do',
				'can',
				'could',
				'would',
				'should',
			].some(kw => nlLower.startsWith(kw) || nlLower.includes(` ${kw} `))
		) {
			const logText =
				naturalLanguageText.length > 50
					? naturalLanguageText.substring(0, 50) + '...'
					: naturalLanguageText;
			logger.debug(
				`[InputRouter] Classified input as '${DEFAULT_QUERY_CLASS}': "${logText}"`
			);
			return DEFAULT_QUERY_CLASS;
		}
		const logText =
			naturalLanguageText.length > 50
				? naturalLanguageText.substring(0, 50) + '...'
				: naturalLanguageText;
		logger.debug(
			`[InputRouter] Classified input as '${DEFAULT_ASSERT_CLASS}': "${logText}"`
		);
		return DEFAULT_ASSERT_CLASS;
	}

	async getBestStrategy(inputClass, llmModelId) {
		logger.debug(
			`[InputRouter] Getting best strategy for inputClass: "${inputClass}", llmModelId: "${llmModelId}"`
		);

		try {
			const targetInputType =
				inputClass === DEFAULT_ASSERT_CLASS ? 'assert' : 'query';

			const query = `
        SELECT strategy_hash, metrics, latency_ms, cost
        FROM performance_results
        WHERE (llm_model_id = ? OR llm_model_id IS NULL OR llm_model_id = '')
          AND input_type = ?;
      `;
			const relevantResults = await this.db.queryPerformanceResults(query, [
				llmModelId,
				targetInputType,
			]);

			if (!relevantResults || relevantResults.length === 0) {
				logger.info(
					`[InputRouter] No performance results found for llmModelId "${llmModelId}" (or generic) and input_type "${targetInputType}".`
				);
				return null;
			}

			const strategyScores = new Map();

			for (const row of relevantResults) {
				try {
					const metrics = JSON.parse(row.metrics);
					const cost = JSON.parse(row.cost || '{}');

					let successScore = 0;
					if (
						metrics.exactMatchProlog === 1 ||
						metrics.exactMatchProlog === true
					)
						successScore += 1;
					if (
						metrics.exactMatchAnswer === 1 ||
						metrics.exactMatchAnswer === true
					)
						successScore += 1;
					if (
						metrics.prologStructureMatch === 1 ||
						metrics.prologStructureMatch === true
					)
						successScore += 0.5;

					const latencyScore =
						row.latency_ms > 0 ? 1000 / (row.latency_ms + 1) : 1;

					const costValue = cost.input_tokens || cost.total_tokens || 0;
					const costScore = costValue > 0 ? 1000 / (costValue + 1) : 1;

					const W_SUCCESS = 100;
					const W_LATENCY = 10;
					const W_COST = 1;

					const currentScore =
						successScore * W_SUCCESS +
						latencyScore * W_LATENCY +
						costScore * W_COST;

					if (!strategyScores.has(row.strategy_hash)) {
						strategyScores.set(row.strategy_hash, {
							totalScore: 0,
							count: 0,
							totalLatency: 0,
							totalCostTokens: 0,
							successCount: 0,
						});
					}
					const agg = strategyScores.get(row.strategy_hash);
					agg.totalScore += currentScore;
					agg.count++;
					agg.totalLatency += row.latency_ms || 0;
					agg.totalCostTokens += costValue;
					if (successScore > 0) agg.successCount++;
				} catch (e) {
					logger.warn(
						`[InputRouter] Failed to parse metrics/cost for a row or calculate score: ${e.message}`,
						{ strategy_hash: row.strategy_hash, example_id: row.example_id }
					);
				}
			}

			if (strategyScores.size === 0) {
				logger.info(
					'[InputRouter] No strategies with valid scores after processing results.'
				);
				return null;
			}

			let bestStrategyHash = null;
			let maxAvgScore = -Infinity;

			strategyScores.forEach((agg, hash) => {
				const avgScore = agg.count > 0 ? agg.totalScore / agg.count : 0;
				logger.debug(
					`[InputRouter] Strategy ${hash}: Avg Score=${avgScore.toFixed(2)}, Successes=${agg.successCount}/${agg.count}, Avg Latency=${(agg.totalLatency / agg.count).toFixed(0)}ms, Avg Tokens=${(agg.totalCostTokens / agg.count).toFixed(0)}`
				);

				if (avgScore > maxAvgScore) {
					maxAvgScore = avgScore;
					bestStrategyHash = hash;
				} else if (avgScore === maxAvgScore && bestStrategyHash) {
					const currentBestAgg = strategyScores.get(bestStrategyHash);
					if (agg.successCount > currentBestAgg.successCount) {
						bestStrategyHash = hash;
					} else if (agg.successCount === currentBestAgg.successCount) {
						const avgLatency = agg.totalLatency / agg.count;
						const currentBestAvgLatency =
							currentBestAgg.totalLatency / currentBestAgg.count;
						if (avgLatency < currentBestAvgLatency) {
							bestStrategyHash = hash;
						} else if (avgLatency === currentBestAvgLatency) {
							const avgCost = agg.totalCostTokens / agg.count;
							const currentBestAvgCost =
								currentBestAgg.totalCostTokens / currentBestAgg.count;
							if (avgCost < currentBestAvgCost) {
								bestStrategyHash = hash;
							}
						}
					}
				}
			});

			if (bestStrategyHash) {
				logger.info(
					`[InputRouter] Best strategy selected: ${bestStrategyHash} with average score ${maxAvgScore.toFixed(2)} for inputClass "${inputClass}", llmModelId "${llmModelId}"`
				);
			} else {
				logger.info(
					`[InputRouter] No best strategy found after aggregation for inputClass "${inputClass}", llmModelId "${llmModelId}".`
				);
			}
			return bestStrategyHash;
		} catch (error) {
			logger.error(
				`[InputRouter] Error getting best strategy: ${error.message}`,
				{ stack: error.stack }
			);
			return null;
		}
	}

	async route(naturalLanguageText, llmModelId) {
		logger.info(
			`[InputRouter] Routing input: "${naturalLanguageText}", Model: "${llmModelId}"`
		);
		if (!naturalLanguageText || !llmModelId) {
			logger.warn(
				'[InputRouter] Route called with missing naturalLanguageText or llmModelId.'
			);
			return null;
		}

		const inputClass = this.classifyInput(naturalLanguageText);
		const strategyHash = await this.getBestStrategy(inputClass, llmModelId);

		if (strategyHash) {
			logger.info(
				`[InputRouter] Recommended strategy ID: ${strategyHash} for input class "${inputClass}"`
			);
		} else {
			logger.info(
				`[InputRouter] No specific strategy recommendation. Fallback will be used.`
			);
		}
		return strategyHash;
	}
}

class OptimizationCoordinator {
	constructor(mcrService) {
		this.mcrService = mcrService;
		this.config = mcrService.config;
		this.evaluator = new Evaluator(
			this.config.evalCasesPath || 'src/evalCases'
		);
	}

	async bootstrap() {
		logger.info('[Optimizer] Starting bootstrap phase...');
		try {
			logger.info(
				'[Optimizer] Running evaluator to establish baseline performance data for all strategies...'
			);
			await this.evaluator.run();
			logger.info(
				'[Optimizer] Bootstrap phase completed. Performance database should be populated.'
			);
		} catch (error) {
			logger.error(`[Optimizer] Error during bootstrap: ${error.message}`, {
				stack: error.stack,
			});
			throw error;
		}
	}

	async selectStrategyForEvolution() {
		logger.info('[Optimizer] Selecting strategy for evolution...');
		try {
			const db = await initDb();
			const rows = await new Promise((resolve, reject) => {
				const query = `
          SELECT strategy_hash, AVG(json_extract(metrics, '$.exactMatchProlog')) as avg_exactMatchProlog
          FROM performance_results
          WHERE json_extract(metrics, '$.exactMatchProlog') IS NOT NULL
          GROUP BY strategy_hash
          ORDER BY avg_exactMatchProlog ASC
          LIMIT 1;
        `;
				db.all(query, [], (err, rows) => {
					if (err) {
						logger.error(
							`[Optimizer] Error querying performance_results for strategy selection: ${err.message}`
						);
						return reject(err);
					}
					resolve(rows);
				});
			});

			if (rows && rows.length > 0) {
				const selectedStrategyHash = rows[0].strategy_hash;
				logger.info(
					`[Optimizer] Selected strategy hash for evolution: ${selectedStrategyHash} (avg exactMatchProlog: ${rows[0].avg_exactMatchProlog})`
				);
				const availableStrategies = strategyManager.getAvailableStrategies();
				let foundStrategy = null;
				const crypto = require('crypto');
				for (const stratInfo of availableStrategies) {
					const strategyJson = strategyManager.getStrategy(stratInfo.id);
					if (strategyJson) {
						const currentStrategyHash = crypto
							.createHash('sha256')
							.update(JSON.stringify(strategyJson))
							.digest('hex');
						if (currentStrategyHash === selectedStrategyHash) {
							foundStrategy = strategyJson;
							break;
						}
					}
				}
				if (foundStrategy) {
					logger.info(
						`[Optimizer] Found strategy definition for hash ${selectedStrategyHash}: ID ${foundStrategy.id}`
					);
					return foundStrategy;
				} else {
					logger.warn(
						`[Optimizer] Could not find strategy definition for selected hash ${selectedStrategyHash}.`
					);
					return null;
				}
			} else {
				logger.warn(
					'[Optimizer] No suitable strategy found for evolution based on current criteria.'
				);
				return null;
			}
		} catch (error) {
			logger.error(`[Optimizer] Error selecting strategy: ${error.message}`, {
				stack: error.stack,
			});
			return null;
		}
	}

	async evolveStrategy(strategyJson) {
		if (!strategyJson) {
			logger.warn(
				'[Optimizer] No strategy JSON provided to evolve. Skipping evolution step.'
			);
			return null;
		}
		logger.info(`[Optimizer] Evolving strategy: ${strategyJson.id}`);
		logger.warn(
			'[Optimizer] StrategyEvolver not yet implemented. Returning null.'
		);
		return null;
	}

	async generateNewCurriculum() {
		logger.info('[Optimizer] Generating new curriculum...');
		logger.warn(
			'[Optimizer] CurriculumGenerator not yet implemented. Returning empty array.'
		);
		return [];
	}

	async evaluateStrategy(strategyJson) {
		if (!strategyJson) {
			logger.warn(
				'[Optimizer] No strategy JSON provided to evaluate. Skipping evaluation.'
			);
			return;
		}
		logger.info(`[Optimizer] Evaluating strategy: ${strategyJson.id}`);
		const tempStrategyDir = 'strategies/generated';
		const fs = require('fs');
		const path = require('path');
		if (!fs.existsSync(tempStrategyDir)) {
			fs.mkdirSync(tempStrategyDir, { recursive: true });
		}
		const tempStrategyPath = path.join(
			tempStrategyDir,
			`${strategyJson.id}.json`
		);
		fs.writeFileSync(tempStrategyPath, JSON.stringify(strategyJson, null, 2));
		logger.info(
			`[Optimizer] Temporarily saved evolved strategy to ${tempStrategyPath}`
		);
		strategyManager.loadStrategies();
		const singleStrategyEvaluator = new Evaluator(
			this.config.evalCasesPath || 'src/evalCases',
			[strategyJson.id]
		);
		try {
			logger.info(
				`[Optimizer] Running evaluator for new strategy ${strategyJson.id}...`
			);
			await singleStrategyEvaluator.run();
			logger.info(`[Optimizer] Evaluation of ${strategyJson.id} completed.`);
		} catch (error) {
			logger.error(
				`[Optimizer] Error evaluating strategy ${strategyJson.id}: ${error.message}`,
				{ stack: error.stack }
			);
		} finally {
			try {
				fs.unlinkSync(tempStrategyPath);
				logger.info(
					`[Optimizer] Cleaned up temporary strategy file: ${tempStrategyPath}`
				);
			} catch (cleanupError) {
				logger.warn(
					`[Optimizer] Could not clean up temporary strategy file ${tempStrategyPath}: ${cleanupError.message}`
				);
			}
			strategyManager.loadStrategies();
		}
	}

	async optimizeInLoop(strategy, inputCases) {
		const session = await this.mcrService.createSession();
		const results = [];
		for (const inputCase of inputCases) {
			const loopResult = await this.mcrService._refineLoop(
				async input => {
					const res = await this.mcrService.assertNLToSession(
						session.id,
						input
					);
					return res.addedFacts;
				},
				inputCase.nl,
				{ session, embeddingBridge: this.mcrService.embeddingBridge }
			);

			const metrics = await this.evaluator.evaluate(
				loopResult.result,
				inputCase.expected
			);

			results.push({
				...loopResult,
				metrics,
			});
		}
		await this.mcrService.deleteSession(session.id);
		return results;
	}

	async runIteration() {
		logger.info('[Optimizer] Starting new evolution iteration...');
		const strategyToEvolve = await this.selectStrategyForEvolution();
		if (!strategyToEvolve) {
			logger.warn(
				'[Optimizer] No strategy selected for evolution. Ending iteration.'
			);
			return false;
		}
		const evolvedStrategy = await this.evolveStrategy(strategyToEvolve);
		if (!evolvedStrategy) {
			logger.warn(
				'[Optimizer] Strategy evolution did not produce a new strategy. Ending iteration.'
			);
			return true;
		}
		await this.evaluateStrategy(evolvedStrategy);
		logger.info('[Optimizer] Evolution iteration completed.');
		return true;
	}

	async start(iterations = 1) {
		logger.info(
			`[Optimizer] Starting optimization process for ${iterations} iteration(s).`
		);
		await initDb();
		if (this.config.bootstrapOnly) {
			await this.bootstrap();
			logger.info(
				'[Optimizer] BootstrapOnly flag set. Exiting after bootstrap.'
			);
			await closeDb();
			return;
		}
		if (this.config.runBootstrap) {
			await this.bootstrap();
		}
		for (let i = 0; i < iterations; i++) {
			logger.info(`[Optimizer] === Iteration ${i + 1} of ${iterations} ===`);
			const continueLoop = await this.runIteration();
			if (!continueLoop) {
				logger.info(
					'[Optimizer] Optimization loop conditions not met to continue. Stopping.'
				);
				break;
			}
		}
		logger.info('[Optimizer] Optimization process finished.');
		await closeDb();
	}
}

class StrategyEvolver {
	constructor(config = {}) {
		this.config = config;
	}

	selectNodeForMutation(strategyJson) {
		if (!strategyJson || !Array.isArray(strategyJson.nodes)) {
			logger.warn(
				'[StrategyEvolver] Invalid strategy JSON or no nodes array found.'
			);
			return null;
		}
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

	async getFailingExamples(strategyHash, limit = 3) {
		logger.info(
			`[StrategyEvolver] Fetching failing examples for strategy hash: ${strategyHash}`
		);
		try {
			const db = await initDb();
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

			const { loadAllEvalCases } = require('./evalCases/baseEvals');
			const allEvalCases = loadAllEvalCases();
			const evalCaseMap = new Map(allEvalCases.map(ec => [ec.id, ec]));

			const enrichedExamples = rows
				.map(row => {
					const evalCase = evalCaseMap.get(row.example_id);
					if (evalCase) {
						return {
							exampleId: row.example_id,
							naturalLanguageInput: evalCase.naturalLanguageInput,
							expectedOutput:
								evalCase.expectedProlog || evalCase.expectedAnswer,
							actualOutput: row.raw_output,
							metrics: JSON.parse(row.metrics),
						};
					}
					return null;
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

	async critiqueAndRewritePrompt(
		originalPromptContent,
		failingExamples,
		promptGoal = 'Translate natural language to a specific structured format.'
	) {
		if (failingExamples.length === 0) {
			logger.info(
				'[StrategyEvolver] No failing examples provided for critique. Cannot rewrite prompt.'
			);
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

		const engine = new MCREngine();
		const critiquePromptTemplate = prompts.CRITIQUE_AND_REWRITE_PROMPT;
		if (!critiquePromptTemplate) {
			logger.error(
				'[StrategyEvolver] CRITIQUE_AND_REWRITE_PROMPT template not found in prompts.js. Cannot proceed.'
			);
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
			const rewrittenPrompt = await engine.callLLM(
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
			const llmResponse = await engine.callLLM(systemPrompt, userPrompt);
			if (llmResponse) {
				logger.info('[StrategyEvolver] LLM returned rewritten prompt.');
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

	createEvolvedStrategyJson(
		originalStrategyJson,
		targetNodeId,
		newPromptContent
	) {
		const newStrategy = JSON.parse(JSON.stringify(originalStrategyJson));

		const evolutionSuffix = `_evo_${crypto.randomBytes(4).toString('hex')}`;
		newStrategy.id = `${originalStrategyJson.id}${evolutionSuffix}`;
		newStrategy.name = `${originalStrategyJson.name} (Evolved ${new Date().toISOString().substring(0, 10)})`;
		newStrategy.description = `Evolved version of ${originalStrategyJson.id}. Original description: ${originalStrategyJson.description || ''}`;
		newStrategy.source_strategy_hash = crypto
			.createHash('sha256')
			.update(JSON.stringify(originalStrategyJson))
			.digest('hex');

		const nodeToUpdate = newStrategy.nodes.find(
			node => node.id === targetNodeId
		);
		if (!nodeToUpdate) {
			logger.error(
				`[StrategyEvolver] Node ${targetNodeId} not found in new strategy copy. This should not happen.`
			);
			return null;
		}

		const newPromptTemplateName = `evo_${originalStrategyJson.id}_${targetNodeId}_${crypto.randomBytes(4).toString('hex')}`;
		addOrUpdatePromptTemplate(newPromptTemplateName, {
			name: newPromptTemplateName,
			description: `Evolved prompt for strategy ${newStrategy.id}, node ${targetNodeId}`,
			system: '',
			user: newPromptContent,
			tags: ['evolved', originalStrategyJson.id],
			isDynamic: true,
		});
		nodeToUpdate.prompt_template_name = newPromptTemplateName;
		logger.info(
			`[StrategyEvolver] Updated node ${targetNodeId} to use new dynamic prompt template: ${newPromptTemplateName}`
		);

		return newStrategy;
	}

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
			logger.error(
				`[StrategyEvolver] Could not retrieve original prompt content for template: ${originalPromptTemplateName}`
			);
			return null;
		}
		const originalPromptContent = originalPromptObject.user;
		const promptGoal =
			originalPromptObject.description ||
			`Goal for prompt template ${originalPromptTemplateName}`;

		const failingExamples = await this.getFailingExamples(originalStrategyHash);
		if (failingExamples.length === 0) {
			logger.info(
				'[StrategyEvolver] No failing examples found for this strategy. Iterative critique cannot proceed effectively without them.'
			);
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
		if (method === 'IterativeCritique') {
			return this.evolveIterativeCritique(strategyJson);
		} else {
			logger.warn(`[StrategyEvolver] Unknown evolution method: ${method}`);
			return null;
		}
	}
}

function generateCurriculum(cases) {
	const curriculumGenerator = new CurriculumGenerator();
	return curriculumGenerator.generate();
}

function selectStrategy(input, perfData) {
	const keywordInputRouter = new KeywordInputRouter(perfData.db);
	return keywordInputRouter.route(input, perfData.llmModelId);
}

function optimizeStrategies() {
	const optimizationCoordinator = new OptimizationCoordinator();
	return optimizationCoordinator.start();
}

function mutateStrategy(name, examples) {
	const strategyEvolver = new StrategyEvolver();
	return strategyEvolver.evolve(name, examples);
}

module.exports = {
	generateCurriculum,
	selectStrategy,
	optimizeStrategies,
	mutateStrategy,
	CurriculumGenerator,
	KeywordInputRouter,
	OptimizationCoordinator,
	StrategyEvolver,
};
