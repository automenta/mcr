// src/evaluator.js
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const { apiClient } = require('./cli/api'); // Using CLI's apiClient for convenience
const strategyManager = require('./strategyManager'); // To get strategy instances
const logger = require('./logger'); // General logger
const { demoLogger } = require('./demos/demoUtils'); // For colorful output, similar to demo.js
const { checkAndStartServer } = require('./cliUtils');
const config = require('./config');
const crypto = require('crypto'); // For SHA-256 hashing
// yargs and hideBin will be imported dynamically in main
const llmServiceModule = require('./llmService'); // For semantic similarity metric generate function
const { prompts, fillTemplate } = require('./prompts');
const { initDb, insertPerformanceResult, closeDb } = require('./database'); // Import database functions
const { loadAllEvalCases } = require('./evalCases/baseEvals'); // MOVED HERE

// --- Evaluation Case Structure ---
/**
 * @typedef {Object} EvaluationCase
 * @property {string} id - Unique identifier for the case.
 * @property {string} description - Description of the test case.
 * @property {string} naturalLanguageInput - The NL input for assertion or query.
 * @property {'assert' | 'query'} inputType - Type of input.
 * @property {string | string[]} expectedProlog - Expected Prolog translation.
 * @property {string | object} [expectedAnswer] - Expected NL answer or structured result (for queries).
 * @property {string[]} [metrics] - Array of metric names to apply (e.g., ['exactMatchProlog', 'exactMatchAnswer']).
 * @property {string} [notes] - Optional notes about the case.
 * @property {string[]} [tags] - Optional tags for categorizing/filtering cases.
 * @property {string} [sessionId] - Optional: if set, evaluator will use this session ID, otherwise creates one per strategy.
 */

