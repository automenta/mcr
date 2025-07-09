// server/tools.js
const mcrService = require('./services/mcrService');
const ontologyService = require('./services/ontologyService'); // Assuming direct use for some ontology ops
const strategyManager = require('./services/strategyManager'); // For listing strategies
// const { broadcastKbUpdate } = require('./websocketHandler'); // Careful with circular deps if mcrService needs it directly

const toolDefinitions = {
  // Session Management
  create_session: {
    description: "Creates a new reasoning session.",
    handler: async (payload) => {
      // mcrService.createSession can take an optional sessionID.
      // If payload contains 'sessionId', pass it. Otherwise, mcrService generates one.
      const session = await mcrService.createSession(payload?.sessionId);
      // Ensure the response structure is consistent, e.g. { success: true, sessionId: session.id, ... }
      // mcrService.createSession already returns the session object which includes id.
      return { success: true, sessionDetails: session, sessionId: session.id, message: `Session ${session.id} created.` };
    }
  },
  get_session: {
    description: "Retrieves details for a specific session.",
    handler: async (payload) => {
      if (!payload || !payload.sessionId) {
        return { success: false, message: "Session ID is required." };
      }
      const session = await mcrService.getSession(payload.sessionId);
      if (session) {
        return { success: true, sessionDetails: session, sessionId: session.id };
      } else {
        return { success: false, message: `Session ${payload.sessionId} not found.`, error: 'SESSION_NOT_FOUND' };
      }
    }
  },
  delete_session: {
    description: "Deletes a session.",
    handler: async (payload) => {
      if (!payload || !payload.sessionId) {
        return { success: false, message: "Session ID is required." };
      }
      const deleted = await mcrService.deleteSession(payload.sessionId);
      if (deleted) {
        return { success: true, message: `Session ${payload.sessionId} deleted.` };
      } else {
        return { success: false, message: `Session ${payload.sessionId} not found or could not be deleted.`, error: 'SESSION_DELETE_FAILED' };
      }
    }
  },

  // Knowledge Base Interaction
  assert_facts_to_session: {
    description: "Asserts NL facts into a session. Expects { sessionId: string, naturalLanguageText: string }.",
    handler: async (payload) => {
      if (!payload || !payload.sessionId || !payload.naturalLanguageText) {
        return { success: false, message: "Session ID and naturalLanguageText are required." };
      }
      // mcrService.assertNLToSession returns { success, message, addedFacts?, strategyId?, cost?, error?, details? }
      const result = await mcrService.assertNLToSession(payload.sessionId, payload.naturalLanguageText);
      // The result from mcrService is already in a good format.
      // We might want to ensure sessionId is part of the successful response for subscription purposes in websocketHandler.
      if (result.success) {
        result.sessionId = payload.sessionId; // Ensure sessionId is in the response
      }
      return result;
    }
  },
  query_session: {
    description: "Queries a session with an NL question. Expects { sessionId: string, naturalLanguageQuestion: string, options?: object }.",
    handler: async (payload) => {
      if (!payload || !payload.sessionId || !payload.naturalLanguageQuestion) {
        return { success: false, message: "Session ID and naturalLanguageQuestion are required." };
      }
      // mcrService.querySessionWithNL returns { success, answer?, explanation?, debugInfo?, message?, error?, details?, strategyId? }
      const result = await mcrService.querySessionWithNL(payload.sessionId, payload.naturalLanguageQuestion, payload.options);
      if (result.success) {
        result.sessionId = payload.sessionId;
      }
      return result;
    }
  },
  get_session_kb: {
    description: "Gets the full knowledge base for a session. Expects { sessionId: string }.",
    // This is not directly in mcrService, but sessionStore has getKnowledgeBase.
    // We can add a helper in mcrService or call sessionStore directly if appropriate (less ideal).
    // Let's assume mcrService will get a wrapper for this. For now, direct call for structure.
    // TODO: Add getSessionKnowledgeBase to mcrService that uses sessionStore.getKnowledgeBase
    handler: async (payload) => {
      if (!payload || !payload.sessionId) {
        return { success: false, message: "Session ID is required." };
      }
      // Placeholder for mcrService.getSessionKnowledgeBase(payload.sessionId)
      // const kb = await sessionStore.getKnowledgeBase(payload.sessionId); // Direct store access not ideal from here
      const session = await mcrService.getSession(payload.sessionId); // Use existing getSession
      if (!session) {
         return { success: false, message: `Session ${payload.sessionId} not found.`, error: 'SESSION_NOT_FOUND' };
      }
      // Assuming session object from mcrService.getSession will eventually contain the KB or a method to get it.
      // For now, let's assume mcrService.getKnowledgeBase is added.
      // This is a conceptual tool, mcrService might need a new method for this.
      // Let's simulate by calling the underlying store method via mcrService if it were exposed or add a specific method.
      // For now, let's make a temporary mcrService method for this in mind:
      const kb = await mcrService.getKnowledgeBase(payload.sessionId); // Assuming this method exists or will be added to mcrService
      if (kb !== null) {
        return { success: true, sessionId: payload.sessionId, knowledgeBase: kb };
      } else {
        return { success: false, message: `Could not retrieve KB for session ${payload.sessionId}.`, error: 'KB_RETRIEVAL_FAILED' };
      }
    }
  },
  get_session_lexicon: {
    description: "Gets the lexicon summary for a session. Expects { sessionId: string }.",
    handler: async (payload) => {
      if (!payload || !payload.sessionId) {
        return { success: false, message: "Session ID is required." };
      }
      const lexiconSummary = await mcrService.getLexiconSummary(payload.sessionId);
      if (lexiconSummary !== null) {
        return { success: true, sessionId: payload.sessionId, lexiconSummary: lexiconSummary };
      } else {
        // getLexiconSummary returning null usually means session not found.
        return { success: false, message: `Could not retrieve lexicon for session ${payload.sessionId}. Session may not exist.`, error: 'LEXICON_RETRIEVAL_FAILED' };
      }
    }
  },


  // Ontology Management
  list_ontologies: {
    description: "Lists all available global ontologies. Optional payload: { includeRules: boolean }.",
    handler: async (payload) => {
      const ontologies = await ontologyService.listOntologies(payload?.includeRules || false);
      return { success: true, ontologies: ontologies };
    }
  },
  get_ontology: {
    description: "Gets the content of a specific ontology. Expects { name: string }.",
    handler: async (payload) => {
      if (!payload || !payload.name) {
        return { success: false, message: "Ontology name is required." };
      }
      const ontology = await ontologyService.getOntology(payload.name);
      if (ontology) {
        return { success: true, ontology: ontology };
      } else {
        return { success: false, message: `Ontology ${payload.name} not found.`, error: 'ONTOLOGY_NOT_FOUND' };
      }
    }
  },
  // create_ontology, update_ontology, delete_ontology might be needed later for System Analysis Mode UI

  // Strategy Management
  list_strategies: {
    description: "Lists all available translation strategies.",
    handler: async () => { // No payload needed
      const strategies = await mcrService.getAvailableStrategies(); // This is synchronous in current mcrService
      return { success: true, strategies: strategies };
    }
  },
  get_active_strategy: {
    description: "Gets the currently active base translation strategy ID.",
    handler: async () => { // No payload needed
      const activeStrategyId = await mcrService.getActiveStrategyId(); // This is synchronous
      return { success: true, activeStrategyId: activeStrategyId };
    }
  },
  set_active_strategy: {
    description: "Sets the base translation strategy for the MCR service. Expects { strategyId: string }.",
    handler: async (payload) => {
      if (!payload || !payload.strategyId) {
        return { success: false, message: "Strategy ID is required." };
      }
      const success = await mcrService.setTranslationStrategy(payload.strategyId);
      if (success) {
        return { success: true, message: `Active strategy set to ${payload.strategyId}.` };
      } else {
        return { success: false, message: `Failed to set strategy ${payload.strategyId}. It might not exist.`, error: 'SET_STRATEGY_FAILED' };
      }
    }
  },

  // Direct Translation (utility)
  translate_nl_to_rules: {
    description: "Translates NL text directly to Prolog rules. Expects { naturalLanguageText: string, strategyIdToUse?: string }.",
    handler: async (payload) => {
      if (!payload || !payload.naturalLanguageText) {
        return { success: false, message: "naturalLanguageText is required." };
      }
      return mcrService.translateNLToRulesDirect(payload.naturalLanguageText, payload.strategyIdToUse);
    }
  },
  translate_rules_to_nl: {
    description: "Translates Prolog rules directly to NL. Expects { prologRules: string, style?: string }.",
    handler: async (payload) => {
      if (!payload || !payload.prologRules) {
        return { success: false, message: "prologRules are required." };
      }
      return mcrService.translateRulesToNLDirect(payload.prologRules, payload.style);
    }
  },

  // Debugging & Utility
  debug_format_prompt: {
    description: "Formats a prompt template with variables for debugging. Expects { templateName: string, inputVariables: object }.",
    handler: async (payload) => {
      if (!payload || !payload.templateName || !payload.inputVariables) {
        return { success: false, message: "templateName and inputVariables are required." };
      }
      return mcrService.debugFormatPrompt(payload.templateName, payload.inputVariables);
    }
  },
  get_all_prompts: {
    description: "Retrieves all available prompt templates.",
    handler: async () => { // No payload
        return mcrService.getPrompts();
    }
  },
  // TODO: Add tools for System Analysis Mode:
  // get_strategy_performance_summary (from performance_results.db)
  // list_eval_cases, get_eval_case_content, save_eval_case_content
  // (CurriculumGenerator might be a service method called by a tool)
  // (Evolver control panel tools: run_bootstrap, run_evolution_cycle, etc.)
};

module.exports = toolDefinitions;
