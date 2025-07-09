// src/mcrService.js
const llmService = require('./llmService');
const reasonerService = require('./reasonerService');
// const sessionManager = require('./sessionManager'); // Old import
const InMemorySessionStore = require('../../src/InMemorySessionStore');
const FileSessionStore = require('../../src/FileSessionStore'); // Import FileSessionStore
const ontologyService = require('./ontologyService');
const { prompts, fillTemplate, getPromptTemplateByName } = require('../prompts');
const logger = require('../logger');
const config = require('../config');
const strategyManager = require('./strategyManager');
const StrategyExecutor = require('./strategyExecutor');
const { MCRError, ErrorCodes } = require('../errors');
const KeywordInputRouter = require('../../src/evolution/keywordInputRouter.js');
const db = require('../database');

// Instantiate the session store based on configuration
let sessionStore;
const storeType = config.sessionStore?.type?.toLowerCase();

if (storeType === 'file') {
  sessionStore = new FileSessionStore();
  logger.info('[McrService] Using FileSessionStore.');
} else {
  // Default to InMemorySessionStore if type is 'memory', undefined, or invalid
  if (storeType !== 'memory' && storeType !== undefined) {
    logger.warn(
      `[McrService] Invalid MCR_SESSION_STORE_TYPE "${config.sessionStore.type}". Defaulting to "memory".`
    );
  }
  sessionStore = new InMemorySessionStore();
  logger.info('[McrService] Using InMemorySessionStore.');
}

// Initialize the selected session store
sessionStore.initialize().catch((error) => {
  logger.error(
    '[McrService] Critical error: Failed to initialize session store. Further operations may fail.',
    error
  );
  // Consider if the application should exit or operate in a degraded mode.
  // For now, it will continue, but session operations will likely fail.
  // process.exit(1); // Or throw a more specific error to be caught by a global error handler
});

let inputRouterInstance;
try {
  inputRouterInstance = new KeywordInputRouter(db);
  logger.info('[McrService] InputRouter initialized.');
} catch (error) {
  logger.error(
    '[McrService] Failed to initialize InputRouter. Routing will be disabled.',
    error
  );
  inputRouterInstance = null;
}

// let baseStrategyId = config.translationStrategy; // REMOVED GLOBAL

async function getOperationalStrategyJson(operationType, naturalLanguageText, sessionId) { // Added sessionId
  let strategyJson = null;
  const llmModelId = config.llm[config.llm.provider]?.model || 'default';
  let sessionBaseStrategyId = null;

  if (sessionId) {
    if (typeof sessionStore.getActiveStrategy === 'function') {
      try {
        sessionBaseStrategyId = await sessionStore.getActiveStrategy(sessionId);
        if (sessionBaseStrategyId) {
          logger.info(`[McrService] Session ${sessionId} has active strategy: "${sessionBaseStrategyId}"`);
        }
      } catch (e) {
        logger.warn(`[McrService] Error fetching active strategy for session ${sessionId}: ${e.message}. Falling back.`);
      }
    } else {
      logger.warn(`[McrService] sessionStore.getActiveStrategy not implemented. Cannot fetch session-specific strategy for session ${sessionId}.`);
    }
  }

  // If session has a specific strategy, it takes precedence.
  // Otherwise, consider router or system default.
  // This logic might need refinement based on desired override behavior (e.g., router vs. session explicit)

  let determinedBaseStrategyId = sessionBaseStrategyId || config.translationStrategy; // Fallback to system default if session has no specific strategy

  // Optional: Input router could still play a role, e.g., if session strategy is "auto" or to refine a general session strategy.
  // For now, keeping it simple: session explicit strategy > system default. Router is bypassed if session has explicit.
  if (!sessionBaseStrategyId && inputRouterInstance && naturalLanguageText) { // Router only if no explicit session strategy
    try {
      const recommendedStrategyHash = await inputRouterInstance.route(
        naturalLanguageText,
        llmModelId
      );
      if (recommendedStrategyHash) {
        const routerStrategy = strategyManager.getStrategyByHash(recommendedStrategyHash);
        if (routerStrategy) {
          logger.info(
            `[McrService] InputRouter recommended strategy by HASH "${recommendedStrategyHash.substring(0, 12)}" (ID: "${routerStrategy.id}") for input: "${naturalLanguageText.substring(0, 50)}..." for session ${sessionId} (no explicit session strategy).`
          );
          // If router recommends, this could become the strategy for *this operation*
          // For simplicity, let's say router can suggest the base for this operation if no session specific one.
          // This means the router's suggestion would be used instead of system default if session has no strategy.
          // To make router override system default but not session specific:
          // determinedBaseStrategyId = routerStrategy.id; // This would use router's base ID
          // However, the original logic used router to find a full strategyJson directly.
          // Let's stick to the idea that router finds a *full* strategy.
          // If router finds one, we use it, otherwise proceed with determinedBaseStrategyId (session or system default).
          strategyJson = routerStrategy;
        } else {
          logger.warn(
            `[McrService] InputRouter recommended strategy HASH "${recommendedStrategyHash.substring(0, 12)}" but it was not found by StrategyManager. Session ${sessionId}.`
          );
        }
      }
    } catch (routerError) {
      logger.error(
        `[McrService] InputRouter failed for session ${sessionId}: ${routerError.message}.`
      );
    }
  }

  if (!strategyJson) { // If router didn't provide a full strategy, build from determinedBaseStrategyId
    const operationSuffix = operationType === 'Assert' ? '-Assert' : '-Query';
    const operationalStrategyId = `${determinedBaseStrategyId}${operationSuffix}`;
    strategyJson = strategyManager.getStrategy(operationalStrategyId);

    if (strategyJson) {
      logger.info(
        `[McrService] Session ${sessionId}: Using operational strategy: "${strategyJson.id}" (derived from base "${determinedBaseStrategyId}")`
      );
    } else {
      logger.warn(
        `[McrService] Session ${sessionId}: Operational strategy "${operationalStrategyId}" not found. Trying base "${determinedBaseStrategyId}".`
      );
      strategyJson = strategyManager.getStrategy(determinedBaseStrategyId);
      if (strategyJson) {
         logger.info(`[McrService] Session ${sessionId}: Using base strategy as operational: "${strategyJson.id}"`);
      } else {
        // Final fallback to system default strategy if determinedBaseStrategyId itself (e.g. from session) is not found
        logger.warn(`[McrService] Session ${sessionId}: Base strategy "${determinedBaseStrategyId}" also not found. Falling back to system default strategy.`);
        strategyJson = strategyManager.getDefaultStrategy();
        logger.info(`[McrService] Session ${sessionId}: Using system default strategy: "${strategyJson.id}"`);
      }
    }
  }
  return strategyJson;
}

// async function logInitialStrategy() { // REMOVED
//   try {
//     const initialDisplayStrategy = await getOperationalStrategyJson(
//       'Assert',
//       'System startup initial strategy check.',
//        null // No session ID for initial log
//     );
//     logger.info(
//       `[McrService] Initialized with base translation strategy ID: "${config.translationStrategy}". Effective assertion strategy: "${initialDisplayStrategy.name}" (ID: ${initialDisplayStrategy.id})`
//     );
//   } catch (e) {
//     logger.error(
//       `[McrService] Failed to initialize with a default assertion strategy. Base ID: "${config.translationStrategy}". Error: ${e.message}`
//     );
//   }
// }
// logInitialStrategy(); // REMOVED

