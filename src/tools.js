// src/tools.js
const mcrService = require('./mcrService');
const ontologyService = require('./ontologyService');
const strategyManager = require('./strategyManager');
const logger = require('./util/logger');
const { ErrorCodes } = require('./errors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto'); // For hashing strategy content
const ExampleBase = require('./demo/ExampleBase'); // Required for demo.run
const { queryPerformanceResults } = require('./store/database'); // For DB access
const { spawn } = require('child_process');

/**
 * @typedef {Object} ToolInput
 * @property {string} [sessionId] - The ID of the session.
 * @property {string} [naturalLanguageText] - Natural language text for assertion.
 * @property {string} [naturalLanguageQuestion] - Natural language question for querying.
 * @property {object} [queryOptions] - Options for querying.
 * @property {string} [name] - Name of an ontology or other entity.
 * @property {string} [rules] - Prolog rules for an ontology.
 * @property {boolean} [includeRules] - Whether to include rules in ontology list.
 * @property {string} [strategyId] - ID of a strategy.
 * @property {string} [templateName] - Name of a prompt template.
 * @property {object} [inputVariables] - Variables for prompt template formatting.
 */

/**
 * @typedef {Object} ToolResult
 * @property {boolean} success - Indicates if the operation was successful.
 * @property {string} [message] - A message describing the outcome.
 * @property {any} [data] - The primary data returned by the tool.
 * @property {string} [error] - An error code if the operation failed.
 * @property {string} [details] - Further details about the error.
 * @property {string} [strategyId] - The strategy ID used, if applicable.
 * @property {object} [cost] - Cost information, if applicable.
 * @property {object} [debugInfo] - Debugging information, if applicable.
 */

/**
 * All available MCR tools callable via the WebSocket API.
 * Each tool handler receives the `input` part of the `tool_invoke` message payload.
 * Handlers should aim to return a ToolResult-like object.
 */
