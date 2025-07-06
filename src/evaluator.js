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
    if (typeof actualAnswer !== 'string' || typeof expectedAnswer !== 'string') return false;
    return actualAnswer.trim() === expectedAnswer.trim();
  },
  // TODO: Add more sophisticated metrics (e.g., semantic similarity for answers, Prolog structure match)
};

class Evaluator {
  constructor(evaluationCasesPath) {
    this.evaluationCasesPath = evaluationCasesPath;
    this.evaluationCases = [];
    this.results = [];
    this.apiBaseUrl = `http://${config.server.host}:${config.server.port}/api/v1`;
    this.sharedSessionId = null; // For cases that might share a session
  }

  loadEvaluationCases() {
    demoLogger.info('Loading evaluation cases from', this.evaluationCasesPath);
    try {
      const caseFiles = fs.readdirSync(this.evaluationCasesPath);
      for (const file of caseFiles) {
        if (file.endsWith('.js') || file.endsWith('.json')) {
          const filePath = path.join(this.evaluationCasesPath, file);
          const casesFromFile = require(filePath); // require() handles both .js and .json
          if (Array.isArray(casesFromFile)) {
            this.evaluationCases.push(...casesFromFile);
            demoLogger.success(`Loaded ${casesFromFile.length} cases from ${file}`);
          } else {
            demoLogger.warn(`File ${file} does not export an array of cases. Skipping.`);
          }
        }
      }
      demoLogger.info(`Total evaluation cases loaded: ${this.evaluationCases.length}`);
      if (this.evaluationCases.length === 0) {
        demoLogger.error('No evaluation cases found. Please create case files in the specified directory.');
        process.exit(1);
      }
    } catch (error) {
      demoLogger.error('Failed to load evaluation cases:', error.message);
      logger.error('Stack trace for case loading failure:', error);
      process.exit(1);
    }
  }

  async createSession(strategyName) {
    demoLogger.step(`Creating session for strategy ${strategyName}...`);
    try {
      const axios = (await import('axios')).default;
      const response = await axios.post(`${this.apiBaseUrl}/sessions`, {}, { timeout: 5000 }); // 5s timeout
      demoLogger.success(`Session created: ${response.data.id} for strategy ${strategyName}`);
      return response.data.id;
    } catch (error) {
      demoLogger.error(`Failed to create session for ${strategyName}:`, error.message);
      return null;
    }
  }

  async deleteSession(sessionId, strategyName) {
    if (!sessionId) return;
    demoLogger.cleanup(`Deleting session ${sessionId} for strategy ${strategyName}...`);
    try {
      const axios = (await import('axios')).default;
      await axios.delete(`${this.apiBaseUrl}/sessions/${sessionId}`, { timeout: 5000 }); // 5s timeout
      demoLogger.success(`Session ${sessionId} deleted.`);
    } catch (error) {
      demoLogger.error(`Failed to delete session ${sessionId}:`, error.message);
    }
  }