// /**  // REMOVED Global setTranslationStrategy
//  * Sets the base translation strategy ID for the MCR service.
//  * The system will attempt to use variants like `${strategyId}-Assert` or `${strategyId}-Query`
//  * based on the operation type, or the strategyId itself if variants are not found.
//  * @param {string} strategyId - The ID of the base strategy to set (e.g., "SIR-R1", "Direct-S1").
//  * @returns {Promise<boolean>} True if the strategy (or its variants) was found and set, false otherwise.
//  */
// async function setTranslationStrategy(strategyId) {
//   logger.debug(
//     `[McrService] Attempting to set base translation strategy ID to: ${strategyId}`
//   );
//   const assertVariantId = `${strategyId}-Assert`;
//   const queryVariantId = `${strategyId}-Query`;

//   const assertStrategyExists = strategyManager.getStrategy(assertVariantId);
//   const queryStrategyExists = strategyManager.getStrategy(queryVariantId);
//   const baseStrategyItselfExists = strategyManager.getStrategy(strategyId);

//   if (assertStrategyExists || queryStrategyExists || baseStrategyItselfExists) {
//     // const oldBaseStrategyId = baseStrategyId; // No longer global baseStrategyId
//     // baseStrategyId = strategyId; // No longer global baseStrategyId
//     // Instead, this might set a system-wide default for NEW sessions, or be fully removed.
//     // For now, let's assume it's removed in favor of per-session.
//     logger.info(`[McrService] Global setTranslationStrategy is deprecated. Use setActiveStrategyForSession.`);
//     // try {
//     //   const currentAssertStrategy = await getOperationalStrategyJson(
//     //     'Assert',
//     //     'Strategy set check.',
//     //      null // No session for a global default check
//     //   );
//     //   logger.info(
//     //     `[McrService] System default translation strategy potentially changed to "${strategyId}". Effective assertion strategy for new sessions: "${currentAssertStrategy.name}" (ID: ${currentAssertStrategy.id})`
//     //   );
//     // } catch (e) {
//     //   logger.warn(
//     //     `[McrService] System default translation strategy potentially changed to "${strategyId}", but failed to determine effective assertion strategy for logging: ${e.message}`
//     //   );
//     // }
//     return true; // Or false if truly deprecated
//   }

//   logger.warn(
//     `[McrService] Attempted to set unknown or invalid system default strategy ID: ${strategyId}.`
//   );
//   return false;
// }

/**
 * Gets the currently active strategy ID for a given session.
 * Falls back to system default if session has no specific strategy or sessionStore doesn't support it.
 * @param {string} sessionId - The ID of the session.
 * @returns {Promise<string>} The ID of the active strategy for the session.
 */
async function getActiveStrategyId(sessionId) { // Modified to take sessionId
  if (!sessionId) {
    logger.warn('[McrService] getActiveStrategyId called without sessionId. Returning system default.');
    return config.translationStrategy; // System default
  }
  if (typeof sessionStore.getActiveStrategy !== 'function') {
    logger.warn(`[McrService] sessionStore.getActiveStrategy not implemented. Session ${sessionId} will use system default strategy.`);
    return config.translationStrategy; // Fallback to system default
  }
  try {
    const strategyId = await sessionStore.getActiveStrategy(sessionId);
    return strategyId || config.translationStrategy; // Fallback to system default if session returns null/undefined
  } catch (error) {
    logger.error(`[McrService] Error getting active strategy for session ${sessionId}: ${error.message}. Falling back to system default.`);
    return config.translationStrategy;
  }
}

/**
 * Sets the active translation strategy for a specific session.
 * @param {string} sessionId - The ID of the session.
 * @param {string} strategyId - The ID of the strategy to set for this session.
 * @returns {Promise<object>} Result object: { success: boolean, message?: string, error?: object }
 */
async function setActiveStrategyForSession(sessionId, strategyId) {
  logger.debug(`[McrService] Attempting to set strategy for session ${sessionId} to: "${strategyId}"`);
  if (!sessionId || !strategyId) {
    return { success: false, error: { message: "sessionId and strategyId are required.", code: ErrorCodes.INVALID_INPUT } };
  }

  const sessionExists = await sessionStore.getSession(sessionId);
  if (!sessionExists) {
    return { success: false, error: { message: "Session not found.", code: ErrorCodes.SESSION_NOT_FOUND } };
  }

  // Validate strategyId existence using strategyManager (checks main ID and variants)
  const assertVariantId = `${strategyId}-Assert`;
  const queryVariantId = `${strategyId}-Query`;
  const assertStrategyExists = strategyManager.getStrategy(assertVariantId);
  const queryStrategyExists = strategyManager.getStrategy(queryVariantId);
  const baseStrategyItselfExists = strategyManager.getStrategy(strategyId);

  if (!(assertStrategyExists || queryStrategyExists || baseStrategyItselfExists)) {
    logger.warn(`[McrService] Attempted to set unknown strategy "${strategyId}" for session ${sessionId}. Available: ${JSON.stringify(strategyManager.getAvailableStrategies().map(s=>s.id))}`);
    return { success: false, error: { message: `Strategy "${strategyId}" not found or invalid.`, code: ErrorCodes.STRATEGY_NOT_FOUND } };
  }

  if (typeof sessionStore.setActiveStrategy !== 'function') {
    logger.error(`[McrService] sessionStore.setActiveStrategy not implemented for session ${sessionId}.`);
    return { success: false, error: { message: "Setting session strategy is not supported by the current session store.", code: "NOT_IMPLEMENTED" } };
  }

  try {
    const success = await sessionStore.setActiveStrategy(sessionId, strategyId);
    if (success) {
      logger.info(`[McrService] Strategy for session ${sessionId} successfully set to "${strategyId}".`);
      return { success: true, message: `Strategy for session ${sessionId} set to "${strategyId}".` };
    } else {
      // This path might indicate an issue within sessionStore's implementation if it's expected to always succeed or throw
      logger.error(`[McrService] sessionStore.setActiveStrategy returned false for session ${sessionId} with strategy "${strategyId}".`);
      return { success: false, error: { message: "Failed to set session strategy in store (returned false).", code: ErrorCodes.SESSION_STORE_ERROR } };
    }
  } catch (error) {
    logger.error(`[McrService] Error setting strategy for session ${sessionId} to "${strategyId}": ${error.message}`, { stack: error.stack });
    return { success: false, error: { message: error.message, code: 'SET_SESSION_STRATEGY_ERROR' } };
  }
}


/**
 * Asserts a natural language statement to a specific session.
 * It translates the NL text to Prolog facts/rules using the active assertion strategy,
 * validates them, and adds them to the session's knowledge base.
 * @param {string} sessionId - The ID of the session to assert to.
 * @param {string} naturalLanguageText - The natural language text to assert.
 * @returns {Promise<object>} An object indicating success or failure,
 *                            including added facts, strategy ID, and error details if any.
 *                            Successful structure: `{ success: true, message: string, addedFacts: string[], strategyId: string, cost?: object }`
 *                            Error structure: `{ success: false, message: string, error: string, details?: string, strategyId: string, cost?: object }`
 */
