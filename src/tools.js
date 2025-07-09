// src/tools.js
const mcrService = require('./mcrService');
const ontologyService = require('./ontologyService');
const strategyManager = require('./strategyManager');
const logger =require('./logger');

// Wrapper function to ensure all handlers return a structured response or throw an error
// This helps in sending consistent messages over WebSocket
async function toolHandlerWrapper(handlerName, handlerFn, payload) {
  logger.debug(`[ToolRunner] Invoking tool: ${handlerName} with payload:`, payload);
  try {
    const result = await handlerFn(payload);
    // Ensure a consistent success structure if the handler itself doesn't provide one
    if (typeof result === 'object' && result !== null && 'success' in result) {
      logger.info(`[ToolRunner] Tool ${handlerName} completed with success: ${result.success}`);
      return result;
    }
    // If the handler returns data directly, wrap it in a success object
    logger.info(`[ToolRunner] Tool ${handlerName} completed successfully. Wrapping result.`);
    return { success: true, data: result };
  } catch (error) {
    logger.error(`[ToolRunner] Error in tool ${handlerName}: ${error.message}`, { stack: error.stack, payload });
    // Ensure a consistent error structure
    return {
      success: false,
      error: {
        message: error.message,
        code: error.code || 'TOOL_EXECUTION_ERROR',
        details: error.details || error.stack,
      },
    };
  }
}