  async run() {
    demoLogger.heading('MCR Evaluation System');
    this.loadEvaluationCases();

    const serverReady = await checkAndStartServer();
    if (!serverReady) {
        demoLogger.error('Evaluation aborted: MCR server is not running or could not be started.');
        return;
    }

    const availableStrategies = strategyManager.getAvailableStrategies();
    if (!availableStrategies || availableStrategies.length === 0) {
        demoLogger.error('No translation strategies found by StrategyManager. Aborting evaluation.');
        return;
    }
    demoLogger.info('Available strategies for evaluation:', availableStrategies.join(', '));

    for (const strategyName of availableStrategies) {
      const strategyInstance = strategyManager.getStrategy(strategyName);
      if (!strategyInstance) {
        demoLogger.warn(`Could not get instance for strategy ${strategyName}. Skipping.`);
        continue;
      }
      demoLogger.heading(`Evaluating Strategy: ${strategyName}`);

      // Set this strategy as active on the server for this batch of tests
      try {
        demoLogger.info(`Setting active strategy on server to: ${strategyName}`);
        const axios = (await import('axios')).default;
        await axios.put(`${this.apiBaseUrl}/strategies/active`, { strategyName }, { timeout: 5000 }); // 5s timeout
        demoLogger.success(`Server strategy set to ${strategyName}`);
      } catch (error) {
        demoLogger.error(`Failed to set active strategy ${strategyName} on server: ${error.message}. Skipping strategy.`);
        continue;
      }

      let currentSessionId = null; // Will be created if a case needs it and doesn't specify one

      for (const evalCase of this.evaluationCases) {
        demoLogger.divider(); // Corrected: was dividerLight()
        demoLogger.info(`Running Case: ${chalk.cyan(evalCase.id)} - ${evalCase.description}`);
        demoLogger.info(`Input Type: ${evalCase.inputType}, NL: "${evalCase.naturalLanguageInput}"`);

        const caseResult = {
          caseId: evalCase.id,
          strategyName,
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
        let caseUsesSpecificSession = !!evalCase.sessionId;
        let sessionIdForCase = evalCase.sessionId || currentSessionId;


        try {
          if (!sessionIdForCase && (evalCase.inputType === 'assert' || evalCase.inputType === 'query')) {
            // Create a session if one doesn't exist for this strategy block and the case needs it
            sessionIdForCase = await this.createSession(strategyName);
            if (!sessionIdForCase) throw new Error('Session creation failed for case.');
            if (!caseUsesSpecificSession) currentSessionId = sessionIdForCase; // This session is now the default for subsequent cases for this strategy
          }


          if (evalCase.inputType === 'assert') {
            const axios = (await import('axios')).default;
            const response = await axios.post(`${this.apiBaseUrl}/sessions/${sessionIdForCase}/assert`, {
              text: evalCase.naturalLanguageInput,
            }, { timeout: 10000 }); // 10s timeout for assert (nullllm should be fast)
            // Assuming response.data = { message, addedFacts }
            caseResult.actualProlog = response.data.addedFacts || [];
            demoLogger.logic('Asserted Prolog:', caseResult.actualProlog.join('\n'));
          } else if (evalCase.inputType === 'query') {
            const axios = (await import('axios')).default;
            const response = await axios.post(`${this.apiBaseUrl}/sessions/${sessionIdForCase}/query`, {
              query: evalCase.naturalLanguageInput,
              options: { debug: true } // Request debug info to get Prolog query
            }, { timeout: 10000 }); // 10s timeout for query
            // Assuming response.data = { answer, debugInfo: { prologQuery } }
            caseResult.actualAnswer = response.data.answer;
            if (response.data.debugInfo && response.data.debugInfo.prologQuery) {
              caseResult.actualProlog = response.data.debugInfo.prologQuery;
            }
            demoLogger.logic('Generated Prolog Query:', caseResult.actualProlog || 'N/A');
            demoLogger.mcrResponse('NL Answer:', caseResult.actualAnswer);
          }

          // Calculate metrics
          (evalCase.metrics || ['exactMatchProlog', 'exactMatchAnswer']).forEach(metricName => {
            if (metrics[metricName]) {
              let score = false;
              if (metricName === 'exactMatchProlog' && caseResult.actualProlog !== null) {
                score = metrics.exactMatchProlog(caseResult.actualProlog, evalCase.expectedProlog);
              } else if (metricName === 'exactMatchAnswer' && caseResult.actualAnswer !== null && evalCase.expectedAnswer !== undefined) {
                score = metrics.exactMatchAnswer(caseResult.actualAnswer, evalCase.expectedAnswer);
              }
              caseResult.scores[metricName] = score;
              demoLogger.info(`Metric ${metricName}: ${score ? chalk.green('PASS') : chalk.red('FAIL')}`);
            }
          });

        } catch (error) {
          caseResult.error = error.message;
          if (error.response && error.response.data && error.response.data.error) {
             caseResult.error = `API Error: ${error.response.data.error.message || error.message} (Code: ${error.response.data.error.code})`;
          }
          demoLogger.error('Case execution error:', caseResult.error);
        } finally {
          caseResult.durationMs = Date.now() - startTime;
          this.results.push(caseResult);
          if (caseUsesSpecificSession && sessionIdForCase) { // if the case used its own specified session
            await this.deleteSession(sessionIdForCase, strategyName + " (case-specific)");
          }
        }
      }
      // Clean up the strategy-level session if one was created
      if (currentSessionId) {
        await this.deleteSession(currentSessionId, strategyName);
        currentSessionId = null;
      }
    }
    this.displaySummary();
  }

  displaySummary() {
    demoLogger.heading('Evaluation Summary');
    // Group results by strategy
    const summaryByStrategy = {};

    this.results.forEach(res => {
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
        if (!stratSummary.metrics[metric]) stratSummary.metrics[metric] = { pass: 0, fail: 0 };
        if (res.scores[metric]) {
          stratSummary.metrics[metric].pass++;
        } else {
          stratSummary.metrics[metric].fail++;
          casePassedAllMetrics = false;
        }
      }
      if (!res.error && casePassedAllMetrics && Object.keys(res.scores).length > 0) { // Only count as passed if no error and all defined metrics passed
        stratSummary.passedCases++;
      } else if (Object.keys(res.scores).length === 0 && !res.error) { // No metrics defined, but no error -> consider as passed for "overall"
        stratSummary.passedCases++;
      }
    });

    for (const strategyName in summaryByStrategy) {
      const summary = summaryByStrategy[strategyName];
      demoLogger.info(chalk.bold(`Strategy: ${strategyName}`));
      const passRate = summary.totalCases > 0 ? (summary.passedCases / summary.totalCases * 100).toFixed(2) : "N/A";
      console.log(`  Overall: ${summary.passedCases} / ${summary.totalCases} cases passed (${passRate}%)`);
      console.log(`  Average Duration: ${(summary.totalDurationMs / summary.totalCases).toFixed(2)} ms/case`);
      if (summary.errors > 0) console.log(chalk.red(`  Errors Encountered: ${summary.errors}`));

      for (const metricName in summary.metrics) {
        const metricData = summary.metrics[metricName];
        const totalMetricRuns = metricData.pass + metricData.fail;
        const metricPassRate = totalMetricRuns > 0 ? (metricData.pass / totalMetricRuns * 100).toFixed(2) : "N/A";
        console.log(`    Metric [${metricName}]: ${metricData.pass} passed, ${metricData.fail} failed (${metricPassRate}%)`);
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
    const defaultCasesPath = path.join(__dirname, 'evalCases'); // Default path
    // TODO: Add yargs or similar for command-line args to specify cases path, strategies, etc.
    const evaluator = new Evaluator(defaultCasesPath);
    await evaluator.run();
}

if (require.main === module) {
  main().catch(error => {
    demoLogger.error('Unhandled critical error in evaluator:', error.message);
    logger.error('Stack trace for critical evaluator error:', error);
    process.exit(1);
  });
}

module.exports = { Evaluator, metrics };
