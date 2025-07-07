// src/evolution/optimizer.js
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const logger = require('../logger');
const strategyManager = require('../strategyManager');
const { Evaluator } = require('../evaluator'); // Assuming Evaluator class is exported
const { initDb, closeDb, DB_PATH } = require('../database'); // Assuming DB_PATH is exported for direct queries if needed
const sqlite3 = require('sqlite3').verbose();
// Placeholder for StrategyEvolver and CurriculumGenerator
// const StrategyEvolver = require('./strategyEvolver');
// const CurriculumGenerator = require('./curriculumGenerator');

class OptimizationCoordinator {
  constructor(config = {}) {
    this.config = config;
    // this.strategyEvolver = new StrategyEvolver();
    // this.curriculumGenerator = new CurriculumGenerator();
    this.evaluator = new Evaluator(config.evalCasesPath || 'src/evalCases'); // Use default path
  }

  async bootstrap() {
    logger.info('[Optimizer] Starting bootstrap phase...');
    // This method should run all pre-defined strategies against the existing evaluation curriculum
    // to establish a baseline in the Performance Database.
    // It leverages the Evaluator for this.
    try {
      // The Evaluator, when run without specific strategies, runs all available ones.
      // We might need to ensure it's configured correctly (e.g., not to filter by specific tags unless intended for bootstrap)
      logger.info(
        '[Optimizer] Running evaluator to establish baseline performance data for all strategies...'
      );
      await this.evaluator.run(); // evaluator.run() already handles DB init/close and evaluation
      logger.info(
        '[Optimizer] Bootstrap phase completed. Performance database should be populated.'
      );
    } catch (error) {
      logger.error(`[Optimizer] Error during bootstrap: ${error.message}`, {
        stack: error.stack,
      });
      throw error; // Re-throw to be caught by the main execution logic
    }
  }