const mcrToolDefinitions = {
  // Session Management Tools
  'session.create': {
    description: 'Creates a new reasoning session.',
    handler: async (input) => {
      // mcrService.createSession can take an optional sessionId
      const sessionId = input?.sessionId;
      const session = await mcrService.createSession(sessionId);
      return { success: true, data: session };
    },
  },
  'session.get': {
    description: 'Retrieves a session by its ID.',
    handler: async (input) => {
      if (!input?.sessionId) {
        return { success: false, error: ErrorCodes.INVALID_INPUT, message: 'sessionId is required.' };
      }
      const session = await mcrService.getSession(input.sessionId);
      if (session) {
        return { success: true, data: session };
      }
      return { success: false, error: ErrorCodes.SESSION_NOT_FOUND, message: 'Session not found.' };
    },
  },
  'session.delete': {
    description: 'Deletes a session.',
    handler: async (input) => {
      if (!input?.sessionId) {
        return { success: false, error: ErrorCodes.INVALID_INPUT, message: 'sessionId is required.' };
      }
      const deleted = await mcrService.deleteSession(input.sessionId);
      if (deleted) {
        return { success: true, message: `Session ${input.sessionId} deleted.` };
      }
      return { success: false, error: ErrorCodes.SESSION_NOT_FOUND, message: 'Session not found for deletion.' };
    },
  },
  'session.assert': {
    description: 'Asserts NL facts into a session. Replaces assertNLToSession.',
    handler: async (input) => {
      if (!input?.sessionId || !input?.naturalLanguageText) {
        return { success: false, error: ErrorCodes.INVALID_INPUT, message: 'sessionId and naturalLanguageText are required.' };
      }
      // mcrService.assertNLToSession returns a rich object already matching ToolResult structure
      return mcrService.assertNLToSession(input.sessionId, input.naturalLanguageText);
    },
  },
  'session.query': {
    description: 'Queries a session with an NL question. Replaces querySessionWithNL.',
    handler: async (input) => {
      if (!input?.sessionId || !input?.naturalLanguageQuestion) {
        return { success: false, error: ErrorCodes.INVALID_INPUT, message: 'sessionId and naturalLanguageQuestion are required.' };
      }
      // mcrService.querySessionWithNL returns a rich object
      return mcrService.querySessionWithNL(input.sessionId, input.naturalLanguageQuestion, input.queryOptions);
    },
  },
  'session.explainQuery': {
    description: 'Explains an NL query in the context of a session.',
    handler: async (input) => {
      if (!input?.sessionId || !input?.naturalLanguageQuestion) {
        return { success: false, error: ErrorCodes.INVALID_INPUT, message: 'sessionId and naturalLanguageQuestion are required.' };
      }
      // mcrService.explainQuery returns a rich object
      return mcrService.explainQuery(input.sessionId, input.naturalLanguageQuestion);
    },
  },
  'session.assert_rules': {
    description: 'Asserts raw Prolog rules directly into a session.',
    handler: async (input) => {
      if (!input?.sessionId || !input?.rules) {
        return { success: false, error: ErrorCodes.INVALID_INPUT, message: 'sessionId and rules (string or array of strings) are required.' };
      }
      // mcrService.assertRawPrologToSession returns a rich object with { success, message, addedFacts, fullKnowledgeBase, error?, details? }
      return mcrService.assertRawPrologToSession(input.sessionId, input.rules, input.validate); // validate is optional, defaults to true in service
    },
  },

  // Ontology Management Tools
  'ontology.create': {
    description: 'Creates a new global ontology.',
    handler: async (input) => {
      if (!input?.name || !input?.rules) {
        return { success: false, error: ErrorCodes.INVALID_INPUT, message: 'name and rules are required for ontology creation.' };
      }
      try {
        const ontology = await ontologyService.createOntology(input.name, input.rules);
        return { success: true, data: ontology };
      } catch (error) {
        logger.error(`[Tool:ontology.create] Error: ${error.message}`, { error });
        return { success: false, message: error.message, error: error.code || ErrorCodes.ONTOLOGY_CREATION_FAILED };
      }
    },
  },
  'ontology.list': {
    description: 'Lists all available global ontologies.',
    handler: async (input) => {
      const includeRules = input?.includeRules === true;
      try {
        const ontologies = await ontologyService.listOntologies(includeRules);
        return { success: true, data: ontologies };
      } catch (error) {
        logger.error(`[Tool:ontology.list] Error: ${error.message}`, { error });
        return { success: false, message: error.message, error: ErrorCodes.ONTOLOGY_LIST_FAILED };
      }
    },
  },
  'ontology.get': {
    description: 'Retrieves a specific global ontology by name.',
    handler: async (input) => {
      if (!input?.name) {
        return { success: false, error: ErrorCodes.INVALID_INPUT, message: 'name is required to get an ontology.' };
      }
      try {
        const ontology = await ontologyService.getOntology(input.name);
        if (ontology) {
          return { success: true, data: ontology };
        }
        return { success: false, error: ErrorCodes.ONTOLOGY_NOT_FOUND, message: `Ontology '${input.name}' not found.` };
      } catch (error) {
        logger.error(`[Tool:ontology.get] Error for ${input.name}: ${error.message}`, { error });
        return { success: false, message: error.message, error: ErrorCodes.ONTOLOGY_GET_FAILED };
      }
    },
  },
  'ontology.update': {
    description: 'Updates an existing global ontology.',
    handler: async (input) => {
      if (!input?.name || !input?.rules) {
        return { success: false, error: ErrorCodes.INVALID_INPUT, message: 'name and rules are required for ontology update.' };
      }
      try {
        const updatedOntology = await ontologyService.updateOntology(input.name, input.rules);
        return { success: true, data: updatedOntology };
      } catch (error) {
        logger.error(`[Tool:ontology.update] Error for ${input.name}: ${error.message}`, { error });
        return { success: false, message: error.message, error: error.code || ErrorCodes.ONTOLOGY_UPDATE_FAILED };
      }
    },
  },
  'ontology.delete': {
    description: 'Deletes a global ontology.',
    handler: async (input) => {
      if (!input?.name) {
        return { success: false, error: ErrorCodes.INVALID_INPUT, message: 'name is required to delete an ontology.' };
      }
      try {
        await ontologyService.deleteOntology(input.name);
        return { success: true, message: `Ontology '${input.name}' deleted.` };
      } catch (error) {
        logger.error(`[Tool:ontology.delete] Error for ${input.name}: ${error.message}`, { error });
        return { success: false, message: error.message, error: error.code || ErrorCodes.ONTOLOGY_DELETE_FAILED };
      }
    },
  },

  // Direct Translation Tools
  'translate.nlToRules': {
    description: 'Translates NL text directly to Prolog rules using an assertion strategy.',
    handler: async (input) => {
      if (!input?.naturalLanguageText) {
        return { success: false, error: ErrorCodes.INVALID_INPUT, message: 'naturalLanguageText is required.' };
      }
      // mcrService.translateNLToRulesDirect returns a rich object
      return mcrService.translateNLToRulesDirect(input.naturalLanguageText, input.strategyId);
    },
  },
  'translate.rulesToNl': {
    description: 'Translates Prolog rules directly to an NL explanation.',
    handler: async (input) => {
      if (!input?.rules) {
        return { success: false, error: ErrorCodes.INVALID_INPUT, message: 'rules are required.' };
      }
      // mcrService.translateRulesToNLDirect returns a rich object
      return mcrService.translateRulesToNLDirect(input.rules, input.style);
    },
  },

  // Strategy Management Tools
  'strategy.list': {
    description: 'Lists all available translation strategies.',
    handler: async () => { // No input needed
      const strategies = strategyManager.getAvailableStrategies(); // Synchronous
      return { success: true, data: strategies };
    },
  },
  'strategy.setActive': {
    description: 'Sets the active base translation strategy for the MCR service.',
    handler: async (input) => {
      if (!input?.strategyId) {
        return { success: false, error: ErrorCodes.INVALID_INPUT, message: 'strategyId is required.' };
      }
      const success = await mcrService.setTranslationStrategy(input.strategyId);
      if (success) {
        const activeStrategyId = mcrService.getActiveStrategyId(); // Get the potentially modified/actual ID
        return { success: true, message: `Base translation strategy set to ${activeStrategyId}.`, data: { activeStrategyId } };
      }
      return { success: false, error: ErrorCodes.STRATEGY_SET_FAILED, message: `Failed to set strategy to ${input.strategyId}. It might be invalid.` };
    },
  },
  'strategy.getActive': {
    description: 'Gets the currently active base translation strategy ID.',
    handler: async () => { // No input needed
      const activeStrategyId = mcrService.getActiveStrategyId(); // Synchronous
      return { success: true, data: { activeStrategyId } };
    },
  },

  // Utility & Debugging Tools
  'utility.getPrompts': {
    description: 'Retrieves all available prompt templates.',
    handler: async () => { // No input needed
      // mcrService.getPrompts returns { success: true, prompts: object } or error object
      const result = await mcrService.getPrompts();
      if (result.success) {
        return { success: true, data: result.prompts };
      }
      return result; // Pass error object as is
    },
  },
  'utility.debugFormatPrompt': {
    description: 'Formats a prompt template with given variables for debugging.',
    handler: async (input) => {
      if (!input?.templateName || !input?.inputVariables) {
        return { success: false, error: ErrorCodes.INVALID_INPUT, message: 'templateName and inputVariables are required.' };
      }
      // mcrService.debugFormatPrompt returns a rich object
      return mcrService.debugFormatPrompt(input.templateName, input.inputVariables);
    },
  },
  // 'utility.getStatus' can remain an HTTP endpoint or be added here if needed for WS clients.
  // For now, the existing websocketHandler has a direct switch case for it,
  // which calls utilityHandlers.getStatusHandler(req, res).
  // To integrate fully, it would be:
  // 'utility.getStatus': {
  //   description: 'Gets the server status.',
  //   handler: async () => {
  //     // This would require refactoring getStatusHandler or duplicating logic
  //     // For simplicity, let's assume it might be added later if WS clients need it.
  //     // For now, it's likely used by load balancers/HTTP checks.
  //     return { success: true, data: { status: "ok", message: "MCR WebSocket service is running." } };
  //   }
  // }

  // System Analysis Tools
  'analysis.get_strategy_leaderboard': {
    description: 'Retrieves aggregated performance data for all strategies from performance_results.db.',
    handler: async () => {
      try {
        // 1. Create a mapping from strategy_hash to strategyId and strategyName
        const strategyDefinitions = strategyManager.getAvailableStrategies(); // Gets {id, name}
        const strategyDetailsMap = new Map();
        for (const stratInfo of strategyDefinitions) {
          const definition = strategyManager.getStrategy(stratInfo.id);
          if (definition) {
            const hash = crypto.createHash('sha256').update(JSON.stringify(definition)).digest('hex');
            strategyDetailsMap.set(hash, { id: stratInfo.id, name: stratInfo.name, definition });
          }
        }

        // 2. Query the database for aggregated performance data
        const query = `
          SELECT
            strategy_hash,
            COUNT(*) AS evaluations,
            AVG(latency_ms) AS avgLatencyMs,
            AVG(CASE WHEN json_extract(metrics, '$.exactMatchProlog') = 1 THEN 1 ELSE 0 END) AS successRate,
            AVG(json_extract(cost, '$.cost_usd')) AS avgCostUsd
          FROM performance_results
          GROUP BY strategy_hash
        `;
        const rows = await queryPerformanceResults(query);

        // 3. Combine DB results with strategy names/IDs
        const leaderboardData = rows.map(row => {
          const details = strategyDetailsMap.get(row.strategy_hash);
          return {
            strategyId: details ? details.id : 'unknown_strategy_id', // Fallback if hash not found (should not happen for known strategies)
            strategyName: details ? details.name : row.strategy_hash, // Fallback to hash if name not found
            evaluations: row.evaluations,
            successRate: row.successRate !== null ? parseFloat(row.successRate.toFixed(3)) : null,
            avgLatencyMs: row.avgLatencyMs !== null ? parseFloat(row.avgLatencyMs.toFixed(0)) : null,
            // The UI expects avgCost. Let's use avgCostUsd and the UI can format it.
            avgCost: row.avgCostUsd !== null ? parseFloat(row.avgCostUsd.toFixed(5)) : null,
          };
        }).filter(entry => entry.strategyId !== 'unknown_strategy_id'); // Filter out entries where original strategy definition couldn't be found

        return { success: true, data: leaderboardData };
      } catch (error) {
        logger.error(`[Tool:analysis.get_strategy_leaderboard] Database error or processing error: ${error.message}`, { stack: error.stack });
        return { success: false, message: 'Failed to retrieve strategy leaderboard from database.', error: ErrorCodes.DATABASE_ERROR };
      }
    },
  },
  'analysis.get_strategy_details': {
    description: 'Retrieves detailed performance data and definition for a specific strategy.',
    handler: async (input) => {
      const { strategyId } = input;
      if (!strategyId) {
        return { success: false, error: ErrorCodes.INVALID_INPUT, message: 'strategyId is required.' };
      }

      try {
        const strategyDefinition = strategyManager.getStrategy(strategyId);
        if (!strategyDefinition) {
          return { success: false, error: ErrorCodes.STRATEGY_NOT_FOUND, message: `Strategy with ID '${strategyId}' not found.` };
        }

        const strategyHash = crypto.createHash('sha256').update(JSON.stringify(strategyDefinition)).digest('hex');

        // Fetch all performance results for this strategy hash
        // The schema has strategy_hash, llm_model_id, example_id, metrics, cost, latency_ms, timestamp, raw_output
        const performanceRuns = await queryPerformanceResults(
          'SELECT * FROM performance_results WHERE strategy_hash = ? ORDER BY timestamp DESC',
          [strategyHash]
        );

        // Parse JSON fields (metrics, cost) for easier consumption by client
        const processedRuns = performanceRuns.map(run => ({
          ...run,
          metrics: typeof run.metrics === 'string' ? JSON.parse(run.metrics) : run.metrics,
          cost: typeof run.cost === 'string' ? JSON.parse(run.cost) : run.cost,
        }));

        // Calculate summary statistics (can be expanded)
        let totalLatency = 0;
        let successfulRuns = 0;
        // Assuming metrics has a field like `is_success` or we infer from `exactMatchProlog` etc.
        // For now, let's assume a metric `overall_success: 1 or 0` or similar exists or can be derived.
        // This part needs alignment with actual metrics being stored.
        // As a placeholder, let's count runs where metrics.exactMatchProlog === 1 (if it exists)
        performanceRuns.forEach(run => {
            totalLatency += run.latency_ms;
            const metrics = typeof run.metrics === 'string' ? JSON.parse(run.metrics) : run.metrics;
            if (metrics?.exactMatchProlog === 1) { // Example success condition
                successfulRuns++;
            }
        });
        const avgLatency = performanceRuns.length > 0 ? totalLatency / performanceRuns.length : 0;
        const successRate = performanceRuns.length > 0 ? successfulRuns / performanceRuns.length : 0;

        const summary = {
            totalRuns: performanceRuns.length,
            avgLatencyMs: parseFloat(avgLatency.toFixed(2)),
            successRate: parseFloat(successRate.toFixed(3)),
            // Add more summary stats as needed (e.g., avg cost)
        };

        return {
          success: true,
          data: {
            strategyId: strategyId, // Echo back the ID used for lookup
            definition: strategyDefinition, // The JSON content of the strategy
            hash: strategyHash,
            summary: summary,
            runs: processedRuns,
          },
        };
      } catch (error) {
        logger.error(`[Tool:analysis.get_strategy_details] Error for strategy ${strategyId}: ${error.message}`, { stack: error.stack, strategyId });
        return { success: false, message: `Failed to retrieve details for strategy ${strategyId}.`, error: ErrorCodes.DATABASE_ERROR }; // Or a more specific error
      }
    },
  },
  // 'analysis.list_eval_cases': {} // Implementing as list_eval_curricula
  'analysis.list_eval_curricula': {
    description: 'Lists all available evaluation curricula (files of evaluation cases).',
    handler: async () => {
      const evalCasesDir = path.join(__dirname, 'evalCases');
      const curricula = [];

      function findEvalFilesRecursively(currentDir, relativeBaseDir = '') {
        try {
          const entries = fs.readdirSync(currentDir, { withFileTypes: true });
          for (const entry of entries) {
            const fullPath = path.join(currentDir, entry.name);
            const relativePath = path.join(relativeBaseDir, entry.name);
            if (entry.isDirectory()) {
              findEvalFilesRecursively(fullPath, relativePath);
            } else if (entry.isFile() && (entry.name.endsWith('.js') || entry.name.endsWith('.json')) && entry.name !== 'ExampleBase.js' && !entry.name.endsWith('Utils.js') && entry.name !== path.basename(__filename)) {
              // Basic filtering for JS/JSON files, excluding known non-case files
              try {
                // To get caseCount, we need to require the file.
                // Note: require() caches, subsequent calls for the same file are fast.
                const casesFromFile = require(fullPath);
                const caseCount = Array.isArray(casesFromFile) ? casesFromFile.length : (typeof casesFromFile === 'object' && casesFromFile !== null && Array.isArray(casesFromFile.default) ? casesFromFile.default.length : 0);

                curricula.push({
                  id: relativePath.replace(/\\/g, '/'), // Normalize path separators for ID
                  name: entry.name,
                  path: relativePath.replace(/\\/g, '/'),
                  caseCount: caseCount,
                });
              } catch (err) {
                logger.warn(`[Tool:analysis.list_eval_curricula] Error requiring/processing file ${fullPath}: ${err.message}. Skipping.`);
              }
            }
          }
        } catch (error) {
          logger.error(`[Tool:analysis.list_eval_curricula] Error reading directory ${currentDir}: ${error.message}`);
          // Do not re-throw, try to list what's possible
        }
      }

      findEvalFilesRecursively(evalCasesDir);
      if (curricula.length === 0 && !fs.existsSync(evalCasesDir)) {
         logger.warn(`[Tool:analysis.list_eval_curricula] Evaluation cases directory not found: ${evalCasesDir}`);
         return { success: true, data: [], message: "Evaluation cases directory not found." };
      }
      return { success: true, data: curricula };
    },
  },
  // 'analysis.get_eval_case_content': { casePath } // Implementing as get_curriculum_details
  'analysis.get_curriculum_details': {
    description: 'Retrieves the detailed content (evaluation cases) of a specific curriculum file.',
    handler: async (input) => {
      const { curriculumId } = input;
      if (!curriculumId) {
        return { success: false, error: ErrorCodes.INVALID_INPUT, message: 'curriculumId is required.' };
      }

      // curriculumId is expected to be the relative path from 'src/evalCases/'
      const curriculumPath = path.join(__dirname, 'evalCases', curriculumId);

      if (!fs.existsSync(curriculumPath) || !fs.statSync(curriculumPath).isFile()) {
        logger.error(`[Tool:analysis.get_curriculum_details] Curriculum file not found or not a file: ${curriculumPath}`);
        return { success: false, error: ErrorCodes.EVAL_CASE_FILE_NOT_FOUND, message: `Curriculum '${curriculumId}' not found.` }; // Need EVAL_CASE_FILE_NOT_FOUND error
      }

      try {
        // Clear cache for this specific file to ensure fresh read if file was edited
        delete require.cache[require.resolve(curriculumPath)];
        const cases = require(curriculumPath);
        // Handle if module exports an object with a 'default' array (common for ES modules transpiled)
        const actualCases = Array.isArray(cases) ? cases : (cases && Array.isArray(cases.default)) ? cases.default : null;

        if (!actualCases) {
             logger.error(`[Tool:analysis.get_curriculum_details] Curriculum file ${curriculumPath} did not export an array of cases.`);
             return { success: false, error: ErrorCodes.EVAL_CASE_INVALID_FORMAT, message: `Curriculum '${curriculumId}' has invalid format.`}; // Need EVAL_CASE_INVALID_FORMAT
        }
        return { success: true, data: { id: curriculumId, name: path.basename(curriculumId), cases: actualCases } };
      } catch (error) {
        logger.error(`[Tool:analysis.get_curriculum_details] Error loading curriculum ${curriculumId}: ${error.message}`, { stack: error.stack });
        return { success: false, message: `Error loading curriculum '${curriculumId}': ${error.message}`, error: ErrorCodes.EVAL_CASE_LOAD_FAILED }; // Need EVAL_CASE_LOAD_FAILED
      }
    },
  },
  // 'analysis.save_eval_case_content': { casePath, content }
  // 'analysis.generate_eval_case_variations': { casePath }
  // 'evolver.run_bootstrap': {} // These are covered by options in start_optimizer
  // 'evolver.run_single_cycle': {} // Same as above
  // 'evolver.start_continuous_evolution': {} // Same as above
  // 'evolver.get_status': {} // Implementing below
};