// --- Metrics Implementation ---
const metrics = {
  /**
   * Checks for exact match of generated Prolog with expected Prolog.
   * For arrays, order matters and content must be identical.
   * @param {string | string[]} actualProlog - Generated Prolog.
   * @param {string | string[]} expectedProlog - Expected Prolog.
   * @returns {boolean} True if exact match.
   */
  exactMatchProlog: (actualProlog, expectedProlog) => {
    if (typeof actualProlog !== typeof expectedProlog) return false;
    if (Array.isArray(actualProlog)) {
      if (actualProlog.length !== expectedProlog.length) return false;
      // Normalize by sorting if order doesn't matter, but for now, order matters.
      // To make order not matter: return actualProlog.slice().sort().join('') === expectedProlog.slice().sort().join('');
      return actualProlog.every((val, index) => val === expectedProlog[index]);
    }
    return actualProlog === expectedProlog;
  },

  /**
   * Checks for exact match of the natural language answer (for queries).
   * @param {string} actualAnswer - Generated NL answer.
   * @param {string} expectedAnswer - Expected NL answer.
   * @returns {boolean} True if exact match.
   */
  exactMatchAnswer: (actualAnswer, expectedAnswer) => {
    if (typeof actualAnswer !== 'string' || typeof expectedAnswer !== 'string')
      return false;
    return actualAnswer.trim() === expectedAnswer.trim();
  },

  /**
   * Normalizes Prolog code for comparison.
   * - Removes comments
   * - Standardizes whitespace around operators and parentheses
   * - Sorts terms in a conjunction (if top-level and order doesn't strictly matter) - this is complex, start simple.
   * - Standardizes variable names (e.g., _Var0, _Var1) - this is also complex.
   * For now, focuses on comment removal and whitespace normalization.
   * @param {string | string[]} prologCode - Prolog code.
   * @returns {string | string[]} Normalized Prolog code.
   */
  normalizeProlog: (prologCode) => {
    const normalizeSingle = (code) => {
      if (typeof code !== 'string') return code;
      // Remove comments
      let norm = code.replace(/%.*?\n/g, '\n').replace(/%.*?$/, '');
      // Standardize whitespace: remove leading/trailing, collapse multiple spaces, space around operators
      norm = norm.trim().replace(/\s+/g, ' ');
      norm = norm.replace(/\s*([(),.:-])\s*/g, '$1'); // Space around operators, commas, parentheses
      norm = norm.replace(/([(),.:-])\s*([(),.:-])/g, '$1$2'); // Remove space between consecutive operators
      return norm;
    };

    if (Array.isArray(prologCode)) {
      return prologCode.map(normalizeSingle);
    }
    return normalizeSingle(prologCode);
  },

  /**
   * Checks for structural match of Prolog code after normalization.
   * @param {string | string[]} actualProlog - Generated Prolog.
   * @param {string | string[]} expectedProlog - Expected Prolog.
   * @returns {boolean} True if normalized versions match.
   */
  prologStructureMatch: (actualProlog, expectedProlog) => {
    const normActual = metrics.normalizeProlog(actualProlog);
    const normExpected = metrics.normalizeProlog(expectedProlog);
    return metrics.exactMatchProlog(normActual, normExpected); // Reuse exactMatch for normalized strings
  },

  /**
   * Checks for semantic similarity of natural language answers using an LLM.
   * @async
   * @param {string} actualAnswer - Generated NL answer.
   * @param {string} expectedAnswer - Expected NL answer.
   * @param {LlmService} llmService - Instance of LlmService.
   * @param {string} originalQuestion - The original question, for context.
   * @returns {Promise<boolean>} True if answers are deemed semantically similar by the LLM.
   */
  semanticSimilarityAnswer: async (
    actualAnswer,
    expectedAnswer,
    llmGenerateFunc,
    originalQuestion = ''
  ) => {
    if (
      typeof actualAnswer !== 'string' ||
      typeof expectedAnswer !== 'string' ||
      typeof llmGenerateFunc !== 'function'
    ) {
      logger.error(
        'semanticSimilarityAnswer called with invalid arguments or missing llmGenerateFunc.'
      );
      return false;
    }
    if (actualAnswer.trim() === expectedAnswer.trim()) return true; // Exact match is semantically similar

    if (!prompts.SEMANTIC_SIMILARITY_CHECK) {
      logger.error('Semantic similarity check prompt not found!');
      return false;
    }
    const systemPrompt = prompts.SEMANTIC_SIMILARITY_CHECK.system;
    const userPrompt = fillTemplate(prompts.SEMANTIC_SIMILARITY_CHECK.user, {
      text1: expectedAnswer,
      text2: actualAnswer,
      context: originalQuestion
        ? `The original question was: "${originalQuestion}"`
        : 'No specific question context provided.',
    });

    try {
      const response = await llmGenerateFunc(systemPrompt, userPrompt);
      logger.debug(`Semantic similarity LLM response: ${response}`);
      // Expecting LLM to output "SIMILAR" or "DIFFERENT" (or parse a JSON if prompt asks for it)
      // For now, simple string check, case-insensitive.
      return response.trim().toLowerCase().startsWith('similar');
    } catch (error) {
      logger.error(`Error during semantic similarity check: ${error.message}`);
      return false;
    }
  },
};

class Evaluator {
  constructor(evaluationCasesPath, selectedStrategies = [], selectedTags = []) {
    this.evaluationCasesPath = evaluationCasesPath;
    this.selectedStrategies = selectedStrategies;
    this.selectedTags = selectedTags;
    this.evaluationCases = [];
    this.results = [];
    this.apiBaseUrl = `http://${config.server.host}:${config.server.port}/api/v1`;
    this.llmGenerate = llmServiceModule.generate; // Store the generate function for metrics
  }

  // loadEvaluationCases is now correctly defined within the class
  loadEvaluationCases() {
    demoLogger.info(
      'Loading evaluation cases recursively from root:',
      this.evaluationCasesPath
    );
    let allLoadedCases = [];
    try {
      // Use the recursive loader function
      allLoadedCases = loadAllEvalCases(this.evaluationCasesPath);
      // The loadAllEvalCases function already logs details, so some demoLogger messages might be redundant
      // but it's fine to keep for evaluator-specific logging flow.
      demoLogger.info(
        `Total evaluation cases loaded (recursively) before filtering: ${allLoadedCases.length}`
      );

      // Filter by tags if any are selected
      if (this.selectedTags.length > 0) {
        demoLogger.info(
          `Filtering cases by tags: ${this.selectedTags.join(', ')}`
        );
        this.evaluationCases = allLoadedCases.filter(
          (ec) =>
            ec.tags && ec.tags.some((tag) => this.selectedTags.includes(tag))
        );
        demoLogger.info(
          `Cases after tag filtering: ${this.evaluationCases.length}`
        );
      } else {
        this.evaluationCases = allLoadedCases;
      }

      if (this.evaluationCases.length === 0) {
        const message =
          this.selectedTags.length > 0
            ? 'No evaluation cases found matching the selected tags from the provided path.'
            : "No evaluation cases found. Please ensure case files exist in the specified directory (including subdirectories like 'generated').";
        demoLogger.error(message);
        // Consider not exiting process here, but letting the run method handle it or return a status
        // For now, keeping original behavior of exiting.
        process.exit(1);
      }
    } catch (error) {
      // loadAllEvalCases itself logs errors during its process.
      // This catch block is for any unexpected error from loadAllEvalCases or during filtering.
      demoLogger.error(
        'Failed to load or process evaluation cases:',
        error.message
      );
      logger.error(
        'Stack trace for case loading/processing failure in Evaluator:',
        error
      );
      process.exit(1);
    }
  }

