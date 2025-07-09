// src/tools.js
const mcrService = require('./mcrService');
const ontologyService = require('./ontologyService');
const strategyManager = require('./strategyManager');
const logger = require('./util/logger');
const { ErrorCodes } = require('./errors');

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
    handler: async (input) => {
      // TODO: Implement actual database query to performance_results.db
      // For now, returning mock data.
      logger.info('[Tool:analysis.get_strategy_leaderboard] Called. Returning mock data.');
      const mockData = [
        { strategyId: 'sir-r1-assert-strategy', strategyName: 'SIR R1 Assert', accuracy: 0.92, avgLatencyMs: 250, avgCost: 0.0015, evaluations: 100, successRate: 0.92 },
        { strategyId: 'direct-s1-assert-strategy', strategyName: 'Direct S1 Assert', accuracy: 0.88, avgLatencyMs: 180, avgCost: 0.0009, evaluations: 150, successRate: 0.88 },
        { strategyId: 'sir-r1-query-strategy', strategyName: 'SIR R1 Query', accuracy: 0.90, avgLatencyMs: 320, avgCost: 0.0020, evaluations: 90, successRate: 0.90 },
      ];
      return { success: true, data: mockData };
      // Example of what a real implementation might look like:
      // try {
      //   const db = require('./store/database').getDb(); // Assuming db access is set up
      //   // This query is hypothetical and depends on the actual schema of performance_results.db
      //   const rows = await db.all(`
      //     SELECT
      //       strategy_id as strategyId,
      //       strategy_name as strategyName,
      //       COUNT(*) as evaluations,
      //       AVG(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successRate, -- accuracy often means successRate in this context
      //       AVG(latency_ms) as avgLatencyMs,
      //       AVG(cost) as avgCost
      //     FROM performance_results
      //     GROUP BY strategy_id, strategy_name
      //     ORDER BY successRate DESC, avgLatencyMs ASC
      //   `);
      //   return { success: true, data: rows };
      // } catch (error) {
      //   logger.error(`[Tool:analysis.get_strategy_leaderboard] Database error: ${error.message}`, { error });
      //   return { success: false, message: 'Failed to retrieve strategy leaderboard from database.', error: ErrorCodes.DATABASE_ERROR };
      // }
    },
  },
  // TODO: Define other analysis tools:
  // 'analysis.get_strategy_performance_details': { strategyId }
  // 'analysis.list_eval_cases': {}
  // 'analysis.get_eval_case_content': { casePath }
  // 'analysis.save_eval_case_content': { casePath, content }
  // 'analysis.generate_eval_case_variations': { casePath }
  // 'evolver.run_bootstrap': {}
  // 'evolver.run_single_cycle': {}
  // 'evolver.start_continuous_evolution': {}
  // 'evolver.get_status': {}
};

module.exports = mcrToolDefinitions;