async function assertNLToSession(sessionId, naturalLanguageText) {
  const activeStrategyJson = await getOperationalStrategyJson(
    'Assert',
    naturalLanguageText,
    sessionId // Pass sessionId
  );
  const currentStrategyId = activeStrategyJson.id;
  logger.info(
    `[McrService] Enter assertNLToSession for session ${sessionId} using strategy "${activeStrategyJson.name}" (ID: ${currentStrategyId}). NL Text: "${naturalLanguageText}"`
  );
  const operationId = `assert-${Date.now()}`;

  // Use sessionStore and await the async call
  const sessionExists = await sessionStore.getSession(sessionId);
  if (!sessionExists) {
    logger.warn(
      `[McrService] Session ${sessionId} not found for assertion. OpID: ${operationId}`
    );
    return {
      success: false,
      message: 'Session not found.',
      error: ErrorCodes.SESSION_NOT_FOUND,
      strategyId: currentStrategyId,
    };
  }

  try {
    // Use sessionStore and await the async calls
    const existingFacts =
      (await sessionStore.getKnowledgeBase(sessionId)) || '';
    let ontologyRules = '';
    try {
      const globalOntologies = await ontologyService.listOntologies(true);
      if (globalOntologies && globalOntologies.length > 0) {
        ontologyRules = globalOntologies.map((ont) => ont.rules).join('\n');
      }
    } catch (ontError) {
      logger.warn(
        `[McrService] Error fetching global ontologies for context in session ${sessionId}: ${ontError.message}`
      );
    }

    const lexiconSummary = await sessionStore.getLexiconSummary(sessionId);
    const initialContext = {
      naturalLanguageText,
      existingFacts,
      ontologyRules,
      lexiconSummary,
      llm_model_id: config.llm[config.llm.provider]?.model || 'default',
    };

    logger.info(
      `[McrService] Executing strategy "${activeStrategyJson.name}" (ID: ${currentStrategyId}) for assertion. OpID: ${operationId}.`
    );
    const executor = new StrategyExecutor(activeStrategyJson);
    const executionResult = await executor.execute(
      llmService,
      reasonerService,
      initialContext
    );

    const addedFacts = executionResult; // In SIR-R1-Assert, the result of the strategy is directly the array of prolog clauses.
    const costOfExecution = null; // executionResult.totalCost; // TODO: Re-enable cost tracking if strategy executor provides it.

    // Validate addedFacts structure (array of strings)
    if (
      !Array.isArray(addedFacts) ||
      !addedFacts.every((f) => typeof f === 'string')
    ) {
      logger.error(
        `[McrService] Strategy "${currentStrategyId}" execution for assertion did not return an array of strings. OpID: ${operationId}. Output: ${JSON.stringify(addedFacts)}`,
        { costOfExecution }
      );
      throw new MCRError(
        ErrorCodes.STRATEGY_INVALID_OUTPUT,
        'Strategy execution for assertion returned an unexpected output format. Expected array of Prolog strings.'
      );
    }
    logger.debug(
      `[McrService] Strategy "${currentStrategyId}" execution returned (OpID: ${operationId}):`,
      { addedFacts, costOfExecution }
    );

    if (!addedFacts || addedFacts.length === 0) {
      logger.warn(
        `[McrService] Strategy "${currentStrategyId}" returned no facts for text: "${naturalLanguageText}". OpID: ${operationId}`,
        { costOfExecution }
      );
      return {
        success: false,
        message:
          'Could not translate text into valid facts using the current strategy.',
        error: ErrorCodes.NO_FACTS_EXTRACTED,
        strategyId: currentStrategyId,
        cost: costOfExecution,
      };
    }

    for (const factString of addedFacts) {
      const validationResult =
        await reasonerService.validateKnowledgeBase(factString);
      if (!validationResult.isValid) {
        const validationErrorMsg = `Generated Prolog is invalid: "${factString}". Error: ${validationResult.error}`;
        logger.error(
          `[McrService] Validation failed for generated Prolog. OpID: ${operationId}. Details: ${validationErrorMsg}`,
          { costOfExecution }
        );
        return {
          success: false,
          message: 'Failed to assert facts: Generated Prolog is invalid.',
          error: ErrorCodes.INVALID_GENERATED_PROLOG,
          details: validationErrorMsg,
          strategyId: currentStrategyId,
          cost: costOfExecution,
        };
      }
    }
    logger.info(
      `[McrService] All ${addedFacts.length} generated facts validated successfully. OpID: ${operationId}`
    );

    // Use sessionStore and await the async call
    const addSuccess = await sessionStore.addFacts(sessionId, addedFacts);
    if (addSuccess) {
      logger.info(
        `[McrService] Facts successfully added to session ${sessionId}. OpID: ${operationId}. Facts:`,
        { addedFacts, costOfExecution }
      );
      return {
        success: true,
        message: 'Facts asserted successfully.',
        addedFacts,
        strategyId: currentStrategyId,
        cost: costOfExecution,
      };
    } else {
      logger.error(
        `[McrService] Failed to add facts to session ${sessionId} after validation. OpID: ${operationId}`,
        { costOfExecution }
      );
      return {
        success: false,
        message: 'Failed to add facts to session manager after validation.',
        error: ErrorCodes.SESSION_ADD_FACTS_FAILED,
        strategyId: currentStrategyId,
        cost: costOfExecution,
      };
    }
  } catch (error) {
    logger.error(
      `[McrService] Error asserting NL to session ${sessionId} using strategy "${currentStrategyId}": ${error.message}`,
      { stack: error.stack, details: error.details, errorCode: error.code }
    );
    // Ensure cost is included in error returns if available, or null otherwise
    const cost = error.costData || null; // Assuming error object might carry costData
    return {
      success: false,
      message: `Error during assertion: ${error.message}`,
      error: error.code || ErrorCodes.STRATEGY_EXECUTION_ERROR,
      details: error.message,
      strategyId: currentStrategyId,
      cost,
    };
  }
}

/**
 * Queries a session with a natural language question.
 * It translates the NL question to a Prolog query using the active query strategy,
 * executes the query against the session's knowledge base (including global and dynamic ontologies),
 * and then translates the Prolog results back into a natural language answer.
 * @param {string} sessionId - The ID of the session to query.
 * @param {string} naturalLanguageQuestion - The natural language question.
 * @param {object} [queryOptions={}] - Optional. Options for the query.
 * @param {string} [queryOptions.dynamicOntology] - Optional. A string of Prolog rules to dynamically add to the KB for this query.
 * @param {string} [queryOptions.style="conversational"] - Optional. The desired style for the NL answer (e.g., "conversational", "technical").
 * @returns {Promise<object>} An object containing the NL answer, or an error.
 *                            Successful structure: `{ success: true, answer: string, debugInfo: object }`
 *                            Error structure: `{ success: false, message: string, debugInfo: object, error: string, details?: string, strategyId: string }`
 */
