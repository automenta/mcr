// src/tools.js
const mcrService = require('./mcrService');
const ontologyService = require('./ontologyService');
const strategyManager = require('./strategyManager');
const logger = require('./util/logger');
const { ErrorCodes } = require('./errors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto'); // For hashing strategy content
// const ExampleBase = require('./demo/ExampleBase'); // Required for demo.run - Commented out as unused
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

// --- Optimizer Process Management Variables and Helpers ---
// Define these *before* mcrToolDefinitions if they are used by handlers within it.
let optimizerProcess = null;
const MAX_OPTIMIZER_LOGS = 500;
const optimizerLogs = []; // Stores { timestamp, type: 'stdout'|'stderr'|'status', message }

function addOptimizerLog(type, message) {
  const logEntry = { timestamp: new Date().toISOString(), type, message: message.trim() };
  optimizerLogs.push(logEntry);
  if (optimizerLogs.length > MAX_OPTIMIZER_LOGS) {
    optimizerLogs.shift();
  }
  logger.info(`[OptimizerRuntime:${type}] ${message.trim()}`);
}
// --- End Optimizer Process Management Variables and Helpers ---

/**
 * All available MCR tools callable via the WebSocket API.
 */
const mcrToolDefinitions = {
  // Session Management Tools
  'session.create': {
    description: 'Creates a new reasoning session.',
    handler: async (input) => {
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
    description: 'Asserts NL facts into a session.',
    handler: async (input) => {
      if (!input?.sessionId || !input?.naturalLanguageText) {
        return { success: false, error: ErrorCodes.INVALID_INPUT, message: 'sessionId and naturalLanguageText are required.' };
      }
      return mcrService.assertNLToSession(input.sessionId, input.naturalLanguageText);
    },
  },
  'session.query': {
    description: 'Queries a session with an NL question.',
    handler: async (input) => {
      if (!input?.sessionId || !input?.naturalLanguageQuestion) {
        return { success: false, error: ErrorCodes.INVALID_INPUT, message: 'sessionId and naturalLanguageQuestion are required.' };
      }
      return mcrService.querySessionWithNL(input.sessionId, input.naturalLanguageQuestion, input.queryOptions);
    },
  },
  'session.explainQuery': {
    description: 'Explains an NL query in the context of a session.',
    handler: async (input) => {
      if (!input?.sessionId || !input?.naturalLanguageQuestion) {
        return { success: false, error: ErrorCodes.INVALID_INPUT, message: 'sessionId and naturalLanguageQuestion are required.' };
      }
      return mcrService.explainQuery(input.sessionId, input.naturalLanguageQuestion);
    },
  },
  'session.assert_rules': {
    description: 'Asserts raw Prolog rules directly into a session.',
    handler: async (input) => {
      if (!input?.sessionId || !input?.rules) {
        return { success: false, error: ErrorCodes.INVALID_INPUT, message: 'sessionId and rules are required.' };
      }
      return mcrService.assertRawPrologToSession(input.sessionId, input.rules, input.validate);
    },
  },
  'session.set_kb': {
    description: 'Replaces the entire Knowledge Base for a session with the provided content.',
    handler: async (input) => {
      if (!input?.sessionId || typeof input?.kbContent !== 'string') { // kbContent can be an empty string
        return { success: false, error: ErrorCodes.INVALID_INPUT, message: 'sessionId and kbContent (string) are required.' };
      }
      return mcrService.setSessionKnowledgeBase(input.sessionId, input.kbContent);
    },
  },

  // Ontology Management Tools
  'ontology.create': {
    description: 'Creates a new global ontology.',
    handler: async (input) => {
      if (!input?.name || !input?.rules) {
        return { success: false, error: ErrorCodes.INVALID_INPUT, message: 'name and rules are required.' };
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
        return { success: false, error: ErrorCodes.INVALID_INPUT, message: 'name is required.' };
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
        return { success: false, error: ErrorCodes.INVALID_INPUT, message: 'name and rules are required.' };
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
        return { success: false, error: ErrorCodes.INVALID_INPUT, message: 'name is required.' };
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
    description: 'Translates NL text directly to Prolog rules.',
    handler: async (input) => {
      if (!input?.naturalLanguageText) {
        return { success: false, error: ErrorCodes.INVALID_INPUT, message: 'naturalLanguageText is required.' };
      }
      return mcrService.translateNLToRulesDirect(input.naturalLanguageText, input.strategyId);
    },
  },
  'translate.rulesToNl': {
    description: 'Translates Prolog rules directly to an NL explanation.',
    handler: async (input) => {
      if (!input?.rules) {
        return { success: false, error: ErrorCodes.INVALID_INPUT, message: 'rules are required.' };
      }
      return mcrService.translateRulesToNLDirect(input.rules, input.style);
    },
  },

  // Strategy Management Tools
  'strategy.list': {
    description: 'Lists all available translation strategies.',
    handler: async () => {
      const strategies = strategyManager.getAvailableStrategies();
      return { success: true, data: strategies };
    },
  },
  'strategy.setActive': {
    description: 'Sets the active base translation strategy.',
    handler: async (input) => {
      if (!input?.strategyId) {
        return { success: false, error: ErrorCodes.INVALID_INPUT, message: 'strategyId is required.' };
      }
      const success = await mcrService.setTranslationStrategy(input.strategyId);
      if (success) {
        const activeStrategyId = mcrService.getActiveStrategyId();
        return { success: true, message: `Base translation strategy set to ${activeStrategyId}.`, data: { activeStrategyId } };
      }
      return { success: false, error: ErrorCodes.STRATEGY_SET_FAILED, message: `Failed to set strategy to ${input.strategyId}.` };
    },
  },
  'strategy.getActive': {
    description: 'Gets the currently active base translation strategy ID.',
    handler: async () => {
      const activeStrategyId = mcrService.getActiveStrategyId();
      return { success: true, data: { activeStrategyId } };
    },
  },

  // Utility & Debugging Tools
  'utility.getPrompts': {
    description: 'Retrieves all available prompt templates.',
    handler: async () => {
      const result = await mcrService.getPrompts();
      if (result.success) {
        return { success: true, data: result.prompts };
      }
      return result;
    },
  },
  'utility.debugFormatPrompt': {
    description: 'Formats a prompt template with given variables for debugging.',
    handler: async (input) => {
      if (!input?.templateName || !input?.inputVariables) {
        return { success: false, error: ErrorCodes.INVALID_INPUT, message: 'templateName and inputVariables are required.' };
      }
      return mcrService.debugFormatPrompt(input.templateName, input.inputVariables);
    },
  },

  // System Analysis Tools
  'analysis.get_strategy_leaderboard': {
    description: 'Retrieves aggregated performance data for strategies.',
    handler: async () => {
      try {
        const strategyDefinitions = strategyManager.getAvailableStrategies();
        const strategyDetailsMap = new Map();
        for (const stratInfo of strategyDefinitions) {
          const definition = strategyManager.getStrategy(stratInfo.id);
          if (definition) {
            const hash = crypto.createHash('sha256').update(JSON.stringify(definition)).digest('hex');
            strategyDetailsMap.set(hash, { id: stratInfo.id, name: stratInfo.name });
          }
        }
        const query = `
          SELECT strategy_hash, COUNT(*) AS evaluations, AVG(latency_ms) AS avgLatencyMs,
                 AVG(CASE WHEN json_extract(metrics, '$.exactMatchProlog') = 1 THEN 1 ELSE 0 END) AS successRate,
                 AVG(json_extract(cost, '$.cost_usd')) AS avgCostUsd
          FROM performance_results GROUP BY strategy_hash`;
        const rows = await queryPerformanceResults(query);
        const leaderboardData = rows.map(row => {
          const details = strategyDetailsMap.get(row.strategy_hash);
          return {
            strategyId: details ? details.id : 'unknown_strategy_id',
            strategyName: details ? details.name : row.strategy_hash,
            evaluations: row.evaluations,
            successRate: row.successRate !== null ? parseFloat(row.successRate.toFixed(3)) : null,
            avgLatencyMs: row.avgLatencyMs !== null ? parseFloat(row.avgLatencyMs.toFixed(0)) : null,
            avgCost: row.avgCostUsd !== null ? parseFloat(row.avgCostUsd.toFixed(5)) : null,
          };
        }).filter(entry => entry.strategyId !== 'unknown_strategy_id');
        return { success: true, data: leaderboardData };
      } catch (error) {
        logger.error(`[Tool:analysis.get_strategy_leaderboard] Error: ${error.message}`, { stack: error.stack });
        return { success: false, message: 'Failed to retrieve strategy leaderboard.', error: ErrorCodes.DATABASE_ERROR };
      }
    },
  },
  'analysis.get_strategy_details': {
    description: 'Retrieves detailed performance data for a specific strategy.',
    handler: async (input) => {
      const { strategyId } = input;
      if (!strategyId) {
        return { success: false, error: ErrorCodes.INVALID_INPUT, message: 'strategyId is required.' };
      }
      try {
        const strategyDefinition = strategyManager.getStrategy(strategyId);
        if (!strategyDefinition) {
          return { success: false, error: ErrorCodes.STRATEGY_NOT_FOUND, message: `Strategy '${strategyId}' not found.` };
        }
        const strategyHash = crypto.createHash('sha256').update(JSON.stringify(strategyDefinition)).digest('hex');
        const performanceRuns = await queryPerformanceResults(
          'SELECT * FROM performance_results WHERE strategy_hash = ? ORDER BY timestamp DESC',
          [strategyHash]
        );
        const processedRuns = performanceRuns.map(run => ({
          ...run,
          metrics: typeof run.metrics === 'string' ? JSON.parse(run.metrics) : run.metrics,
          cost: typeof run.cost === 'string' ? JSON.parse(run.cost) : run.cost,
        }));
        let totalLatency = 0, successfulRuns = 0;
        processedRuns.forEach(run => {
            totalLatency += run.latency_ms;
            if (run.metrics?.exactMatchProlog === 1) successfulRuns++;
        });
        const summary = {
            totalRuns: processedRuns.length,
            avgLatencyMs: processedRuns.length > 0 ? parseFloat((totalLatency / processedRuns.length).toFixed(2)) : 0,
            successRate: processedRuns.length > 0 ? parseFloat((successfulRuns / processedRuns.length).toFixed(3)) : 0,
        };
        return { success: true, data: { strategyId, definition: strategyDefinition, hash: strategyHash, summary, runs: processedRuns } };
      } catch (error) {
        logger.error(`[Tool:analysis.get_strategy_details] Error for ${strategyId}: ${error.message}`, { stack: error.stack });
        return { success: false, message: `Failed to retrieve details for strategy ${strategyId}.`, error: ErrorCodes.DATABASE_ERROR };
      }
    },
  },
  'analysis.list_eval_curricula': {
    description: 'Lists all available evaluation curricula.',
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
            } else if (entry.isFile() && (entry.name.endsWith('.js') || entry.name.endsWith('.json')) && !/ExampleBase\.js|Utils\.js/.test(entry.name) && entry.name !== path.basename(__filename)) {
              try {
                const casesFromFile = require(fullPath); // Potentially unsafe if files are user-supplied
                const caseCount = Array.isArray(casesFromFile) ? casesFromFile.length : (casesFromFile?.default && Array.isArray(casesFromFile.default)) ? casesFromFile.default.length : 0;
                curricula.push({ id: relativePath.replace(/\\/g, '/'), name: entry.name, path: relativePath.replace(/\\/g, '/'), caseCount });
              } catch (err) {
                logger.warn(`[Tool:list_eval_curricula] Error processing file ${fullPath}: ${err.message}.`);
              }
            }
          }
        } catch (error) {
          logger.error(`[Tool:list_eval_curricula] Error reading dir ${currentDir}: ${error.message}`);
        }
      }
      findEvalFilesRecursively(evalCasesDir);
      if (curricula.length === 0 && !fs.existsSync(evalCasesDir)) {
         return { success: true, data: [], message: "Evaluation cases directory not found." };
      }
      return { success: true, data: curricula };
    },
  },
  'analysis.get_curriculum_details': {
    description: 'Retrieves the content of a specific curriculum file.',
    handler: async (input) => {
      const { curriculumId } = input;
      if (!curriculumId) {
        return { success: false, error: ErrorCodes.INVALID_INPUT, message: 'curriculumId is required.' };
      }
      const curriculumPath = path.join(__dirname, 'evalCases', curriculumId);
      if (!fs.existsSync(curriculumPath) || !fs.statSync(curriculumPath).isFile()) {
        return { success: false, error: ErrorCodes.EVAL_CASE_FILE_NOT_FOUND, message: `Curriculum '${curriculumId}' not found.` };
      }
      try {
        delete require.cache[require.resolve(curriculumPath)]; // Ensure fresh read
        const cases = require(curriculumPath);
        const actualCases = Array.isArray(cases) ? cases : (cases?.default && Array.isArray(cases.default)) ? cases.default : null;
        if (!actualCases) {
             return { success: false, error: ErrorCodes.EVAL_CASE_INVALID_FORMAT, message: `Curriculum '${curriculumId}' has invalid format.`};
        }
        return { success: true, data: { id: curriculumId, name: path.basename(curriculumId), cases: actualCases } };
      } catch (error) {
        logger.error(`[Tool:get_curriculum_details] Error loading ${curriculumId}: ${error.message}`, { stack: error.stack });
        return { success: false, message: `Error loading curriculum '${curriculumId}': ${error.message}`, error: ErrorCodes.EVAL_CASE_LOAD_FAILED };
      }
    },
  },

  // Evolution Tools
  'evolution.start_optimizer': {
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
      const scriptPath = path.join(__dirname, 'evolution', 'optimizer.js');
      optimizerProcess = spawn('node', [scriptPath, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
      optimizerProcess.stdout.on('data', (data) => addOptimizerLog('stdout', data.toString()));
      optimizerProcess.stderr.on('data', (data) => addOptimizerLog('stderr', data.toString()));
      optimizerProcess.on('error', (err) => {
        addOptimizerLog('error', `Optimizer process error: ${err.message}`);
        logger.error(`[OptimizerRuntime] Error: ${err.message}`, {stack: err.stack});
        optimizerProcess = null;
      });
      optimizerProcess.on('exit', (code, signal) => {
        addOptimizerLog('status', `Optimizer process exited with code ${code}, signal ${signal}.`);
        logger.info(`[OptimizerRuntime] Exited with code ${code}, signal ${signal}.`);
        optimizerProcess = null;
      });
      await new Promise(resolve => setTimeout(resolve, 100)); // Allow fast fail
      if (optimizerProcess?.pid) {
         addOptimizerLog('status', `Optimizer process started with PID: ${optimizerProcess.pid}.`);
         return { success: true, message: `Optimizer started with PID ${optimizerProcess.pid}.`, data: { pid: optimizerProcess.pid } };
      } else {
         addOptimizerLog('error', 'Optimizer process failed to start or exited immediately.');
         return { success: false, message: 'Optimizer process failed to start. Check logs.', error: ErrorCodes.OPTIMIZER_START_FAILED };
      }
    },
  },
  'evolution.get_status': {
    description: 'Gets the current status of the optimizer process.',
    handler: async () => {
      if (optimizerProcess?.pid && !optimizerProcess.killed) {
        return { success: true, data: { status: 'running', pid: optimizerProcess.pid } };
      }
      return { success: true, data: { status: 'idle', message: 'Optimizer not currently running.' } };
    },
  },
  'evolution.stop_optimizer': {
    description: 'Stops the running optimizer process.',
    handler: async () => {
      if (optimizerProcess?.pid && !optimizerProcess.killed) {
        addOptimizerLog('status', `Attempting to stop optimizer PID: ${optimizerProcess.pid}.`);
        const killed = optimizerProcess.kill('SIGTERM') || optimizerProcess.kill('SIGKILL');
        if (killed) {
          addOptimizerLog('status', `Optimizer termination signal sent.`);
          return { success: true, message: 'Optimizer termination signal sent.' };
        }
        addOptimizerLog('error', 'Failed to send termination signal to optimizer.');
        return { success: false, message: 'Failed to send termination signal.', error: ErrorCodes.OPTIMIZER_STOP_FAILED };
      }
      return { success: false, message: 'Optimizer process not running.', error: ErrorCodes.OPTIMIZER_NOT_RUNNING };
    },
  },
  'evolution.get_optimizer_log': {
    description: 'Retrieves recent logs from the optimizer process.',
    handler: async () => {
      return { success: true, data: { logs: optimizerLogs } };
    },
  },

  // Demo Tools
  'demo.list': {
    description: 'Lists all available demos.',
    handler: async () => {
      const demoDir = path.join(__dirname, 'demo');
      const demos = [];
      try {
        const files = fs.readdirSync(demoDir);
        for (const file of files) {
          if (file.endsWith('Demo.js') && !/ExampleBase\.js/.test(file)) {
            const demoId = file.replace(/\.js$/, '');
            try {
              const DemoClass = require(path.join(demoDir, file));
              if (typeof DemoClass === 'function' && DemoClass.prototype?.getName && DemoClass.prototype?.getDescription) {
                const instance = new DemoClass('temp_demo_list_session', () => {}); // Dummy session/logger
                demos.push({ id: demoId, name: instance.getName(), description: instance.getDescription() });
              } else {
                 logger.warn(`[Tool:demo.list] File ${file} is not a valid Demo class.`);
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
      const logCollector = (logEntry) => capturedLogs.push(logEntry);
      try {
        const DemoClass = require(demoFilePath);
        if (typeof DemoClass !== 'function' || !DemoClass.prototype?.run) {
            return { success: false, error: ErrorCodes.DEMO_INVALID, message: `Demo '${demoId}' is not valid.` };
        }
        const demoInstance = new DemoClass(sessionId, logCollector);
        logCollector({type: 'log', level: 'info', message: `Starting demo: ${demoInstance.getName()}`});
        await demoInstance.run();
        logCollector({type: 'log', level: 'info', message: `Finished demo: ${demoInstance.getName()}`});
        return { success: true, data: { demoId, messages: capturedLogs } };
      } catch (error) {
        logger.error(`[Tool:demo.run] Error running demo ${demoId}: ${error.message}`, { stack: error.stack });
        logCollector({type: 'log', level: 'error', message: `Critical error in demo ${demoId}: ${error.message}`});
        return { success: false, message: `Error in demo '${demoId}': ${error.message}`, error: ErrorCodes.DEMO_RUN_FAILED, data: { demoId, messages: capturedLogs } };
      }
    },
  },
}; // End of mcrToolDefinitions

module.exports = mcrToolDefinitions;
