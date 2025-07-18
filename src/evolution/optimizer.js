// src/evolution/optimizer.js
const logger = require('../util/logger');
const strategyManager = require('../strategyManager');
const { Evaluator } = require('../evaluation/metrics');
const { initDb, closeDb } = require('../store/database');
const MCREngine = require('../mcrEngine');

class OptimizationCoordinator {
	constructor(mcrService) {
		this.mcrService = mcrService;
		this.config = mcrService.config;
		this.evaluator = new Evaluator(this.config.evalCasesPath || 'src/evalCases');
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
					const res = await this.mcrService.assertNLToSession(session.id, input);
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

async function main() {
	// Yargs removed to avoid ESM issue in Jest
}

if (require.main === module) {
	main();
}

module.exports = OptimizationCoordinator;