async function querySessionWithNL(
  sessionId,
  naturalLanguageQuestion,
  queryOptions = {}
) {
  const activeStrategyJson = await getOperationalStrategyJson(
    'Query',
    naturalLanguageQuestion,
    sessionId // Pass sessionId
  );
  const currentStrategyId = activeStrategyJson.id;
  const { dynamicOntology, style = 'conversational' } = queryOptions;
  logger.info(
    `[McrService] Enter querySessionWithNL for session ${sessionId} using strategy "${activeStrategyJson.name}" (ID: ${currentStrategyId}). NL Question: "${naturalLanguageQuestion}"`,
    { queryOptions }
  );
  const operationId = `query-${Date.now()}`;

  // Use sessionStore and await the async call
  const sessionExists = await sessionStore.getSession(sessionId);
  if (!sessionExists) {
    logger.warn(
      `[McrService] Session ${sessionId} not found for query. OpID: ${operationId}`
    );
    return {
      success: false,
      message: 'Session not found.',
      error: ErrorCodes.SESSION_NOT_FOUND,
      strategyId: currentStrategyId,
    };
  }

  const debugInfo = {
    strategyId: currentStrategyId,
    operationId,
    level: config.debugLevel,
  };

  try {
    // Use sessionStore and await the async calls
    const existingFacts =
      (await sessionStore.getKnowledgeBase(sessionId)) || '';
    let ontologyRules = '';
    try {
      const globalOntologies = await ontologyService.listOntologies(true);
      if (globalOntologies && globalOntologies.length > 0) {
        ontologyRules = globalOntologies.map((ont) => ont.rules).join('\n');
      }
    } catch (ontError) {
      logger.warn(
        `[McrService] Error fetching global ontologies for query strategy context (session ${sessionId}): ${ontError.message}`
      );
      debugInfo.ontologyErrorForStrategy = `Failed to load global ontologies for query translation: ${ontError.message}`;
    }

    const lexiconSummary = await sessionStore.getLexiconSummary(sessionId);
    const initialContext = {
      naturalLanguageQuestion,
      existingFacts,
      ontologyRules,
      lexiconSummary,
      llm_model_id: config.llm[config.llm.provider]?.model || 'default',
    };

    logger.info(
      `[McrService] Executing strategy "${activeStrategyJson.name}" (ID: ${currentStrategyId}) for query translation. OpID: ${operationId}.`
    );
    const executor = new StrategyExecutor(activeStrategyJson);
    const strategyExecutionResult = await executor.execute(
      llmService,
      reasonerService,
      initialContext
    );
    const prologQuery = strategyExecutionResult; // Corrected: strategyExecutionResult is the prolog query string
    // TODO: Accumulate/return strategyExecutionResult.totalCost; if execute returns an object with cost

    if (typeof prologQuery !== 'string' || !prologQuery.endsWith('.')) {
      logger.error(
        `[McrService] Strategy "${currentStrategyId}" execution for query did not return a valid Prolog query string. OpID: ${operationId}. Output: ${prologQuery}`
      );
      throw new MCRError(
        ErrorCodes.STRATEGY_INVALID_OUTPUT,
        'Strategy execution for query returned an unexpected output format. Expected Prolog query string ending with a period.'
      );
    }
    logger.info(
      `[McrService] Strategy "${currentStrategyId}" translated NL question to Prolog query (OpID: ${operationId}): ${prologQuery}`
    );
    debugInfo.prologQuery = prologQuery;

    // Use sessionStore and await the async call
    let knowledgeBase = await sessionStore.getKnowledgeBase(sessionId);
    if (knowledgeBase === null) {
      logger.error(
        `[McrService] Knowledge base is null for existing session ${sessionId}. OpID: ${operationId}. This indicates an unexpected state.`
      );
      return {
        success: false,
        message:
          'Internal error: Knowledge base not found for an existing session.',
        debugInfo,
        error: ErrorCodes.INTERNAL_KB_NOT_FOUND,
        strategyId: currentStrategyId,
      };
    }

    try {
      const globalOntologies = await ontologyService.listOntologies(true);
      if (globalOntologies && globalOntologies.length > 0) {
        knowledgeBase += `\n% --- Global Ontologies ---\n${globalOntologies.map((ont) => ont.rules).join('\n')}`;
      }
    } catch (ontError) {
      logger.error(
        `[McrService] Error fetching global ontologies for reasoner KB (session ${sessionId}): ${ontError.message}`
      );
      debugInfo.ontologyErrorForReasoner = `Failed to load global ontologies for reasoner: ${ontError.message}`;
    }

    if (
      dynamicOntology &&
      typeof dynamicOntology === 'string' &&
      dynamicOntology.trim() !== ''
    ) {
      knowledgeBase += `\n% --- Dynamic RAG Ontology (Query-Specific) ---\n${dynamicOntology.trim()}`;
      debugInfo.dynamicOntologyProvided = true;
    }

    if (config.debugLevel === 'verbose')
      debugInfo.knowledgeBaseSnapshot = knowledgeBase;
    else if (config.debugLevel === 'basic')
      debugInfo.knowledgeBaseSummary = `KB length: ${knowledgeBase.length}, Dynamic RAG: ${!!debugInfo.dynamicOntologyProvided}`;

    const prologResults = await reasonerService.executeQuery(
      knowledgeBase,
      prologQuery
    );

    if (config.debugLevel === 'verbose')
      debugInfo.prologResultsJSON = JSON.stringify(prologResults);
    else if (config.debugLevel === 'basic')
      debugInfo.prologResultsSummary = Array.isArray(prologResults)
        ? `${prologResults.length} solution(s) found.`
        : `Result: ${prologResults}`;

    const logicToNlPromptContext = {
      naturalLanguageQuestion,
      prologResultsJSON: JSON.stringify(prologResults),
      style,
    };
    const llmAnswerResult = await llmService.generate(
      prompts.LOGIC_TO_NL_ANSWER.system,
      fillTemplate(prompts.LOGIC_TO_NL_ANSWER.user, logicToNlPromptContext)
    );
    const naturalLanguageAnswerText =
      llmAnswerResult && typeof llmAnswerResult.text === 'string'
        ? llmAnswerResult.text
        : null;
    // TODO: Accumulate/return llmAnswerResult.costData

    if (config.debugLevel === 'verbose')
      debugInfo.llmTranslationResultToNL = naturalLanguageAnswerText;

    if (!naturalLanguageAnswerText) {
      // Check if LLM failed to provide an answer text
      logger.warn(
        `[McrService] LLM returned no text for LOGIC_TO_NL_ANSWER. OpID: ${operationId}`
      );
      return {
        success: false,
        message:
          'Failed to generate a natural language answer from query results.',
        debugInfo,
        error: ErrorCodes.LLM_EMPTY_RESPONSE,
        strategyId: currentStrategyId,
      };
    }

    logger.info(
      `[McrService] NL answer generated (OpID: ${operationId}): "${naturalLanguageAnswerText}"`
    );
    return { success: true, answer: naturalLanguageAnswerText, debugInfo };
  } catch (error) {
    logger.error(
      `[McrService] Error querying session ${sessionId} with NL (OpID: ${operationId}, Strategy ID: ${currentStrategyId}): ${error.message}`,
      { stack: error.stack, details: error.details, errorCode: error.code }
    );
    debugInfo.error = error.message;
    return {
      success: false,
      message: `Error during query: ${error.message}`,
      debugInfo,
      error: error.code || ErrorCodes.STRATEGY_EXECUTION_ERROR,
      details: error.message,
      strategyId: currentStrategyId,
    };
  }
}

// Removed translateNLToRulesDirect, translateRulesToNLDirect, explainQuery as they are now in translationService.js
// Those functions are now being moved back into mcrService.js

// START: Functions moved from translationService.js

/**
 * Translates natural language text directly into Prolog rules using an assertion strategy.
 * This function bypasses session management and directly uses a strategy (typically an assert strategy)
 * to convert NL into one or more Prolog rule strings.
 * @param {string} naturalLanguageText - The natural language text to translate.
 * @param {string} [strategyIdToUse] - Optional. Specific base strategy ID to use (e.g., "SIR-R1").
 *                                     If not provided, uses the mcrService's current base strategy.
 *                                     The function will attempt to use an assert variant (e.g., `${strategyIdToUse}-Assert`).
 * @returns {Promise<object>} An object containing the translated rules or an error.
 *                            Successful structure: `{ success: true, rules: string[], strategyId: string }`
 *                            Error structure: `{ success: false, message: string, error: string, details?: string, strategyId: string }`
 */