// --- Optimizer Process Management ---
let optimizerProcess = null;
const MAX_OPTIMIZER_LOGS = 500; // Increased max log lines
const optimizerLogs = []; // Stores { timestamp, type: 'stdout'|'stderr'|'status', message }

function addOptimizerLog(type, message) {
  const logEntry = { timestamp: new Date().toISOString(), type, message: message.trim() };
  optimizerLogs.push(logEntry);
  if (optimizerLogs.length > MAX_OPTIMIZER_LOGS) {
    optimizerLogs.shift();
  }
  // For real-time UI updates, one might emit WebSocket events here to subscribed clients.
  // For now, logs are pulled by get_optimizer_log.
  logger.info(`[OptimizerRuntime:${type}] ${message.trim()}`);
}
// --- End Optimizer Process Management ---


// Add evolution tools to mcrToolDefinitions
mcrToolDefinitions['evolution.start_optimizer'] = {
  description: 'Starts the strategy evolution optimizer script.',
  handler: async (input) => {
    if (optimizerProcess) {
      return { success: false, message: 'Optimizer process is already running.', error: ErrorCodes.OPTIMIZER_RUNNING };
    }

    const options = input?.options || {};
    const args = [];
    if (options.iterations) args.push('-i', options.iterations.toString());
    if (options.bootstrapOnly) args.push('--bootstrapOnly');
    if (options.runBootstrap) args.push('--runBootstrap');
    if (options.evalCasesPath) args.push('-p', options.evalCasesPath);

    addOptimizerLog('status', `Starting optimizer with args: ${args.join(' ')}`);

    // Ensure the script path is correct, relative to where mcr.js (main server) runs from.
    // __dirname for tools.js is src/. So optimizer.js is at ./evolution/optimizer.js
    const scriptPath = path.join(__dirname, 'evolution', 'optimizer.js');

    optimizerProcess = spawn('node', [scriptPath, ...args], {
      detached: false, // false: if MCR server dies, optimizer child process dies. True: optimizer could continue.
      stdio: ['ignore', 'pipe', 'pipe'], // stdin, stdout, stderr
    });

    optimizerProcess.stdout.on('data', (data) => {
      addOptimizerLog('stdout', data.toString());
    });

    optimizerProcess.stderr.on('data', (data) => {
      addOptimizerLog('stderr', data.toString());
    });

    optimizerProcess.on('error', (err) => {
      addOptimizerLog('error', `Optimizer process error: ${err.message}`);
      logger.error(`[OptimizerRuntime] Optimizer process error: ${err.message}`, {stack: err.stack});
      optimizerProcess = null;
    });

    optimizerProcess.on('exit', (code, signal) => {
      addOptimizerLog('status', `Optimizer process exited with code ${code}, signal ${signal}.`);
      logger.info(`[OptimizerRuntime] Optimizer process exited with code ${code}, signal ${signal}.`);
      optimizerProcess = null;
    });

    // Add a small delay to allow process to potentially fail fast.
    await new Promise(resolve => setTimeout(resolve, 100));

    if (optimizerProcess && !optimizerProcess.killed && optimizerProcess.pid) {
       addOptimizerLog('status', `Optimizer process started with PID: ${optimizerProcess.pid}.`);
       return { success: true, message: `Optimizer started with PID ${optimizerProcess.pid}.`, data: { pid: optimizerProcess.pid } };
    } else {
       addOptimizerLog('error', 'Optimizer process failed to start or exited immediately.');
       // optimizerProcess might be null here if 'error' or 'exit' fired quickly
       return { success: false, message: 'Optimizer process failed to start or exited immediately. Check logs.', error: ErrorCodes.OPTIMIZER_START_FAILED };
    }
  },
};