  async createSession(strategyName) {
    demoLogger.step(`Creating session for strategy ${strategyName}...`);
    try {
      const axios = (await import('axios')).default;
      const response = await axios.post(
        `${this.apiBaseUrl}/sessions`,
        {},
        { timeout: 5000 }
      ); // 5s timeout
      demoLogger.success(
        `Session created: ${response.data.id} for strategy ${strategyName}`
      );
      return response.data.id;
    } catch (error) {
      demoLogger.error(
        `Failed to create session for ${strategyName}:`,
        error.message
      );
      return null;
    }
  }

  async deleteSession(sessionId, strategyName) {
    if (!sessionId) return;
    demoLogger.cleanup(
      `Deleting session ${sessionId} for strategy ${strategyName}...`
    );
    try {
      const axios = (await import('axios')).default;
      await axios.delete(`${this.apiBaseUrl}/sessions/${sessionId}`, {
        timeout: 5000,
      }); // 5s timeout
      demoLogger.success(`Session ${sessionId} deleted.`);
    } catch (error) {
      demoLogger.error(`Failed to delete session ${sessionId}:`, error.message);
    }
  }

  async run() {
    demoLogger.heading('MCR Evaluation System');
    this.loadEvaluationCases();

    try {
      await initDb(); // Initialize database connection
    } catch (dbError) {
      demoLogger.error(
        `Failed to initialize database: ${dbError.message}. Evaluation aborted.`
      );
      logger.error('Stack trace for DB initialization failure:', dbError);
      return; // Stop if DB can't be initialized
    }

    const serverReady = await checkAndStartServer();
    if (!serverReady) {
      demoLogger.error(
        'Evaluation aborted: MCR server is not running or could not be started.'
      );
      await this.cleanupDb(); // Close DB connection if server fails
      return;
    }

    let availableStrategyInfo = strategyManager.getAvailableStrategies(); // Returns [{id: '...', name: '...'}]
    if (!availableStrategyInfo || availableStrategyInfo.length === 0) {
      demoLogger.error(
        'No translation strategies found by StrategyManager. Aborting evaluation.'
      );
      await this.cleanupDb();
      return;
    }

    let strategiesToRunDetails = availableStrategyInfo;

    if (this.selectedStrategies.length > 0) {
      strategiesToRunDetails = availableStrategyInfo.filter((s) =>
        this.selectedStrategies.includes(s.id)
      );
      demoLogger.info(
        'Running evaluation for selected strategies:',
        strategiesToRunDetails.map((s) => s.id).join(', ')
      );
      if (strategiesToRunDetails.length === 0) {
        demoLogger.error(
          'None of the selected strategies are available. Aborting evaluation.'
        );
        await this.cleanupDb();
        return;
      }
    } else {
      demoLogger.info(
        'Available strategies for evaluation (running all):',
        strategiesToRunDetails.map((s) => s.id).join(', ')
      );
    }

    for (const strategyInfo of strategiesToRunDetails) {
      const strategyName = strategyInfo.id; // Use ID for consistency
      const strategyInstance = strategyManager.getStrategy(strategyName); // This gets the JSON object

      if (!strategyInstance) {
        demoLogger.warn(
          `Could not get instance for strategy ${strategyName}. Skipping.`
        );
        continue;
      }
      demoLogger.heading(
        `Evaluating Strategy: ${strategyName} (${strategyInstance.name})`
      );

      // Generate strategy hash
      let strategyHash = 'unknown_hash';
      try {
        const strategyJsonString = JSON.stringify(strategyInstance);
        strategyHash = crypto
          .createHash('sha256')
          .update(strategyJsonString)
          .digest('hex');
        demoLogger.info(`Strategy SHA256 Hash: ${strategyHash}`);
      } catch (hashError) {
        demoLogger.error(
          `Error generating SHA256 hash for strategy ${strategyName}: ${hashError.message}`
        );
        // Continue with a placeholder hash, or skip? For now, continue.
      }

      // Set this strategy as active on the server for this batch of tests
      try {
        demoLogger.info(
          `Setting active strategy on server to: ${strategyName}`
        );
        const axios = (await import('axios')).default;
        // The API expects the strategy ID (which is strategyName here)
        await axios.put(
          `${this.apiBaseUrl}/strategies/active`,
          { strategyName: strategyName },
          { timeout: 5000 }
        );
        demoLogger.success(`Server strategy set to ${strategyName}`);
      } catch (error) {
        demoLogger.error(
          `Failed to set active strategy ${strategyName} on server: ${error.message}. Skipping strategy.`
        );
        continue;
      }

      let currentSessionId = null;

      for (const evalCase of this.evaluationCases) {
        demoLogger.divider();
        demoLogger.info(
          `Running Case: ${chalk.cyan(evalCase.id)} - ${evalCase.description}`
        );
        demoLogger.info(
          `Input Type: ${evalCase.inputType}, NL: "${evalCase.naturalLanguageInput}"`
        );

        const caseResult = {
          caseId: evalCase.id,
          strategyName, // This is the strategy ID
          naturalLanguageInput: evalCase.naturalLanguageInput,
          inputType: evalCase.inputType,
          expectedProlog: evalCase.expectedProlog,
          actualProlog: null,
          expectedAnswer: evalCase.expectedAnswer,
          actualAnswer: null,
          scores: {},
          error: null,
          durationMs: null,
        };

        const startTime = Date.now();
        let sessionIdForThisCase;

        try {
          if (evalCase.sessionId) {
            sessionIdForThisCase = evalCase.sessionId;
            demoLogger.info(
              `Using case-specified session ID: ${sessionIdForThisCase}`
            );
          } else {
            if (!currentSessionId) {
              demoLogger.info(
                `No current session for strategy ${strategyName}. Creating one.`
              );
              currentSessionId = await this.createSession(
                strategyName + ' (strategy-shared)'
              );
              if (!currentSessionId) {
                throw new Error(
                  `Failed to create shared session for strategy ${strategyName}.`
                );
              }
              demoLogger.info(
                `Created strategy-shared session: ${currentSessionId}`
              );
            } else {
              demoLogger.info(
                `Using existing strategy-shared session: ${currentSessionId}`
              );
            }
            sessionIdForThisCase = currentSessionId;
          }

          if (!sessionIdForThisCase) {
            throw new Error(
              'Session ID for case could not be determined or created.'
            );
          }

          let apiResponseData = {}; // To store response data that might contain cost/token info
          if (evalCase.inputType === 'assert') {
            const axios = (await import('axios')).default;
            const response = await axios.post(
              `${this.apiBaseUrl}/sessions/${sessionIdForThisCase}/assert`,
              {
                text: evalCase.naturalLanguageInput,
              },
              { timeout: 10000 }
            );
            apiResponseData = response.data;
            caseResult.actualProlog = apiResponseData.addedFacts || [];
            demoLogger.logic(
              'Asserted Prolog:',
              caseResult.actualProlog.join('\n')
            );
          } else if (evalCase.inputType === 'query') {
            const axios = (await import('axios')).default;
            const response = await axios.post(
              `${this.apiBaseUrl}/sessions/${sessionIdForThisCase}/query`,
              {
                query: evalCase.naturalLanguageInput,
                options: { debug: true }, // Assuming debug might include prolog
              },
              { timeout: 10000 }
            );
            apiResponseData = response.data;
            caseResult.actualAnswer = apiResponseData.answer;
            if (
              apiResponseData.debugInfo &&
              apiResponseData.debugInfo.prologQuery
            ) {
              caseResult.actualProlog = apiResponseData.debugInfo.prologQuery;
            }
            demoLogger.logic(
              'Generated Prolog Query:',
              caseResult.actualProlog || 'N/A'
            );
            demoLogger.mcrResponse('NL Answer:', caseResult.actualAnswer);
          }

          // Calculate metrics
          const metricsToRun = evalCase.metrics || [
            'exactMatchProlog',
            'exactMatchAnswer',
            'prologStructureMatch',
            'semanticSimilarityAnswer',
          ];
          for (const metricName of metricsToRun) {
            if (metrics[metricName]) {
              let score = false;
              try {
                if (
                  metricName === 'exactMatchProlog' &&
                  caseResult.actualProlog !== null
                ) {
                  score = metrics.exactMatchProlog(
                    caseResult.actualProlog,
                    evalCase.expectedProlog
                  );
                } else if (
                  metricName === 'prologStructureMatch' &&
                  caseResult.actualProlog !== null
                ) {
                  score = metrics.prologStructureMatch(
                    caseResult.actualProlog,
                    evalCase.expectedProlog
                  );
                } else if (
                  metricName === 'exactMatchAnswer' &&
                  caseResult.actualAnswer !== null &&
                  evalCase.expectedAnswer !== undefined
                ) {
                  score = metrics.exactMatchAnswer(
                    caseResult.actualAnswer,
                    evalCase.expectedAnswer
                  );
                } else if (
                  metricName === 'semanticSimilarityAnswer' &&
                  caseResult.actualAnswer !== null &&
                  evalCase.expectedAnswer !== undefined
                ) {
                  score = await metrics.semanticSimilarityAnswer(
                    caseResult.actualAnswer,
                    evalCase.expectedAnswer,
                    this.llmGenerate,
                    evalCase.naturalLanguageInput
                  );
                }
                caseResult.scores[metricName] = score;
                demoLogger.info(
                  `Metric ${metricName}: ${score ? chalk.green('PASS') : chalk.red('FAIL')}`
                );
              } catch (metricError) {
                demoLogger.error(
                  `Error calculating metric ${metricName}: ${metricError.message}`
                );
                caseResult.scores[metricName] = false;
              }
            } else {
              demoLogger.warn(
                `Metric ${metricName} is defined in case but not implemented. Skipping.`
              );
            }
          }

          // LLM Model ID is determined later in the finally block.
          // Cost is now expected to be in apiResponseData.cost directly from the API handlers.
          // const costMetrics = apiResponseData.cost || { placeholder_cost: 0 }; // This was for the outer scope

          // Determine raw_output
          let rawOutputForDb = null;
          if (evalCase.inputType === 'assert' && caseResult.actualProlog) {
            rawOutputForDb = Array.isArray(caseResult.actualProlog)
              ? caseResult.actualProlog.join('\n')
              : caseResult.actualProlog;
          } else if (
            evalCase.inputType === 'query' &&
            caseResult.actualAnswer
          ) {
            rawOutputForDb = caseResult.actualAnswer;
          } else if (caseResult.actualProlog) {
            // Fallback for queries if answer is missing but prolog exists
            rawOutputForDb = Array.isArray(caseResult.actualProlog)
              ? caseResult.actualProlog.join('\n')
              : caseResult.actualProlog;
          }

          const dbRecord = {
            strategy_hash: strategyHash,
            llm_model_id: 'determined_in_finally', // Placeholder, will be set in finally
            example_id: evalCase.id,
            metrics: caseResult.scores,
            cost: apiResponseData.cost || {
              note: 'Cost data not received from API',
            }, // Use cost from API response
            latency_ms: caseResult.durationMs, // This will be updated in finally
            raw_output: rawOutputForDb,
          };

          // Insert into database (latency_ms will be updated in finally block before this)
          // We'll actually call insertPerformanceResult in the finally block
        } catch (error) {
          caseResult.error = error.message;
          if (
            error.response &&
            error.response.data &&
            error.response.data.error
          ) {
            caseResult.error = `API Error: ${error.response.data.error.message || error.message} (Code: ${error.response.data.error.code})`;
          }
          demoLogger.error('Case execution error:', caseResult.error);
        } finally {
          caseResult.durationMs = Date.now() - startTime; // Final duration
          this.results.push(caseResult);

          // Prepare and insert DB record here, after durationMs is finalized
          const llmModelId =
            strategyInstance.nodes
              ?.find((n) => n.type === 'LLM_Call')
              ?.model?.replace(
                '{{llm_model_id}}',
                config.llm.defaultModelId || 'unknown'
              ) ||
            config.llm.defaultModelId ||
            'unknown_model';
          // Use the cost data from apiResponseData if available, otherwise default.
          // apiResponseData is from the try block, so it might not be set if an error occurred before the API call.
          // In case of error before API call, apiResponseData might be undefined.
          // If an error occurred *during* the API call, apiResponseData might be error.response.data.
          // For simplicity, we assume apiResponseData.cost is correctly populated by handlers on success.
          // If an error occurred, cost might be missing or partial.
          let actualCostMetrics = {
            note: 'Cost data unavailable or error before capture',
          };
          if (apiResponseData && apiResponseData.cost) {
            actualCostMetrics = apiResponseData.cost;
          } else if (caseResult.error && caseResult.error.cost) {
            // If error object contains cost (less likely)
            actualCostMetrics = caseResult.error.cost;
          }

          let rawOutputForDb = null;
          if (evalCase.inputType === 'assert' && caseResult.actualProlog) {
            rawOutputForDb = Array.isArray(caseResult.actualProlog)
              ? JSON.stringify(caseResult.actualProlog)
              : caseResult.actualProlog;
          } else if (
            evalCase.inputType === 'query' &&
            caseResult.actualAnswer
          ) {
            rawOutputForDb =
              typeof caseResult.actualAnswer === 'object'
                ? JSON.stringify(caseResult.actualAnswer)
                : String(caseResult.actualAnswer);
          } else if (caseResult.actualProlog) {
            rawOutputForDb = Array.isArray(caseResult.actualProlog)
              ? JSON.stringify(caseResult.actualProlog)
              : caseResult.actualProlog;
          }
          if (caseResult.error) {
            // If there was an error, store it in raw_output
            rawOutputForDb = JSON.stringify({
              error: caseResult.error,
              output: rawOutputForDb,
            });
          }

          const dbRecord = {
            strategy_hash: strategyHash,
            llm_model_id: llmModelId,
            example_id: evalCase.id,
            input_type: evalCase.inputType, // Added input_type
            metrics: caseResult.scores,
            cost: actualCostMetrics,
            latency_ms: caseResult.durationMs,
            raw_output: rawOutputForDb,
          };

          try {
            await insertPerformanceResult(dbRecord);
            demoLogger.success(
              `Performance result for case ${evalCase.id} (strategy ${strategyName}) saved to DB.`
            );
          } catch (dbInsertError) {
            demoLogger.error(
              `Failed to save performance result for case ${evalCase.id} to DB: ${dbInsertError.message}`
            );
            logger.error('Stack trace for DB insert failure:', dbInsertError);
          }
        }
      }
      if (currentSessionId) {
        demoLogger.info(
          `Cleaning up strategy-shared session ${currentSessionId} for strategy ${strategyName}.`
        );
        await this.deleteSession(
          currentSessionId,
          strategyName + ' (strategy-shared)'
        );
        currentSessionId = null;
      }
    }
    this.displaySummary();
    await this.cleanupDb(); // Close DB connection after all operations
  }