async function translateNLToRulesDirect(naturalLanguageText, strategyIdToUse) {
  // Use getOperationalStrategyJson from mcrService
  // For direct translation, there's no session, so pass null for sessionId
  const effectiveBaseId = strategyIdToUse || config.translationStrategy; // Fallback to system default
  const strategyJsonToUse = strategyIdToUse
    ? strategyManager.getStrategy(`${effectiveBaseId}-Assert`) || // Prefer assert variant
      strategyManager.getStrategy(effectiveBaseId) ||
      (await getOperationalStrategyJson('Assert', naturalLanguageText, null)) // Fallback, no session
    : await getOperationalStrategyJson('Assert', naturalLanguageText, null); // No session

  if (!strategyJsonToUse) {
    logger.error(
      `[McrService] No valid strategy found for direct NL to Rules. Base ID used: "${effectiveBaseId}".`
    );
    return {
      success: false,
      message: `No valid strategy could be determined for direct translation using base ID "${effectiveBaseId}".`,
      error: ErrorCodes.STRATEGY_NOT_FOUND,
      strategyId: effectiveBaseId, // This is the base ID that was attempted
    };
  }
  const currentStrategyId = strategyJsonToUse.id;
  const operationId = `transNLToRules-${Date.now()}`;
  logger.info(
    `[McrService] Enter translateNLToRulesDirect (OpID: ${operationId}). Strategy ID: "${currentStrategyId}". NL Text: "${naturalLanguageText}"`
  );

  try {
    logger.info(
      `[McrService] Using strategy "${strategyJsonToUse.name}" (ID: ${currentStrategyId}) for direct NL to Rules. OpID: ${operationId}`
    );
    const globalOntologyRules =
      await ontologyService.getGlobalOntologyRulesAsString();
    const initialContext = {
      naturalLanguageText,
      ontologyRules: globalOntologyRules,
      lexiconSummary: 'No lexicon summary available for direct translation.',
      existingFacts: '',
      llm_model_id: config.llm[config.llm.provider]?.model || 'default',
    };

    const executor = new StrategyExecutor(strategyJsonToUse);
    const executionResult = await executor.execute(
      llmService,
      reasonerService, // reasonerService might not be used by all assert strategies but executor expects it
      initialContext
    );
    const prologRules = executionResult; // Assuming direct strategies return the array of strings
    // TODO: Handle executionResult.totalCost; if execute returns an object with cost

    if (
      !Array.isArray(prologRules) ||
      !prologRules.every((r) => typeof r === 'string')
    ) {
      logger.error(
        `[McrService] Strategy "${currentStrategyId}" execution for direct translation did not return an array of strings. OpID: ${operationId}. Output: ${JSON.stringify(prologRules)}`
      );
      throw new MCRError(
        ErrorCodes.STRATEGY_INVALID_OUTPUT,
        'Strategy execution for direct translation returned an unexpected output format. Expected array of Prolog strings.'
      );
    }
    logger.debug(
      `[McrService] Strategy "${currentStrategyId}" execution returned (OpID: ${operationId}):`,
      { prologRules }
    );

    if (!prologRules || prologRules.length === 0) {
      logger.warn(
        `[McrService] Strategy "${currentStrategyId}" extracted no rules from text (OpID: ${operationId}): "${naturalLanguageText}"`
      );
      return {
        success: false,
        message: 'Could not translate text into valid rules.',
        error: ErrorCodes.NO_RULES_EXTRACTED,
        strategyId: currentStrategyId,
      };
    }
    logger.info(
      `[McrService] Successfully translated NL to Rules (Direct). OpID: ${operationId}. Rules count: ${prologRules.length}. Strategy ID: ${currentStrategyId}`
    );
    return { success: true, rules: prologRules, strategyId: currentStrategyId };
  } catch (error) {
    logger.error(
      `[McrService] Error translating NL to Rules (Direct) using strategy "${currentStrategyId}" (OpID: ${operationId}): ${error.message}`,
      { stack: error.stack, details: error.details, errorCode: error.code }
    );
    return {
      success: false,
      message: `Error during NL to Rules translation: ${error.message}`,
      error: error.code || ErrorCodes.STRATEGY_EXECUTION_ERROR,
      details: error.message,
      strategyId: currentStrategyId,
    };
  }
}

/**
 * Translates Prolog rules directly into a natural language explanation.
 * This function uses an LLM with a specific prompt to explain the given Prolog rules.
 * @param {string} prologRules - A string containing the Prolog rules to explain.
 * @param {string} [style="conversational"] - The desired style for the NL explanation (e.g., "conversational", "technical").
 * @returns {Promise<object>} An object containing the NL explanation or an error.
 *                            Successful structure: `{ success: true, explanation: string }`
 *                            Error structure: `{ success: false, message: string, error: string, details?: string }`
 */
async function translateRulesToNLDirect(prologRules, style = 'conversational') {
  const operationId = `transRulesToNL-${Date.now()}`;
  logger.info(
    `[McrService] Enter translateRulesToNLDirect (OpID: ${operationId}). Style: ${style}. Rules length: ${prologRules?.length}`
  );
  logger.debug(
    `[McrService] Rules for direct translation to NL (OpID: ${operationId}):\n${prologRules}`
  );

  if (
    !prologRules ||
    typeof prologRules !== 'string' ||
    prologRules.trim() === ''
  ) {
    logger.warn(
      `[McrService] translateRulesToNLDirect called with empty or invalid prologRules. OpID: ${operationId}`
    );
    return {
      success: false,
      message: 'Input Prolog rules must be a non-empty string.',
      error: ErrorCodes.EMPTY_RULES_INPUT,
    };
  }

  const directRulesToNlPrompt = getPromptTemplateByName('RULES_TO_NL_DIRECT');
  if (!directRulesToNlPrompt) {
    logger.error('[McrService] RULES_TO_NL_DIRECT prompt template not found.');
    return {
      success: false,
      message: 'Internal error: RULES_TO_NL_DIRECT prompt template not found.',
      error: ErrorCodes.PROMPT_TEMPLATE_NOT_FOUND,
    };
  }

  try {
    const promptContext = { prologRules, style };
    logger.info(
      `[McrService] Generating NL explanation from rules using LLM. OpID: ${operationId}`
    );
    logger.debug(
      `[McrService] Context for RULES_TO_NL_DIRECT prompt (OpID: ${operationId}):`,
      promptContext
    );
    const rulesToNLPromptUser = fillTemplate(
      directRulesToNlPrompt.user,
      promptContext
    );

    const llmExplanationResult = await llmService.generate(
      directRulesToNlPrompt.system,
      rulesToNLPromptUser
    );
    let nlExplanationText = null;
    if (llmExplanationResult && typeof llmExplanationResult.text === 'string') {
      nlExplanationText = llmExplanationResult.text;
    } else if (llmExplanationResult && llmExplanationResult.text === null) {
      nlExplanationText = null;
    }

    logger.debug(
      `[McrService] Prolog rules translated to NL (Direct) (OpID: ${operationId}):\n${nlExplanationText}`
    );

    if (
      nlExplanationText === null ||
      (typeof nlExplanationText === 'string' && nlExplanationText.trim() === '')
    ) {
      logger.warn(
        `[McrService] Empty explanation generated for rules to NL (Direct). OpID: ${operationId}`
      );
      return {
        success: false,
        message: 'Failed to generate a natural language explanation.',
        error: ErrorCodes.EMPTY_EXPLANATION_GENERATED,
      };
    }
    logger.info(
      `[McrService] Successfully translated Rules to NL (Direct). OpID: ${operationId}. Explanation length: ${nlExplanationText.length}.`
    );
    return { success: true, explanation: nlExplanationText };
  } catch (error) {
    logger.error(
      `[McrService] Error translating Rules to NL (Direct) (OpID: ${operationId}): ${error.message}`,
      { error: error.stack }
    );
    return {
      success: false,
      message: `Error during Rules to NL translation: ${error.message}`,
      error: error.code || 'RULES_TO_NL_TRANSLATION_FAILED',
      details: error.message,
    };
  }
}