mcrToolDefinitions['evolution.get_status'] = {
  description: 'Gets the current status of the optimizer process.',
  handler: async () => {
    if (optimizerProcess && optimizerProcess.pid && !optimizerProcess.killed) {
      return { success: true, data: { status: 'running', pid: optimizerProcess.pid } };
    }
    // Could check a status file here in the future
    return { success: true, data: { status: 'idle', message: 'Optimizer not currently running.' } };
  },
};

mcrToolDefinitions['evolution.stop_optimizer'] = {
  description: 'Stops the running optimizer process.',
  handler: async () => {
    if (optimizerProcess && optimizerProcess.pid && !optimizerProcess.killed) {
      addOptimizerLog('status', `Attempting to stop optimizer process PID: ${optimizerProcess.pid}.`);
      const killed = optimizerProcess.kill('SIGTERM'); // Send SIGTERM first
      if (killed) {
        // optimizerProcess will be set to null on 'exit' event.
        return { success: true, message: 'Optimizer process termination signal sent (SIGTERM).' };
      } else {
        // Fallback if SIGTERM fails (e.g. process already exited)
        const killedForce = optimizerProcess.kill('SIGKILL');
         if (killedForce) {
            addOptimizerLog('status', `Optimizer process termination signal sent (SIGKILL).`);
            return { success: true, message: 'Optimizer process termination signal sent (SIGKILL).' };
         }
        addOptimizerLog('error', 'Failed to send termination signal to optimizer process.');
        return { success: false, message: 'Failed to send termination signal to optimizer process.', error: ErrorCodes.OPTIMIZER_STOP_FAILED };
      }
    }
    return { success: false, message: 'Optimizer process not running.', error: ErrorCodes.OPTIMIZER_NOT_RUNNING };
  },
};

