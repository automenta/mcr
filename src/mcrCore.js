/**
 * MCR Core Initialization and Service Access
 *
 * This module is responsible for initializing core MCR services
 * and providing a unified way to access them, whether running as a server
 * or using MCR as a direct library (e.g., in demos, sandbox, TUI).
 */
const ConfigManager = require('./config'); // To be used by callers, not directly here for init
const LlmService = require('./llmService');
const SessionManager = require('./sessionManager');
const ReasonerService = require('./reasonerService');
const { logger } = require('./logger');
const ApiError = require('./errors'); // For consistent error handling if needed

// Import necessary for facade logic, not for direct export from mcrCore unless specifically designed
const queryHandlerUtils = require('./handlers/queryHandlers'); // For _simplifyPrologResults

let coreInitialized = false;

const mcrCore = {
  // Exported services for direct use if needed, though facades are preferred for demos/sandbox
  LlmService: null, // Will be set after init
  SessionManager: null, // Will be set after init
  ReasonerService: null, // Will be set after init

  isInitialized: () => coreInitialized,

  /**
   * Initializes core MCR services. Must be called before using other MCR functionalities.
   * @param {object} appConfig - The application configuration object, typically from ConfigManager.get().
   * @returns {Promise<void>}
   */
  init: async (appConfig) => { // Renamed from asyncinit to init
    if (coreInitialized) {
      logger.info('MCR Core already initialized.');
      return;
    }
    if (!appConfig) {
      // This error should ideally be caught by the calling code
      logger.error("MCR Core initialization requires an application configuration object.");
      throw new Error("MCR Core initialization requires an application configuration object.");
    }

    // Dynamically import services here to avoid potential circular dependencies at module load time
    // and to ensure they are fresh if re-initializing (though current design is single init)
    const LlmService = require('./llmService');
    const SessionManager = require('./sessionManager');
    const ReasonerService = require('./reasonerService');

    mcrCore.LlmService = LlmService;
    mcrCore.SessionManager = SessionManager;
    mcrCore.ReasonerService = ReasonerService;

    logger.info('Initializing MCR Core services...');
    // LlmService.init expects the full appConfig, it will pick appConfig.llm from it.
    await LlmService.init(appConfig);

    // SessionManager and ReasonerService are typically stateless or initialize themselves on first use
    // or their state is managed via their constructor/static methods.
    // If SessionManager needs explicit initialization (e.g. to load ontologies from disk on startup),
    // it should be done here. Based on current understanding, SessionManager.js seems to manage this.
    // For example, SessionManager loads global ontologies when it's first required or through a dedicated init method.
    // If SessionManager has an init method, call it here.
    // await SessionManager.init(appConfig.ontology.storagePath, appConfig.session.storagePath); // Example if it had one

    coreInitialized = true;
    logger.info('MCR Core services initialized successfully.');
  },

  // --- Facade Functions ---
  // These functions replicate the core logic of the handlers.

  /**
   * Creates a new reasoning session.
   * @returns {object} The created session object.
   * @throws {Error} If MCR Core is not initialized.
   */
  createSession: () => {
    if (!coreInitialized) throw new Error("MCR Core not initialized. Call mcrCore.init() first.");
    return mcrCore.SessionManager.create();
  },

  // getSession facade removed as it's not used by demos. API handlers use SessionManager directly.

  /**
   * Deletes a session.
   * @param {string} sessionId - The ID of the session to delete.
   * @returns {object} A confirmation message.
   * @throws {Error} If MCR Core is not initialized.
   */
  deleteSession: (sessionId) => {
    if (!coreInitialized) throw new Error("MCR Core not initialized. Call mcrCore.init() first.");
    mcrCore.SessionManager.delete(sessionId); // Assuming this throws on error or if not found
    return { message: `Session ${sessionId} terminated.`, sessionId };
  },

  /**
   * Asserts facts into a session.
   * @param {string} sessionId - The ID of the session.
   * @param {string} text - Natural language text containing facts.
   * @returns {Promise<object>} Assertion results including added facts and total facts.
   * @throws {Error} If MCR Core is not initialized or other processing errors occur.
   */
  assertFacts: async (sessionId, text) => {
    if (!coreInitialized) throw new Error("MCR Core not initialized. Call mcrCore.init() first.");
    const currentSession = mcrCore.SessionManager.get(sessionId); // Throws if session not found
    const currentFacts = currentSession.facts.join('\\n');
    const ontologyContext = mcrCore.SessionManager.getNonSessionOntologyFacts(sessionId).join('\\n');

    const newFacts = await mcrCore.LlmService.nlToRulesAsync(
      text,
      currentFacts,
      ontologyContext
    );
    mcrCore.SessionManager.addFacts(sessionId, newFacts);
    const updatedSession = mcrCore.SessionManager.get(sessionId);
    return {
      addedFacts: newFacts,
      totalFactsInSession: updatedSession.factCount,
      metadata: { success: true },
    };
  },

  /**
   * Performs a query against a session.
   * @param {string} sessionId - The ID of the session.
   * @param {string} queryText - The natural language query.
   * @param {object} [options={ style: 'conversational', debug: false }] - Query options.
   * @param {string} [dynamicOntologyContent=null] - Optional string of Prolog rules for dynamic context.
   * @returns {Promise<object>} The query response including Prolog query, result, NL answer, and debug info if requested.
   * @throws {Error} If MCR Core is not initialized or other processing errors occur.
   */
  query: async (sessionId, queryText, options = { style: 'conversational', debug: false }, dynamicOntologyContent = null) => {
    if (!coreInitialized) throw new Error("MCR Core not initialized. Call mcrCore.init() first.");

    const prologQuery = await mcrCore.LlmService.queryToPrologAsync(queryText);
    // Ensure session exists before proceeding
    mcrCore.SessionManager.get(sessionId); // Throws if session not found

    const facts = mcrCore.SessionManager.getFactsWithOntology(sessionId, dynamicOntologyContent);

    let rawResults;
    try {
        rawResults = await mcrCore.ReasonerService.runQuery(facts, prologQuery);
    } catch (reasonerError) {
        logger.error(
          `Error running Prolog query for session ${sessionId}: ${reasonerError.message}`,
          { sessionId, prologQuery, factsUsed: facts }
        );
        if (
          reasonerError.message.includes('Prolog syntax error') ||
          reasonerError.message.includes('error(syntax_error')
        ) {
          throw new ApiError( // Using ApiError for consistency if this bubbles up
            400,
            `The LLM generated an invalid Prolog query. Please try rephrasing your question. Details: ${reasonerError.message}`,
            'QUERY_PROLOG_SYNTAX_ERROR'
          );
        }
        throw new ApiError(
          500,
          `Reasoner error: ${reasonerError.message}`,
          'QUERY_REASONER_FAILED'
        );
    }

    const simpleResult = queryHandlerUtils._simplifyPrologResults(rawResults, logger);
    const finalAnswer = await mcrCore.LlmService.resultToNlAsync(
      queryText,
      JSON.stringify(simpleResult),
      options.style
    );
    const zeroShotLmAnswer = await mcrCore.LlmService.getZeroShotAnswerAsync(queryText);

    const response = {
      queryProlog: prologQuery,
      result: simpleResult,
      answer: finalAnswer,
      zeroShotLmAnswer: zeroShotLmAnswer,
      metadata: { success: true, steps: rawResults.length }, // steps might be better as rawResults.length if it's an array
    };

    if (options.debug) {
      // This uses the _buildQueryDebugInfo structure from queryHandlers.js for consistency
      // It might be better to move _buildQueryDebugInfo to a shared util or replicate its essential parts here
      response.debug = {
        factsInSession: mcrCore.SessionManager.get(sessionId).facts,
        ontologyContextUsed: mcrCore.SessionManager.getNonSessionOntologyFacts(sessionId),
        fullKnowledgeBaseSentToReasoner: facts,
        prologQueryGenerated: prologQuery,
        rawReasonerResults: rawResults,
        inputToNlAnswerGeneration: {
          originalQuery: queryText,
          simplifiedLogicResult: simpleResult,
          style: options.style || 'conversational',
        },
      };
    }
    return response;
  },

  // Ontology Facades - These call SessionManager methods directly
  /**
   * Adds a new global ontology.
   * @param {string} name - The name for the new ontology.
   * @param {string} rules - Prolog rules as a string.
   * @returns {object} The created ontology object.
   * @throws {Error} If MCR Core is not initialized or ontology name/rules are invalid or name exists.
   */
  addOntology: (name, rules) => {
    if (!coreInitialized) throw new Error("MCR Core not initialized. Call mcrCore.init() first.");
    // Assuming SessionManager.addOntology handles validation and persistence
    return mcrCore.SessionManager.addOntology(name, rules);
  },

  // getOntology facade removed (demos use add/delete, API handlers use SessionManager directly).
  // getOntologies facade removed (not used by demos).
  // updateOntology facade removed (not used by demos).

  /**
   * Deletes a global ontology.
   * @param {string} name - The name of the ontology to delete.
   * @returns {object} Confirmation message.
   * @throws {Error} If MCR Core is not initialized or ontology not found.
   */
  deleteOntology: (name) => {
    if (!coreInitialized) throw new Error("MCR Core not initialized. Call mcrCore.init() first.");
    // SessionManager.deleteOntology is expected to return a result object like { message: '...', ontologyName: '...' }
    return mcrCore.SessionManager.deleteOntology(name);
  },

  // Removed TODO for other facade functions as they are not currently needed.
};

module.exports = mcrCore;