/**
 * Explains a natural language question in the context of a session.
 * First, it translates the NL question to a Prolog query using the active query strategy.
 * Then, it uses another LLM call with a specific prompt (EXPLAIN_PROLOG_QUERY) to generate
 * a natural language explanation of what that Prolog query means or how it might be resolved,
 * considering the session's facts and global ontologies as context.
 * @param {string} sessionId - The ID of the session for context.
 * @param {string} naturalLanguageQuestion - The natural language question to explain.
 * @returns {Promise<object>} An object containing the NL explanation or an error.
 *                            Successful structure: `{ success: true, explanation: string, debugInfo: object }`
 *                            Error structure: `{ success: false, message: string, debugInfo: object, error: string, details?: string, strategyId: string }`
 */
async function explainQuery(sessionId, naturalLanguageQuestion) {
  // Use getOperationalStrategyJson from mcrService
  const activeStrategyJson = await getOperationalStrategyJson(
    'Query',
    naturalLanguageQuestion,
    sessionId // Pass sessionId
  );
  const currentStrategyId = activeStrategyJson.id;
  const operationId = `explain-${Date.now()}`;

  logger.info(
    `[McrService] Enter explainQuery for session ${sessionId} (OpID: ${operationId}). Strategy: "${activeStrategyJson.name}" (ID: ${currentStrategyId}). NL Question: "${naturalLanguageQuestion}"`
  );

  // Use sessionStore and await the async call
  const sessionExists = await sessionStore.getSession(sessionId);
  if (!sessionExists) {
    return {
      success: false,
      message: 'Session not found.',
      error: ErrorCodes.SESSION_NOT_FOUND,
      strategyId: currentStrategyId,
    };
  }

  const debugInfo = {
    naturalLanguageQuestion,
    strategyId: currentStrategyId,
    operationId,
    level: config.debugLevel,
  };

  const explainPrologQueryPrompt = getPromptTemplateByName(
    'EXPLAIN_PROLOG_QUERY'
  );
  if (!explainPrologQueryPrompt) {
    logger.error(
      '[McrService] EXPLAIN_PROLOG_QUERY prompt template not found.'
    );
    return {
      success: false,
      message:
        'Internal error: EXPLAIN_PROLOG_QUERY prompt template not found.',
      error: ErrorCodes.PROMPT_TEMPLATE_NOT_FOUND,
      debugInfo,
    };
  }

  try {
    // Use sessionStore and await the async calls
    const existingFacts =
      (await sessionStore.getKnowledgeBase(sessionId)) || '';
    let contextOntologyRulesForQueryTranslation = '';
    try {
      const globalOntologies = await ontologyService.listOntologies(true);
      if (globalOntologies && globalOntologies.length > 0) {
        contextOntologyRulesForQueryTranslation = globalOntologies
          .map((ont) => ont.rules)
          .join('\n');
      }
    } catch (ontError) {
      logger.warn(
        `[McrService] Error fetching global ontologies for NL_TO_QUERY context in explain (OpID: ${operationId}): ${ontError.message}`
      );
      debugInfo.ontologyErrorForStrategy = `Failed to load global ontologies for query translation context: ${ontError.message}`;
    }

    const lexiconSummary = await sessionStore.getLexiconSummary(sessionId);
    const initialStrategyContext = {
      naturalLanguageQuestion,
      existingFacts,
      ontologyRules: contextOntologyRulesForQueryTranslation,
      lexiconSummary,
      llm_model_id: config.llm[config.llm.provider]?.model || 'default',
    };

    logger.info(
      `[McrService] Executing strategy "${activeStrategyJson.name}" (ID: ${currentStrategyId}) for query translation in explain. OpID: ${operationId}.`
    );
    const executor = new StrategyExecutor(activeStrategyJson);
    const strategyExecutionResult = await executor.execute(
      llmService,
      reasonerService, // reasonerService might not be used by all query strategies but executor expects it
      initialStrategyContext
    );
    const prologQuery = strategyExecutionResult;

    if (typeof prologQuery !== 'string' || !prologQuery.endsWith('.')) {
      logger.error(
        `[McrService] Strategy "${currentStrategyId}" execution for explain query did not return a valid Prolog query string. OpID: ${operationId}. Output: ${prologQuery}`
      );
      throw new MCRError(
        ErrorCodes.STRATEGY_INVALID_OUTPUT,
        'Strategy execution for explain query returned an unexpected output format. Expected Prolog query string ending with a period.'
      );
    }
    logger.info(
      `[McrService] Strategy "${currentStrategyId}" translated NL to Prolog query for explanation (OpID: ${operationId}): ${prologQuery}`
    );
    debugInfo.prologQuery = prologQuery;

    if (config.debugLevel === 'verbose')
      debugInfo.sessionFactsSnapshot = existingFacts;
    else if (config.debugLevel === 'basic')
      debugInfo.sessionFactsSummary = `Session facts length: ${existingFacts.length}`;

    let explainPromptOntologyRules = '';
    try {
      const ontologiesForExplainPrompt =
        await ontologyService.listOntologies(true);
      if (ontologiesForExplainPrompt && ontologiesForExplainPrompt.length > 0) {
        explainPromptOntologyRules = ontologiesForExplainPrompt
          .map((ont) => ont.rules)
          .join('\n');
      }
    } catch (ontErrorForExplain) {
      logger.warn(
        `[McrService] Error fetching global ontologies for EXPLAIN_PROLOG_QUERY prompt context (OpID: ${operationId}): ${ontErrorForExplain.message}`
      );
      debugInfo.ontologyErrorForPrompt = `Failed to load global ontologies for explanation prompt: ${ontErrorForExplain.message}`;
    }
    if (config.debugLevel === 'verbose')
      debugInfo.ontologyRulesForPromptSnapshot = explainPromptOntologyRules;

    const explainPromptContext = {
      naturalLanguageQuestion,
      prologQuery,
      sessionFacts: existingFacts,
      ontologyRules: explainPromptOntologyRules,
    };
    const llmExplanationResult = await llmService.generate(
      explainPrologQueryPrompt.system,
      fillTemplate(explainPrologQueryPrompt.user, explainPromptContext)
    );
    const explanationText =
      llmExplanationResult && typeof llmExplanationResult.text === 'string'
        ? llmExplanationResult.text
        : null;

    if (
      !explanationText ||
      (typeof explanationText === 'string' && explanationText.trim() === '')
    ) {
      return {
        success: false,
        message: 'Failed to generate an explanation for the query.',
        debugInfo,
        error: ErrorCodes.LLM_EMPTY_RESPONSE,
        strategyId: currentStrategyId,
      };
    }
    return { success: true, explanation: explanationText, debugInfo };
  } catch (error) {
    logger.error(
      `[McrService] Error explaining query for session ${sessionId} (OpID: ${operationId}, Strategy ID: ${currentStrategyId}): ${error.message}`,
      { stack: error.stack, details: error.details, errorCode: error.code }
    );
    debugInfo.error = error.message;
    return {
      success: false,
      message: `Error during query explanation: ${error.message}`,
      debugInfo,
      error: error.code || ErrorCodes.STRATEGY_EXECUTION_ERROR,
      details: error.message,
      strategyId: currentStrategyId,
    };
  }
}

// END: Functions moved from translationService.js

/**
 * Retrieves all available prompt templates known to the system.
 * @returns {Promise<object>} An object containing all prompt templates or an error.
 *                            Successful structure: `{ success: true, prompts: object }`
 *                            Error structure: `{ success: false, message: string, error: string, details?: string }`
 */