  async selectStrategyForEvolution() {
    logger.info('[Optimizer] Selecting strategy for evolution...');
    // Query the database to select a strategy.
    // Initial simple criteria: select a strategy with the lowest average success on 'exactMatchProlog',
    // or one that has a high number of errors.
    // This requires direct DB querying.

    try {
      const db = await initDb(); // Ensure DB is initialized and get the instance

      // Example query: Find strategy with the lowest average exactMatchProlog score
      // This is a simplified query. A more robust one would average scores per strategy_hash.
      // For simplicity, let's find a strategy that has at least one failing 'exactMatchProlog'
      // and pick one of those, or one with a high error count (TODO)
      const rows = await new Promise((resolve, reject) => {
        // Find strategies that have at least one non-passing exactMatchProlog metric
        // and have been run on at least one example.
        // We also need to get the strategy definition later, so strategy_hash is key.
        const query = `
                    SELECT strategy_hash, AVG(json_extract(metrics, '$.exactMatchProlog')) as avg_exactMatchProlog
                    FROM performance_results
                    WHERE json_extract(metrics, '$.exactMatchProlog') IS NOT NULL
                    GROUP BY strategy_hash
                    ORDER BY avg_exactMatchProlog ASC
                    LIMIT 1;
                `;
        // Alternative: Count failures
        // SELECT strategy_hash, COUNT(*) as failure_count
        // FROM performance_results
        // WHERE json_extract(metrics, '$.exactMatchProlog') = 0 -- Assuming 0 is false
        // GROUP BY strategy_hash
        // ORDER BY failure_count DESC
        // LIMIT 1;

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

        // Now we need to get the strategy definition (JSON) for this hash.
        // The performance_results table does not store the strategy JSON itself.
        // We need to iterate through loaded strategies from strategyManager and find the one matching the hash.
        // This requires strategyManager to be able to provide strategy JSONs and for us to hash them.
        // For now, let's assume we can retrieve it by ID if the hash was derived from a known, loaded strategy.
        // This is a gap: strategy_hash in DB needs to be reliably linked back to a retrievable strategy definition.
        // For now, we'll find a strategy from strategyManager and use its ID, then get its JSON.
        // This isn't ideal as the hash is the ground truth.
        // A better way: store strategy JSONs alongside their hashes, or have a way to get JSON from hash.

        const availableStrategies = strategyManager.getAvailableStrategies(); // [{id, name}]
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
            `[Optimizer] Could not find strategy definition for selected hash ${selectedStrategyHash}. This may happen if the strategy was dynamically generated and not in the initial set, or if hashing methods differ.`
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
      return null; // Or rethrow if critical
    } finally {
      // closeDb(); // Optimizer might run other DB operations, so close at the end of its lifecycle.
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
    // Placeholder for StrategyEvolver invocation
    // const evolvedStrategy = await this.strategyEvolver.evolve(strategyJson);
    // logger.info(`[Optimizer] Evolution complete. New strategy ID (if any): ${evolvedStrategy ? evolvedStrategy.id : 'None'}`);
    // return evolvedStrategy;
    logger.warn(
      '[Optimizer] StrategyEvolver not yet implemented. Returning null.'
    );
    return null;
  }

  async generateNewCurriculum(currentStrategy = null, failingCases = null) {
    logger.info('[Optimizer] Generating new curriculum...');
    // Placeholder for CurriculumGenerator invocation
    // const newCases = await this.curriculumGenerator.generate(currentStrategy, failingCases);
    // logger.info(`[Optimizer] Curriculum generation complete. New cases generated: ${newCases ? newCases.length : 0}`);
    // return newCases;
    logger.warn(
      '[Optimizer] CurriculumGenerator not yet implemented. Returning empty array.'
    );
    return [];
  }

  async evaluateStrategy(strategyJson, curriculumCases = null) {
    if (!strategyJson) {
      logger.warn(
        '[Optimizer] No strategy JSON provided to evaluate. Skipping evaluation.'
      );
      return;
    }
    logger.info(`[Optimizer] Evaluating strategy: ${strategyJson.id}`);
    // The evaluator needs a strategy ID and can run on specific cases.
    // However, the current Evaluator loads strategies via strategyManager and runs them by ID.
    // To evaluate a dynamically generated strategy, we might need to:
    // 1. Save the new strategyJson to a temporary file in the strategies/ folder, reload strategyManager, then run evaluator.
    // 2. Modify Evaluator to accept a strategy JSON object directly.
    // Option 1 is simpler for now if strategyManager can easily reload.

    // For now, assume strategyManager needs to know about the strategy.
    // This is a temporary measure. Ideally, Evaluator could take a strategy object.
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

    // Reload strategies in strategyManager
    strategyManager.loadStrategies(); // This will pick up the new strategy from the generated folder

    // Now, run the evaluator for this specific strategy
    // The Evaluator constructor takes (evaluationCasesPath, selectedStrategies = [], selectedTags = [])
    // We need a way to point it to specific cases if curriculumCases is provided.
    // For now, let's assume it runs on all cases in its configured path, filtered by the strategy ID.

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
      // Clean up the temporary strategy file
      try {
        fs.unlinkSync(tempStrategyPath);
        logger.info(
          `[Optimizer] Cleaned up temporary strategy file: ${tempStrategyPath}`
        );
        // Potentially remove the generated directory if empty, or leave for inspection.
      } catch (cleanupError) {
        logger.warn(
          `[Optimizer] Could not clean up temporary strategy file ${tempStrategyPath}: ${cleanupError.message}`
        );
      }
      // Reload strategies again to remove the temporary one from manager's list if it's not persisted by evolver
      strategyManager.loadStrategies();
    }
  }

  async runIteration() {
    logger.info('[Optimizer] Starting new evolution iteration...');

    const strategyToEvolve = await this.selectStrategyForEvolution();
    if (!strategyToEvolve) {
      logger.warn(
        '[Optimizer] No strategy selected for evolution. Ending iteration.'
      );
      return false; // Indicates no further work or loop should stop
    }

    const evolvedStrategy = await this.evolveStrategy(strategyToEvolve);
    if (!evolvedStrategy) {
      logger.warn(
        '[Optimizer] Strategy evolution did not produce a new strategy. Ending iteration.'
      );
      // Potentially try evolving a different strategy or use a different mutation.
      return true; // Continue loop, but this iteration didn't yield
    }

    // For now, new curriculum generation is not tied to the evolved strategy directly.
    // It could be run independently or based on broader analysis.
    // const newEvaluationCases = await this.generateNewCurriculum(evolvedStrategy);
    // If new cases are generated, they should be saved to a known location for the evaluator.
    // For now, evaluator will run on existing cases.

    await this.evaluateStrategy(evolvedStrategy);

    logger.info('[Optimizer] Evolution iteration completed.');
    return true; // Indicates loop should continue
  }

  async start(iterations = 1) {
    logger.info(
      `[Optimizer] Starting optimization process for ${iterations} iteration(s).`
    );
    await initDb(); // Ensure DB is up for the whole process

    if (this.config.bootstrapOnly) {
      await this.bootstrap();
      logger.info(
        '[Optimizer] BootstrapOnly flag set. Exiting after bootstrap.'
      );
      await closeDb();
      return;
    }

    if (this.config.runBootstrap) {
      // Separate flag for explicit bootstrap before iterations
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
  const argv = yargs(hideBin(process.argv))
    .option('iterations', {
      alias: 'i',
      type: 'number',
      description: 'Number of evolution cycles to run.',
      default: 1,
    })
    .option('bootstrapOnly', {
      type: 'boolean',
      description: 'Only run the bootstrap/baselining step and exit.',
      default: false,
    })
    .option('runBootstrap', {
      type: 'boolean',
      description:
        'Run bootstrap before starting iterations (if not bootstrapOnly).',
      default: false, // Default to false to avoid re-bootstrapping if data exists
    })
    .option('evalCasesPath', {
      alias: 'p',
      type: 'string',
      description: 'Path to the directory containing evaluation case files.',
      default: 'src/evalCases', // Default path for evaluator
    })
    .help().argv;

  logger.info('[OptimizerCLI] Starting MCR Optimization Coordinator...');
  logger.info(
    `[OptimizerCLI] Config: Iterations=${argv.iterations}, BootstrapOnly=${argv.bootstrapOnly}, RunBootstrap=${argv.runBootstrap}, EvalCasesPath=${argv.evalCasesPath}`
  );

  const optimizer = new OptimizationCoordinator({
    bootstrapOnly: argv.bootstrapOnly,
    runBootstrap: argv.runBootstrap,
    evalCasesPath: argv.evalCasesPath,
  });

  try {
    await optimizer.start(argv.iterations);
    logger.info(
      '[OptimizerCLI] Optimization Coordinator finished successfully.'
    );
  } catch (error) {
    logger.error(
      `[OptimizerCLI] Critical error in Optimization Coordinator: ${error.message}`,
      { stack: error.stack }
    );
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = OptimizationCoordinator;