  async cleanupDb() {
    try {
      await closeDb();
    } catch (dbCloseError) {
      demoLogger.error(`Error closing database: ${dbCloseError.message}`);
      logger.error('Stack trace for DB close failure:', dbCloseError);
    }
  }

  displaySummary() {
    demoLogger.heading('Evaluation Summary');
    // Group results by strategy
    const summaryByStrategy = {};

    this.results.forEach((res) => {
      if (!summaryByStrategy[res.strategyName]) {
        summaryByStrategy[res.strategyName] = {
          totalCases: 0,
          passedCases: 0,
          totalDurationMs: 0,
          metrics: {}, // { metricName: { pass: 0, fail: 0 } }
          errors: 0,
        };
      }
      const stratSummary = summaryByStrategy[res.strategyName];
      stratSummary.totalCases++;
      stratSummary.totalDurationMs += res.durationMs;
      if (res.error) stratSummary.errors++;

      let casePassedAllMetrics = true;
      for (const metric in res.scores) {
        if (!stratSummary.metrics[metric])
          stratSummary.metrics[metric] = { pass: 0, fail: 0 };
        if (res.scores[metric]) {
          stratSummary.metrics[metric].pass++;
        } else {
          stratSummary.metrics[metric].fail++;
          casePassedAllMetrics = false;
        }
      }
      if (
        !res.error &&
        casePassedAllMetrics &&
        Object.keys(res.scores).length > 0
      ) {
        // Only count as passed if no error and all defined metrics passed
        stratSummary.passedCases++;
      } else if (Object.keys(res.scores).length === 0 && !res.error) {
        // No metrics defined, but no error -> consider as passed for "overall"
        stratSummary.passedCases++;
      }
    });

    for (const strategyName in summaryByStrategy) {
      const summary = summaryByStrategy[strategyName];
      demoLogger.info(chalk.bold(`Strategy: ${strategyName}`));
      const passRate =
        summary.totalCases > 0
          ? ((summary.passedCases / summary.totalCases) * 100).toFixed(2)
          : 'N/A';
      console.log(
        `  Overall: ${summary.passedCases} / ${summary.totalCases} cases passed (${passRate}%)`
      );
      console.log(
        `  Average Duration: ${(summary.totalDurationMs / summary.totalCases).toFixed(2)} ms/case`
      );
      if (summary.errors > 0)
        console.log(chalk.red(`  Errors Encountered: ${summary.errors}`));

      for (const metricName in summary.metrics) {
        const metricData = summary.metrics[metricName];
        const totalMetricRuns = metricData.pass + metricData.fail;
        const metricPassRate =
          totalMetricRuns > 0
            ? ((metricData.pass / totalMetricRuns) * 100).toFixed(2)
            : 'N/A';
        console.log(
          `    Metric [${metricName}]: ${metricData.pass} passed, ${metricData.fail} failed (${metricPassRate}%)`
        );
      }
      demoLogger.divider(); // Corrected: was dividerLight()
    }

    // Optionally, write full results to a JSON file
    const reportPath = path.join(process.cwd(), 'evaluation-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(this.results, null, 2));
    demoLogger.success(`Full evaluation report saved to: ${reportPath}`);
  }
}

async function main() {
  const yargs = (await import('yargs/yargs')).default;
  const { hideBin } = await import('yargs/helpers');

  const argv = yargs(hideBin(process.argv))
    .option('casesPath', {
      alias: 'p',
      type: 'string',
      description: 'Path to the directory containing evaluation case files.',
      default: path.join(__dirname, 'evalCases'),
    })
    .option('strategies', {
      alias: 's',
      type: 'string',
      description:
        'Comma-separated list of strategies to run (e.g., SIR-R1,Direct-S1). Runs all if not specified.',
      default: '',
    })
    .option('tags', {
      alias: 't',
      type: 'string',
      description:
        'Comma-separated list of tags to filter evaluation cases by (e.g., simple,rules,family-ontology).',
      default: '',
    })
    .help().argv;

  const selectedStrategies = argv.strategies
    ? argv.strategies
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s)
    : [];
  const selectedTags = argv.tags
    ? argv.tags
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t)
    : [];

  // Ensure the MCR_LLM_PROVIDER is set for LlmService used in metrics
  if (
    !process.env.MCR_LLM_PROVIDER &&
    (selectedStrategies.length === 0 ||
      selectedStrategies.some((s) => s.startsWith('SIR')))
  ) {
    // Default or SIR might use LLM
    logger.warn(
      'MCR_LLM_PROVIDER environment variable is not set. Semantic similarity metric might fail if it relies on an LLM.'
    );
    // Potentially set a default if crucial, or ensure LlmService handles it gracefully.
    // For now, rely on LlmService's default behavior or .env file.
  }

  const evaluator = new Evaluator(
    argv.casesPath,
    selectedStrategies,
    selectedTags
  );
  await evaluator.run();
}

if (require.main === module) {
  main().catch((error) => {
    demoLogger.error('Unhandled critical error in evaluator:', error.message);
    logger.error('Stack trace for critical evaluator error:', error);
    process.exit(1);
  });
}

module.exports = { Evaluator, metrics };