async function getPrompts() {
  const operationId = `getPrompts-${Date.now()}`;
  logger.info(`[McrService] Enter getPrompts (OpID: ${operationId})`);
  try {
    logger.debug(
      `[McrService] Successfully retrieved prompts. OpID: ${operationId}. Prompt count: ${Object.keys(prompts).length}`
    );
    return { success: true, prompts: prompts };
  } catch (error) {
    logger.error(
      `[McrService] Error retrieving prompts (OpID: ${operationId}): ${error.message}`,
      { error: error.stack }
    );
    return {
      success: false,
      message: `Error retrieving prompts: ${error.message}`,
      error: error.code || 'GET_PROMPTS_FAILED',
      details: error.message,
    };
  }
}

/**
 * Formats a specified prompt template with given input variables for debugging purposes.
 * This allows developers to see how a prompt would look after template substitution.
 * @param {string} templateName - The name of the prompt template to format (e.g., "NL_TO_SIR_ASSERT").
 * @param {object} inputVariables - An object containing key-value pairs for variables expected by the template.
 * @returns {Promise<object>} An object containing the formatted prompt and related info, or an error.
 *                            Successful structure: `{ success: true, templateName: string, rawTemplate: object, formattedUserPrompt: string, inputVariables: object }`
 *                            Error structure: `{ success: false, message: string, error: string, details?: string }`
 */
async function debugFormatPrompt(templateName, inputVariables) {
  const operationId = `debugFormat-${Date.now()}`;
  logger.info(
    `[McrService] Enter debugFormatPrompt (OpID: ${operationId}). Template: ${templateName}`,
    { inputVariables }
  );

  if (!templateName || typeof templateName !== 'string') {
    logger.warn(
      `[McrService] Invalid template name for debugFormatPrompt. OpID: ${operationId}`,
      { templateName }
    );
    return {
      success: false,
      message: 'Template name must be a non-empty string.',
      error: 'INVALID_TEMPLATE_NAME',
    };
  }
  if (!inputVariables || typeof inputVariables !== 'object') {
    logger.warn(
      `[McrService] Invalid input variables for debugFormatPrompt (OpID: ${operationId}). Received: ${typeof inputVariables}`,
      { inputVariables }
    );
    return {
      success: false,
      message: 'Input variables must be an object.',
      error: 'INVALID_INPUT_VARIABLES',
    };
  }

  const template = prompts[templateName];
  if (!template) {
    logger.warn(
      `[McrService] Prompt template "${templateName}" not found for debugFormatPrompt. OpID: ${operationId}`
    );
    return {
      success: false,
      message: `Prompt template "${templateName}" not found.`,
      error: 'TEMPLATE_NOT_FOUND',
    };
  }
  if (!template.user) {
    logger.warn(
      `[McrService] Prompt template "${templateName}" has no 'user' field for debugFormatPrompt. OpID: ${operationId}`
    );
    return {
      success: false,
      message: `Prompt template "${templateName}" does not have a 'user' field to format.`,
      error: 'TEMPLATE_USER_FIELD_MISSING',
    };
  }

  try {
    logger.debug(
      `[McrService] Attempting to fill template "${templateName}" with variables. OpID: ${operationId}`
    );
    const formattedUserPrompt = fillTemplate(template.user, inputVariables);
    logger.info(
      `[McrService] Successfully formatted prompt "${templateName}". OpID: ${operationId}`
    );
    return {
      success: true,
      templateName,
      rawTemplate: template,
      formattedUserPrompt,
      inputVariables,
    };
  } catch (error) {
    logger.error(
      `[McrService] Error formatting prompt ${templateName} (OpID: ${operationId}): ${error.message}`,
      { error: error.stack }
    );
    return {
      success: false,
      message: `Error formatting prompt: ${error.message}`,
      error: error.code || 'PROMPT_FORMATTING_FAILED',
      details: error.message,
    };
  }
}