const toolDefinitions = {
  // Session Management
  create_session: {
    description: "Creates a new reasoning session.",
    handler: async (payload) => toolHandlerWrapper('create_session', mcrService.createSession, payload?.sessionId),
  },
  get_session: {
    description: "Retrieves a session by its ID.",
    handler: async (payload) => toolHandlerWrapper('get_session', mcrService.getSession, payload.sessionId),
  },
  delete_session: {
    description: "Deletes a session.",
    handler: async (payload) => toolHandlerWrapper('delete_session', mcrService.deleteSession, payload.sessionId),
  },
  get_session_kb: {
    description: "Retrieves the knowledge base for a given session.",
    // mcrService doesn't have a direct getKnowledgeBase, it's part of sessionStore.
    // For now, we'll skip this or assume mcrService might be augmented.
    // This highlights a potential need for mcrService to expose more session store interactions.
    // Let's assume we add a wrapper in mcrService or access sessionStore if appropriate architecture-wise.
    // For now, placeholder:
    handler: async (payload) => ({ success: false, error: { message: "Tool 'get_session_kb' not fully implemented yet."}}),
  },

  // Fact Assertion & Querying
  assert_nl_to_session: {
    description: "Asserts NL facts into a session using the configured strategy.",
    handler: async (payload) => toolHandlerWrapper('assert_nl_to_session',
      () => mcrService.assertNLToSession(payload.sessionId, payload.naturalLanguageText), payload),
  },
  query_session_with_nl: {
    description: "Queries a session with an NL question using the configured strategy.",
    handler: async (payload) => toolHandlerWrapper('query_session_with_nl',
      () => mcrService.querySessionWithNL(payload.sessionId, payload.naturalLanguageQuestion, payload.options), payload),
  },

  // Ontology Management
  list_ontologies: {
    description: "Lists all available global ontologies.",
    handler: async (payload) => toolHandlerWrapper('list_ontologies', ontologyService.listOntologies, payload?.includeContent),
  },
  get_ontology: {
    description: "Retrieves a specific ontology by name.",
    handler: async (payload) => toolHandlerWrapper('get_ontology', ontologyService.getOntology, payload.name),
  },
  create_ontology: {
    description: "Creates a new global ontology.",
    handler: async (payload) => toolHandlerWrapper('create_ontology', ontologyService.createOntology, {name: payload.name, rules: payload.rules}),
  },
  update_ontology: {
    description: "Updates an existing global ontology.",
    handler: async (payload) => toolHandlerWrapper('update_ontology', ontologyService.updateOntology, {name: payload.name, rules: payload.rules}),
  },
  delete_ontology: {
    description: "Deletes a global ontology.",
    handler: async (payload) => toolHandlerWrapper('delete_ontology', ontologyService.deleteOntology, payload.name),
  },
  // A new tool to load ontology into session (conceptual)
  load_ontology_into_session: {
    description: "Loads ontology rules as assertions into a session.",
    handler: async (payload) => { // { sessionId: string, ontologyName: string }
        const { sessionId, ontologyName } = payload;
        const { sessionId, ontologyName } = payload;
        if (!sessionId || !ontologyName) {
            return { success: false, error: { message: "sessionId and ontologyName are required." } };
        }

        const ontologyFetchResult = await toolHandlerWrapper('get_ontology_for_load', () => ontologyService.getOntology(ontologyName), { name: ontologyName });

        if (!ontologyFetchResult.success || !ontologyFetchResult.data) {
            return { success: false, error: { message: `Ontology '${ontologyName}' not found or could not be retrieved. Details: ${ontologyFetchResult.error?.message}` }};
        }
        const ontology = ontologyFetchResult.data;

        if (!ontology.rules || typeof ontology.rules !== 'string' || ontology.rules.trim() === '') {
            return { success: false, error: { message: `Ontology '${ontologyName}' contains no rules to load.` }};
        }

        // Use the new mcrService.assertRawPrologToSession method
        return toolHandlerWrapper('load_ontology_into_session_raw',
            () => mcrService.assertRawPrologToSession(sessionId, ontology.rules),
            payload // Pass original payload for context if wrapper needs it, though handler uses destructured vars
        );
    }
  },


  // Strategy Management
  list_strategies: {
    description: "Lists all available translation strategies.",
    handler: async (payload) => toolHandlerWrapper('list_strategies', mcrService.getAvailableStrategies, payload),
  },
  get_active_strategy: {
    description: "Gets the currently active base translation strategy ID.",
    handler: async (payload) => toolHandlerWrapper('get_active_strategy', mcrService.getActiveStrategyId, payload),
  },
  set_active_strategy: {
    description: "Sets the base translation strategy.",
    handler: async (payload) => toolHandlerWrapper('set_active_strategy', mcrService.setTranslationStrategy, payload.strategyId),
  },

  // Direct Translation (utility, might not be directly used by chat UI but good for tools.js)
  translate_nl_to_rules: {
    description: "Translates NL text directly to Prolog rules.",
    handler: async (payload) => toolHandlerWrapper('translate_nl_to_rules',
      () => mcrService.translateNLToRulesDirect(payload.naturalLanguageText, payload.strategyId), payload),
  },
  translate_rules_to_nl: {
    description: "Translates Prolog rules directly to NL explanation.",
    handler: async (payload) => toolHandlerWrapper('translate_rules_to_nl',
      () => mcrService.translateRulesToNLDirect(payload.prologRules, payload.style), payload),
  },
  explain_query_in_session: {
    description: "Explains an NL query in the context of a session.",
    handler: async (payload) => toolHandlerWrapper('explain_query_in_session',
      () => mcrService.explainQuery(payload.sessionId, payload.naturalLanguageQuestion), payload),
  },

  // Demo running (conceptual)
  list_demos: {
      description: "Lists available demos.",
      handler: async (payload) => {
          // This would typically list files from src/demos/*
          // For now, a placeholder:
          const demos = [
              { id: 'familyOntologyDemo', name: 'Family Ontology Demo', description: 'Demonstrates assertions and queries with the family ontology.' },
              { id: 'simpleAssertionsDemo', name: 'Simple Assertions Demo', description: 'Shows basic assertion capabilities.' },
              { id: 'simpleQADemo', name: 'Simple Q&A Demo', description: 'Basic question answering.' },
          ];
          return { success: true, data: demos };
      }
  },
  run_demo_in_session: {
      description: "Runs a specific demo's sequence in the current session.",
      handler: async (payload) => { // { sessionId: string, demoId: string }
          // This is highly conceptual and would require a demo runner service.
          // The demo runner would need to iterate through demo steps and call assert/query tools.
          // For now, a placeholder acknowledging the request.
          logger.info(`[Tool:run_demo_in_session] Request to run demo ${payload.demoId} in session ${payload.sessionId}. This needs a demo execution engine.`);
          // Simulate interaction for 'simpleAssertionsDemo'
          if (payload.demoId === 'simpleAssertionsDemo' && payload.sessionId) {
              const steps = [
                  "Assert: Socrates is a human.",
                  "Assert: All humans are mortal."
              ];
              let results = [];
              for (const step of steps) {
                  if (step.startsWith("Assert: ")) {
                      const nl = step.substring("Assert: ".length);
                      const res = await mcrService.assertNLToSession(payload.sessionId, nl);
                      results.push({ step, res });
                  }
              }
              return { success: true, message: `Demo '${payload.demoId}' steps simulated.`, results };
          }
          return { success: false, error: { message: `Demo runner for '${payload.demoId}' not implemented.` }};
      }
  },

  // System Analysis Mode Tools (placeholders, to be fleshed out)
  get_strategy_performance: {
    description: "Retrieves performance data for strategies.",
    handler: async (payload) => ({ success: false, error: { message: "Tool 'get_strategy_performance' not implemented yet."}}),
  },
  get_evaluation_cases: {
    description: "Retrieves evaluation cases.",
    handler: async (payload) => ({ success: false, error: { message: "Tool 'get_evaluation_cases' not implemented yet."}}),
  },
  generate_eval_variations: {
    description: "Generates variations for an evaluation case.",
    handler: async (payload) => ({ success: false, error: { message: "Tool 'generate_eval_variations' not implemented yet."}}),
  },
  run_evolver_cycle: {
    description: "Runs a single evolution cycle for strategies.",
    handler: async (payload) => ({ success: false, error: { message: "Tool 'run_evolver_cycle' not implemented yet."}}),
  },
   get_full_kb_for_session: { // New tool needed for live KB view
    description: "Retrieves the complete knowledge base for a session.",
    handler: async (payload) => {
        const { sessionId } = payload;
        if (!sessionId) {
            return { success: false, error: { code: 'MISSING_PARAM', message: 'sessionId is required.' } };
        }
        // This needs to be implemented in mcrService or sessionStore and exposed.
        // Assuming sessionStore.getKnowledgeBase(sessionId) exists and returns the full KB string.
        // And mcrService is augmented or we call sessionStore directly if architecturally sound.
        // For now, directly accessing sessionStore for demonstration (requires sessionStore to be exported or passed)
        // This is a placeholder for proper implementation via mcrService.
        try {
            // const kb = await sessionStore.getKnowledgeBase(sessionId); // Ideal if sessionStore is accessible
            // Let's assume mcrService gets a method for this:
            const kb = await mcrService.getKnowledgeBaseForSession(sessionId); // Hypothetical method
            if (kb === null) { // Session might exist but KB is null if not initialized or error
                 return { success: false, error: { code: 'KB_NOT_FOUND', message: `Knowledge base not found for session ${sessionId}.` } };
            }
            return { success: true, data: { knowledgeBase: kb } };
        } catch (e) {
             logger.error(`[Tool:get_full_kb_for_session] Error getting KB for session ${sessionId}: ${e.message}`);
             return { success: false, error: {code: 'KB_RETRIEVAL_ERROR', message: e.message }};
        }
    }
  },
};

module.exports = toolDefinitions;

// Helper to add getKnowledgeBaseForSession to mcrService for the new tool
// Ensure logger is available if this module is loaded early
// Note: The previous patch for mcrService.getKnowledgeBaseForSession was removed.
// It's assumed that mcrService.js has been updated with this method directly.
// The get_full_kb_for_session handler below relies on this.

if (!logger) {
    console.error("[tools.js] Logger not available at load time. Some tool operations might not be fully logged until logger is properly initialized.");
    // Basic fallback logger
    global.logger = {
        debug: (...args) => console.debug('[tools.js-fallback]', ...args),
        info: (...args) => console.info('[tools.js-fallback]', ...args),
        warn: (...args) => console.warn('[tools.js-fallback]', ...args),
        error: (...args) => console.error('[tools.js-fallback]', ...args)
    };
}