mcrToolDefinitions['evolution.get_optimizer_log'] = {
  description: 'Retrieves recent logs from the optimizer process.',
  handler: async () => {
    // Could enhance to read from a file if optimizer logs there
    return { success: true, data: { logs: optimizerLogs } };
  },
};

// Demo Tools
mcrToolDefinitions['demo.list'] = {
  description: 'Lists all available demos.',
    handler: async () => {
      const demoDir = path.join(__dirname, 'demo');
      const demos = [];
      try {
        const files = fs.readdirSync(demoDir);
        for (const file of files) {
          if (file.endsWith('Demo.js') && file !== 'ExampleBase.js') { // Assuming demo files end with Demo.js and ignore base
            const demoId = file.replace(/\.js$/, '');
            try {
              const DemoClass = require(path.join(demoDir, file));
              // Instantiate with dummy session/collector just to get name/description
              // This is a bit of a hack; ideally, name/description could be static or metadata
              const tempLogCollector = () => {}; // No-op
              const tempSessionId = 'temp_demo_list_session'; // Dummy session ID

              // Check if it's a class and has getName/getDescription methods
              if (typeof DemoClass === 'function' && DemoClass.prototype?.getName && DemoClass.prototype?.getDescription) {
                  // For class-based demos, we might need to instantiate them to get name/desc.
                  // This is problematic if constructor does real work or needs valid session.
                  // For now, assuming constructor is light or we make getName/Desc static.
                  // Let's assume for now they are instance methods and constructor is simple.
                  // This part needs careful review based on ExampleBase.
                  // If ExampleBase constructor throws without valid session, this will fail.
                  // Quick fix: only instantiate if it's NOT ExampleBase itself.

                  // The refactored ExampleBase constructor *does* require sessionId and logCollector.
                  // So, we must provide them.
                  const instance = new DemoClass(tempSessionId, tempLogCollector);
                  demos.push({
                    id: demoId,
                    name: instance.getName(),
                    description: instance.getDescription(),
                  });
              } else {
                 logger.warn(`[Tool:demo.list] File ${file} does not appear to be a valid Demo class with getName/getDescription.`);
              }
            } catch (err) {
              logger.error(`[Tool:demo.list] Error loading demo ${file}: ${err.message}`, { stack: err.stack });
            }
          }
        }
        return { success: true, data: demos };
      } catch (error) {
        logger.error(`[Tool:demo.list] Error reading demo directory: ${error.message}`, { stack: error.stack });
        return { success: false, message: 'Failed to list demos.', error: ErrorCodes.DEMO_LIST_FAILED };
      }
    },
  },
  'demo.run': {
    description: 'Runs a specific demo.',
    handler: async (input) => {
      const { demoId, sessionId } = input;
      if (!demoId || !sessionId) {
        return { success: false, error: ErrorCodes.INVALID_INPUT, message: 'demoId and sessionId are required.' };
      }

      const demoFilePath = path.join(__dirname, 'demo', `${demoId}.js`);
      if (!fs.existsSync(demoFilePath)) {
        return { success: false, error: ErrorCodes.DEMO_NOT_FOUND, message: `Demo '${demoId}' not found.` };
      }

      const capturedLogs = [];
      const logCollector = (logEntry) => {
        capturedLogs.push(logEntry);
      };

      try {
        const DemoClass = require(demoFilePath);
        if (typeof DemoClass !== 'function' || !DemoClass.prototype?.run) {
            logger.error(`[Tool:demo.run] ${demoId} is not a valid Demo class with a run method.`);
            return { success: false, error: ErrorCodes.DEMO_INVALID, message: `Demo '${demoId}' is not a valid demo class.` };
        }
        const demoInstance = new DemoClass(sessionId, logCollector);

        logCollector({type: 'log', level: 'info', message: `Starting demo: ${demoInstance.getName()}`});
        await demoInstance.run();
        logCollector({type: 'log', level: 'info', message: `Finished demo: ${demoInstance.getName()}`});

        return { success: true, data: { demoId, messages: capturedLogs } };
      } catch (error) {
        logger.error(`[Tool:demo.run] Error running demo ${demoId}: ${error.message}`, { stack: error.stack });
        logCollector({type: 'log', level: 'error', message: `Critical error running demo ${demoId}: ${error.message}`});
        return { success: false, message: `Error running demo '${demoId}': ${error.message}`, error: ErrorCodes.DEMO_RUN_FAILED, data: { demoId, messages: capturedLogs } };
      }
    },
  },
};

module.exports = mcrToolDefinitions;