module.exports = {
  assertNLToSession,
  querySessionWithNL,
  // setTranslationStrategy, // REMOVED global setter
  getActiveStrategyId, // Now takes sessionId
  setActiveStrategyForSession, // ADDED for per-session strategy setting
  // Updated session management functions to use sessionStore and be async
  /**
   * Creates a new session.
   * @param {string} [sessionId] - Optional. The ID for the session. If not provided, a new one will be generated.
   * @returns {Promise<object>} The created session object. Refer to ISessionStore.createSession for details.
   */
  createSession: async (sessionId) => {
    // Ensure it's async and can take an optional sessionId
    return sessionStore.createSession(sessionId);
  },
  /**
   * Retrieves a session by its ID.
   * @param {string} sessionId - The ID of the session.
   * @returns {Promise<object|null>} The session object or null if not found. Refer to ISessionStore.getSession for details.
   */
  getSession: async (sessionId) => {
    // Ensure it's async
    return sessionStore.getSession(sessionId);
  },
  /**
   * Deletes a session.
   * @param {string} sessionId - The ID of the session to delete.
   * @returns {Promise<boolean>} True if the session was deleted, false if not found. Refer to ISessionStore.deleteSession for details.
   */
  deleteSession: async (sessionId) => {
    // Ensure it's async
    return sessionStore.deleteSession(sessionId);
  },
  /**
   * Retrieves a summary of the lexicon for a given session.
   * @param {string} sessionId - The ID of the session.
   * @returns {Promise<string|null>} A string representing the lexicon summary or null if session not found. Refer to ISessionStore.getLexiconSummary for details.
   */
  getLexiconSummary: async (sessionId) => {
    // Ensure it's async
    return sessionStore.getLexiconSummary(sessionId);
  },
  translateNLToRulesDirect, // Now directly in mcrService
  translateRulesToNLDirect, // Now directly in mcrService
  explainQuery, // Now directly in mcrService
  getPrompts,
  debugFormatPrompt,
  getAvailableStrategies: strategyManager.getAvailableStrategies,

  // System Analysis Methods (Stubs for now)
  getStrategyPerformanceData,
  getEvaluationCases,
  createEvaluationCase,
  updateEvaluationCase,
  generateEvaluationCaseVariations,
  runEvolutionCycle,
  getEvolverStatus,

  /**
   * Retrieves the full knowledge base for a given session.
   * @param {string} sessionId - The ID of the session.
   * @returns {Promise<object>} { success: true, data: string } or { success: false, error: object }
   */
  getKnowledgeBaseForSession: async (sessionId) => {
    logger.debug(`[McrService] getKnowledgeBaseForSession called for session: ${sessionId}`);
    if (!sessionId) {
      return { success: false, error: { message: "Session ID is required.", code: ErrorCodes.INVALID_INPUT } };
    }
    const sessionExists = await sessionStore.getSession(sessionId);
    if (!sessionExists) {
      return { success: false, error: { message: "Session not found.", code: ErrorCodes.SESSION_NOT_FOUND } };
    }
    try {
      const kb = await sessionStore.getKnowledgeBase(sessionId);
      if (kb === null) { // Should not happen if sessionExists is true, but as a safeguard
        return { success: false, error: { message: "Knowledge base is null for the session.", code: ErrorCodes.INTERNAL_KB_NOT_FOUND } };
      }
      return { success: true, data: kb };
    } catch (error) {
      logger.error(`[McrService] Error retrieving knowledge base for session ${sessionId}: ${error.message}`, { stack: error.stack });
      return { success: false, error: { message: error.message, code: 'KB_RETRIEVAL_ERROR' } };
    }
  },

  /**
   * Asserts a raw Prolog string (facts or rules) to a specific session.
   * Validates the Prolog string before adding.
   * @param {string} sessionId - The ID of the session to assert to.
   * @param {string} prologString - The Prolog string to assert. Should be a single valid Prolog fact/rule or multiple, each ending with a period.
   * @returns {Promise<object>} An object indicating success or failure.
   *                            Successful structure: `{ success: true, message: string, addedProlog: string[] }`
   *                            Error structure: `{ success: false, message: string, error: string, details?: string }`
   */
  assertRawPrologToSession: async (sessionId, prologString) => {
    logger.info(`[McrService] Enter assertRawPrologToSession for session ${sessionId}. Prolog: "${prologString.substring(0, 100)}..."`);

    const sessionExists = await sessionStore.getSession(sessionId);
    if (!sessionExists) {
      return { success: false, message: 'Session not found.', error: ErrorCodes.SESSION_NOT_FOUND };
    }

    if (typeof prologString !== 'string' || prologString.trim() === '') {
        return { success: false, message: 'Prolog string cannot be empty.', error: ErrorCodes.INVALID_INPUT };
    }

    // Split the prologString into individual facts/rules if it contains multiple.
    // Simple split by '.', then filter empty strings and add '.' back. More robust parsing might be needed for complex cases.
    const individualPrologItems = prologString.split('.')
                                     .map(s => s.trim())
                                     .filter(s => s.length > 0)
                                     .map(s => s + '.');

    if (individualPrologItems.length === 0 && prologString.length > 0) {
        return { success: false, message: 'No valid Prolog items found in the provided string (ensure they end with a period).', error: ErrorCodes.INVALID_GENERATED_PROLOG};
    }
    if (individualPrologItems.length === 0 && prologString.length === 0) {
        return { success: true, message: 'No prolog to assert.', addedProlog: [] };
    }


    try {
      for (const item of individualPrologItems) {
        const validationResult = await reasonerService.validateKnowledgeBase(item);
        if (!validationResult.isValid) {
          const validationErrorMsg = `Provided Prolog is invalid: "${item}". Error: ${validationResult.error}`;
          logger.error(`[McrService] Validation failed for raw Prolog: ${validationErrorMsg}`);
          return {
            success: false,
            message: 'Failed to assert Prolog: Invalid syntax.',
            error: ErrorCodes.INVALID_GENERATED_PROLOG, // Reusing, as it's about prolog validity
            details: validationErrorMsg,
          };
        }
      }
      logger.info(`[McrService] All ${individualPrologItems.length} raw Prolog items validated successfully.`);

      const addSuccess = await sessionStore.addFacts(sessionId, individualPrologItems);
      if (addSuccess) {
        logger.info(`[McrService] Raw Prolog successfully added to session ${sessionId}. Items:`, individualPrologItems);
        return {
          success: true,
          message: 'Raw Prolog asserted successfully.',
          addedProlog: individualPrologItems,
        };
      } else {
        // This case might be redundant if session check and validation are thorough
        logger.error(`[McrService] Failed to add raw Prolog to session ${sessionId} after validation.`);
        return {
          success: false,
          message: 'Failed to add raw Prolog to session store after validation.',
          error: ErrorCodes.SESSION_ADD_FACTS_FAILED,
        };
      }
    } catch (error) {
      logger.error(`[McrService] Error asserting raw Prolog to session ${sessionId}: ${error.message}`, { stack: error.stack });
      return {
        success: false,
        message: `Error during raw Prolog assertion: ${error.message}`,
        error: error.code || 'RAW_PROLOG_ASSERTION_ERROR',
        details: error.message,
      };
    }
  },

  listSessions: async () => {
    logger.debug(`[McrService] listSessions called`);
    try {
      // Assuming sessionStore will have a listSessions method
      if (typeof sessionStore.listSessions !== 'function') {
        logger.warn('[McrService] sessionStore.listSessions is not implemented.');
        // Return a structure indicating not implemented or an empty array with a warning
        return { success: false, error: { message: "Listing sessions is not supported by the current session store.", code: "NOT_IMPLEMENTED" } };
      }
      const sessions = await sessionStore.listSessions(); // This method needs to be added to session store implementations
      return { success: true, data: sessions };
    } catch (error) {
      logger.error(`[McrService] Error listing sessions: ${error.message}`, { stack: error.stack });
      return { success: false, error: { message: error.message, code: 'LIST_SESSIONS_ERROR' } };
    }
  },
};

// System Analysis Stubs - Define functions before module.exports
async function getStrategyPerformanceData(options) {
  logger.info('[McrService] STUB: getStrategyPerformanceData called', options);
  return { success: true, data: [{ strategyId: 'stub-strat-1', accuracy: 0.9, latency: 100, cost: 0.01, name: 'Stub Strategy 1' }] };
}

async function getEvaluationCases(options) {
  logger.info('[McrService] STUB: getEvaluationCases called', options);
  const baseEvals = require('../../src/evalCases/baseEvals');
  const sirSpecific = require('../../src/evalCases/sirStrategySpecificCases');
  return { success: true, data: { baseEvals, sirSpecific } };
}

async function createEvaluationCase(caseData) {
  logger.info('[McrService] STUB: createEvaluationCase called', caseData);
  if (!caseData || !caseData.fileName || !caseData.content) {
      return { success: false, error: {message: "fileName and content are required for creating eval case."}};
  }
  logger.info(`[McrService] STUB: Would write to evalCases/${caseData.fileName} with content: ${JSON.stringify(caseData.content)}`);
  return { success: true, data: { id: caseData.id || 'new-stub-case', ...caseData } };
}

async function updateEvaluationCase(caseData) {
  logger.info('[McrService] STUB: updateEvaluationCase called', caseData);
   if (!caseData || !caseData.fileName || !caseData.content) { // Or use an ID
      return { success: false, error: {message: "fileName/id and content are required for updating eval case."}};
  }
  logger.info(`[McrService] STUB: Would update evalCases/${caseData.fileName} with content: ${JSON.stringify(caseData.content)}`);
  return { success: true, data: { ...caseData } };
}

async function generateEvaluationCaseVariations(options) {
  logger.info('[McrService] STUB: generateEvaluationCaseVariations called', options);
  if(!options || !options.baseCaseDescription || !options.generationInstructions) {
      return { success: false, error: {message: "baseCaseDescription and generationInstructions are required."}};
  }
  const variations = [
      { id: 'stub-variant-1', description: `Variant of ${options.baseCaseDescription} based on "${options.generationInstructions}"`, naturalLanguageInput: "Generated NL variation 1?", inputType: "query", expectedProlog: "variation1(X).", expectedAnswer: "yes" },
      { id: 'stub-variant-2', description: `Another variant of ${options.baseCaseDescription}`, naturalLanguageInput: "Generated NL assertion 2.", inputType: "assert", expectedProlog: "variation2(true)." }
  ];
  return { success: true, data: variations };
}

async function runEvolutionCycle(options) {
  logger.info('[McrService] STUB: runEvolutionCycle called', options);
  return { success: true, message: "Evolution cycle started (stub). Monitor logs for progress." };
}

async function getEvolverStatus(options) {
  logger.info('[McrService] STUB: getEvolverStatus called', options);
  return { success: true, data: { status: "idle", cycleCount: 0, bestStrategyId: "N/A", lastRun: null, details: "Evolver is idle. No cycles run yet." } };
}

// Update module.exports to include these functions by name
const originalExports = module.exports;
module.exports = {
  ...originalExports,
  getStrategyPerformanceData,
  getEvaluationCases,
  createEvaluationCase,
  updateEvaluationCase,
  generateEvaluationCaseVariations,
  runEvolutionCycle,
  getEvolverStatus,
};
