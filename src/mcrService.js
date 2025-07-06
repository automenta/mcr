// src/mcrService.js
const llmService = require('./llmService');
const reasonerService = require('./reasonerService');
const sessionManager = require('./sessionManager');
const ontologyService = require('./ontologyService');
const { prompts, fillTemplate } = require('./prompts');
const logger = require('./logger');
const config = require('./config');
const strategyManager = require('./strategyManager');
const StrategyExecutor = require('./strategyExecutor'); // Import StrategyExecutor
const { MCRError, ErrorCodes } = require('./errors');
const InputRouter = require('./evolution/inputRouter'); // Added
const db = require('./database'); // Added

// Initialize InputRouter
let inputRouterInstance;
try {
  inputRouterInstance = new InputRouter(db); // db module itself is passed
  logger.info('[McrService] InputRouter initialized.');
} catch (error) {
  logger.error('[McrService] Failed to initialize InputRouter. Routing will be disabled.', error);
  inputRouterInstance = null; // Fallback: router is disabled
}


// Get the initial active strategy JSON from the manager
// Store the base ID from config. This will be suffixed with -Assert or -Query for specific operations.
let baseStrategyId = config.translationStrategy;

/**
 * Retrieves the appropriate operational strategy JSON (e.g., "STRATEGY_ID-Assert" or "STRATEGY_ID-Query")
 * based on the base strategy ID, operation type, and potentially a recommendation from the InputRouter.
 * @param {'Assert' | 'Query'} operationType - The type of MCR operation.
 * @param {string} [naturalLanguageText] - Optional NL text to help InputRouter select a strategy.
 * @returns {Promise<object>} The strategy JSON object for the operation.
 * @throws {MCRError} If no suitable strategy can be found.
 */
async function getOperationalStrategyJson(operationType, naturalLanguageText) {
  let strategyIdToUse = null; // To log which ID was finally chosen
  let strategyJson = null;

  if (inputRouterInstance && naturalLanguageText) {
    try {
      const recommendedStrategyId = await inputRouterInstance.route(naturalLanguageText, config.llmProvider.model);
      if (recommendedStrategyId) {
        strategyJson = strategyManager.getStrategy(recommendedStrategyId);
        if (strategyJson) {
          logger.info(`[McrService] InputRouter recommended strategy "${recommendedStrategyId}" (Name: "${strategyJson.name}") for ${operationType} on input: "${naturalLanguageText.substring(0,50)}..."`);
          strategyIdToUse = recommendedStrategyId;
        } else {
          logger.warn(`[McrService] InputRouter recommended strategy ID "${recommendedStrategyId}" but it was not found in StrategyManager. Falling back for input: "${naturalLanguageText.substring(0,50)}..."`);
        }
      } else {
        // This is a common case, e.g. router has no data yet, or text is too generic.
        logger.debug(`[McrService] InputRouter did not recommend a specific strategy for "${naturalLanguageText.substring(0,50)}...". Falling back to default logic.`);
      }
    } catch (routerError) {
      logger.error(`[McrService] InputRouter failed to recommend a strategy: ${routerError.message}. Falling back.`, routerError);
    }
  }

  if (!strategyJson) { // If router didn't recommend, or recommended but not found, or router disabled
    const operationalStrategyId = `${baseStrategyId}-${operationType}`;
    strategyJson = strategyManager.getStrategy(operationalStrategyId);
    strategyIdToUse = operationalStrategyId;

    if (!strategyJson) {
      logger.warn(`[McrService] Configured operational strategy "${operationalStrategyId}" not found. Trying base ID "${baseStrategyId}".`);
      strategyJson = strategyManager.getStrategy(baseStrategyId);
      strategyIdToUse = baseStrategyId;
      if (!strategyJson) {
        logger.warn(`[McrService] Configured base strategy "${baseStrategyId}" also not found for ${operationType}. Falling back to StrategyManager's default.`);
        // getDefaultStrategy will throw if nothing is available, which is desired.
        strategyJson = strategyManager.getDefaultStrategy();
        strategyIdToUse = strategyJson.id; // ID of the default strategy
        logger.warn(`[McrService] Using system default strategy "${strategyIdToUse}" (Name: "${strategyJson.name}") for ${operationType}.`);
      } else {
        logger.info(`[McrService] Using configured base strategy "${strategyIdToUse}" (Name: "${strategyJson.name}") for ${operationType} as operational variant was not found.`);
      }
    } else {
       logger.info(`[McrService] Using configured operational strategy "${strategyIdToUse}" (Name: "${strategyJson.name}") for ${operationType}.`);
    }
  }
  return strategyJson; // This is the actual strategy JSON object
}

// Log initial strategy based on a typical operation like 'Assert' for general idea
// Note: getOperationalStrategyJson is now async
async function logInitialStrategy() {
  try {
    // Provide a generic text for initial logging as actual user input isn't available here.
    const initialDisplayStrategy = await getOperationalStrategyJson('Assert', 'System startup initial strategy check.');
    logger.info(
      `[McrService] Initialized with base translation strategy ID: "${baseStrategyId}". Effective assertion strategy: "${initialDisplayStrategy.name}" (ID: ${initialDisplayStrategy.id})`
    );
  } catch (e) {
      logger.error(`[McrService] Failed to initialize with a default assertion strategy. Base ID: "${baseStrategyId}". Error: ${e.message}`);
  }
}
logInitialStrategy(); // Call the async function


/**
 * Sets the active base translation strategy ID for the MCR service.
 * This ID is used as a fallback if the InputRouter doesn't provide a recommendation
 * or if the recommended strategy is not found.
 * @param {string} strategyId - The base ID of the strategy to activate (e.g., "SIR-R1").
 * @returns {Promise<boolean>} True if at least one operational variant (e.g., "strategyId-Assert") or the base strategy itself exists, false otherwise.
 */
async function setTranslationStrategy(strategyId) {
  logger.debug(
    `[McrService] Attempting to set base translation strategy ID to: ${strategyId}`
  );
  const assertVariantId = `${strategyId}-Assert`;
  const queryVariantId = `${strategyId}-Query`;

  const assertStrategyExists = strategyManager.getStrategy(assertVariantId);
  const queryStrategyExists = strategyManager.getStrategy(queryVariantId);
  const baseStrategyItselfExists = strategyManager.getStrategy(strategyId);

  if (assertStrategyExists || queryStrategyExists || baseStrategyItselfExists) {
    const oldBaseStrategyId = baseStrategyId;
    baseStrategyId = strategyId;

    try {
        // For logging the new effective strategy, provide a generic text
        const currentAssertStrategy = await getOperationalStrategyJson('Assert', 'Strategy set check.');
        logger.info(
        `[McrService] Base translation strategy ID changed from "${oldBaseStrategyId}" to "${baseStrategyId}". Effective assertion strategy: "${currentAssertStrategy.name}" (ID: ${currentAssertStrategy.id})`
        );
    } catch (e) {
        logger.warn(`[McrService] Base translation strategy ID changed from "${oldBaseStrategyId}" to "${baseStrategyId}", but failed to determine effective assertion strategy for logging: ${e.message}`);
    }
    return true;
  }

  logger.warn(
    `[McrService] Attempted to set unknown or invalid base strategy ID: ${strategyId}. Neither "${assertVariantId}", "${queryVariantId}" nor the base ID "${strategyId}" itself were found. Available strategies: ${JSON.stringify(strategyManager.getAvailableStrategies())}`
  );
  return false;
}

/**
 * Gets the base ID of the currently active translation strategy (e.g., "SIR-R1").
 * This base ID is used as a fallback by getOperationalStrategyJson.
 * @returns {string} The base ID of the active strategy.
 */
function getActiveStrategyId() {
  return baseStrategyId;
}

/**
 * Asserts natural language text as facts/rules into a session.
 * It uses an operational strategy determined by `getOperationalStrategyJson`, potentially via InputRouter.
 * The strategy execution is handled by the `StrategyExecutor`.
 * @param {string} sessionId - The ID of the session.
 * @param {string} naturalLanguageText - The natural language text to assert.
 * @returns {Promise<{success: boolean, message: string, addedFacts?: string[], error?: string, strategyId?: string}>}
 */
async function assertNLToSession(sessionId, naturalLanguageText) {
  const activeStrategyJson = await getOperationalStrategyJson('Assert', naturalLanguageText);
  const currentStrategyId = activeStrategyJson.id;
  logger.info(
    `[McrService] Enter assertNLToSession for session ${sessionId} using strategy "${activeStrategyJson.name}" (ID: ${currentStrategyId}). NL Text: "${naturalLanguageText}"`
  );
  const operationId = `assert-${Date.now()}`;

  if (!sessionManager.getSession(sessionId)) {
    logger.warn(`[McrService] Session ${sessionId} not found for assertion. OpID: ${operationId}`);
    return { success: false, message: 'Session not found.', error: ErrorCodes.SESSION_NOT_FOUND, strategyId: currentStrategyId };
  }

  try {
    const existingFacts = await sessionManager.getKnowledgeBase(sessionId) || '';
    let ontologyRules = '';
    try {
      const globalOntologies = await ontologyService.listOntologies(true);
      if (globalOntologies && globalOntologies.length > 0) {
        ontologyRules = globalOntologies.map((ont) => ont.rules).join('\n');
      }
    } catch (ontError) {
      logger.warn(`[McrService] Error fetching global ontologies for context in session ${sessionId}: ${ontError.message}`);
    }

    const lexiconSummary = await sessionManager.getLexiconSummary(sessionId);
    const initialContext = {
      naturalLanguageText,
      existingFacts,
      ontologyRules,
      lexiconSummary,
      llm_model_id: config.llmProvider.model, // Provide default model from config
    };

    logger.info(`[McrService] Executing strategy "${activeStrategyJson.name}" (ID: ${currentStrategyId}) for assertion. OpID: ${operationId}.`);
    const executor = new StrategyExecutor(activeStrategyJson);
    const addedFacts = await executor.execute(llmService, initialContext);

    // Ensure addedFacts is an array of strings, as expected by downstream logic
    if (!Array.isArray(addedFacts) || !addedFacts.every(f => typeof f === 'string')) {
        logger.error(`[McrService] Strategy "${currentStrategyId}" execution for assertion did not return an array of strings. OpID: ${operationId}. Output: ${JSON.stringify(addedFacts)}`);
        throw new MCRError(ErrorCodes.STRATEGY_INVALID_OUTPUT, 'Strategy execution for assertion returned an unexpected output format. Expected array of Prolog strings.');
    }
    logger.debug(`[McrService] Strategy "${currentStrategyId}" execution returned (OpID: ${operationId}):`, { addedFacts });


    if (!addedFacts || addedFacts.length === 0) {
      logger.warn(`[McrService] Strategy "${currentStrategyId}" returned no facts for text: "${naturalLanguageText}". OpID: ${operationId}`);
      return { success: false, message: 'Could not translate text into valid facts using the current strategy.', error: ErrorCodes.NO_FACTS_EXTRACTED, strategyId: currentStrategyId };
    }

    for (const factString of addedFacts) {
      const validationResult = await reasonerService.validateKnowledgeBase(factString); // Validates syntax
      if (!validationResult.isValid) {
        const validationErrorMsg = `Generated Prolog is invalid: "${factString}". Error: ${validationResult.error}`;
        logger.error(`[McrService] Validation failed for generated Prolog. OpID: ${operationId}. Details: ${validationErrorMsg}`);
        return { success: false, message: 'Failed to assert facts: Generated Prolog is invalid.', error: ErrorCodes.INVALID_GENERATED_PROLOG, details: validationErrorMsg, strategyId: currentStrategyId };
      }
    }
    logger.info(`[McrService] All ${addedFacts.length} generated facts validated successfully. OpID: ${operationId}`);

    const addSuccess = sessionManager.addFacts(sessionId, addedFacts);
    if (addSuccess) {
      logger.info(`[McrService] Facts successfully added to session ${sessionId}. OpID: ${operationId}. Facts:`, { addedFacts });
      return { success: true, message: 'Facts asserted successfully.', addedFacts, strategyId: currentStrategyId };
    } else {
      logger.error(`[McrService] Failed to add facts to session ${sessionId} after validation. OpID: ${operationId}`);
      return { success: false, message: 'Failed to add facts to session manager after validation.', error: ErrorCodes.SESSION_ADD_FACTS_FAILED, strategyId: currentStrategyId };
    }
  } catch (error) {
    logger.error(`[McrService] Error asserting NL to session ${sessionId} using strategy "${currentStrategyId}": ${error.message}`, { stack: error.stack, details: error.details, errorCode: error.code });
    return {
      success: false,
      message: `Error during assertion: ${error.message}`,
      error: error.code || ErrorCodes.STRATEGY_EXECUTION_ERROR,
      details: error.message,
      strategyId: currentStrategyId,
    };
  }
}

/**
 * Queries a session using a natural language question and a strategy chosen by `getOperationalStrategyJson`.
 * @param {string} sessionId - The ID of the session.
 * @param {string} naturalLanguageQuestion - The natural language question.
 * @param {object} [queryOptions] - Optional parameters for the query (e.g., style for answer, dynamicOntology).
 * @returns {Promise<{success: boolean, answer?: string, debugInfo?: object, error?: string, strategy?: string}>}
 */
async function querySessionWithNL(sessionId, naturalLanguageQuestion, queryOptions = {}) {
  const activeStrategyJson = await getOperationalStrategyJson('Query', naturalLanguageQuestion);
  const currentStrategyId = activeStrategyJson.id;
  const { dynamicOntology, style = 'conversational' } = queryOptions;
  logger.info(
    `[McrService] Enter querySessionWithNL for session ${sessionId} using strategy "${activeStrategyJson.name}" (ID: ${currentStrategyId}). NL Question: "${naturalLanguageQuestion}"`,
    { queryOptions }
  );
  const operationId = `query-${Date.now()}`;

  if (!sessionManager.getSession(sessionId)) {
    logger.warn(`[McrService] Session ${sessionId} not found for query. OpID: ${operationId}`);
    return { success: false, message: 'Session not found.', error: ErrorCodes.SESSION_NOT_FOUND, strategyId: currentStrategyId };
  }

  const debugInfo = { strategyId: currentStrategyId, operationId, level: config.debugLevel };

  try {
    const existingFacts = await sessionManager.getKnowledgeBase(sessionId) || '';
    let ontologyRules = '';
    try {
      const globalOntologies = await ontologyService.listOntologies(true);
      if (globalOntologies && globalOntologies.length > 0) {
        ontologyRules = globalOntologies.map((ont) => ont.rules).join('\n');
      }
    } catch (ontError) {
      logger.warn(`[McrService] Error fetching global ontologies for query strategy context (session ${sessionId}): ${ontError.message}`);
      debugInfo.ontologyErrorForStrategy = `Failed to load global ontologies for query translation: ${ontError.message}`;
    }

    const lexiconSummary = await sessionManager.getLexiconSummary(sessionId);
    const initialContext = {
      naturalLanguageQuestion,
      existingFacts,
      ontologyRules,
      lexiconSummary,
      llm_model_id: config.llmProvider.model,
    };

    logger.info(`[McrService] Executing strategy "${activeStrategyJson.name}" (ID: ${currentStrategyId}) for query translation. OpID: ${operationId}.`);
    const executor = new StrategyExecutor(activeStrategyJson);
    const prologQuery = await executor.execute(llmService, initialContext);

    if (typeof prologQuery !== 'string' || !prologQuery.endsWith('.')) {
        logger.error(`[McrService] Strategy "${currentStrategyId}" execution for query did not return a valid Prolog query string. OpID: ${operationId}. Output: ${prologQuery}`);
        throw new MCRError(ErrorCodes.STRATEGY_INVALID_OUTPUT, 'Strategy execution for query returned an unexpected output format. Expected Prolog query string ending with a period.');
    }
    logger.info(`[McrService] Strategy "${currentStrategyId}" translated NL question to Prolog query (OpID: ${operationId}): ${prologQuery}`);
    debugInfo.prologQuery = prologQuery;


    let knowledgeBase = await sessionManager.getKnowledgeBase(sessionId); // Re-fetch or use existingFacts
     if (knowledgeBase === null) { // Should not happen if session check passed
        logger.error(`[McrService] Knowledge base is null for existing session ${sessionId}. OpID: ${operationId}. This indicates an unexpected state.`);
        return { success: false, message: 'Internal error: Knowledge base not found for an existing session.', debugInfo, error: ErrorCodes.INTERNAL_KB_NOT_FOUND, strategyId: currentStrategyId };
    }


    try {
      const globalOntologies = await ontologyService.listOntologies(true);
      if (globalOntologies && globalOntologies.length > 0) {
        knowledgeBase += `\n% --- Global Ontologies ---\n${globalOntologies.map((ont) => ont.rules).join('\n')}`;
      }
    } catch (ontError) {
      logger.error(`[McrService] Error fetching global ontologies for reasoner KB (session ${sessionId}): ${ontError.message}`);
      debugInfo.ontologyErrorForReasoner = `Failed to load global ontologies for reasoner: ${ontError.message}`;
    }

    if (dynamicOntology && typeof dynamicOntology === 'string' && dynamicOntology.trim() !== '') {
      knowledgeBase += `\n% --- Dynamic RAG Ontology (Query-Specific) ---\n${dynamicOntology.trim()}`;
      debugInfo.dynamicOntologyProvided = true;
    }

    if (config.debugLevel === 'verbose') debugInfo.knowledgeBaseSnapshot = knowledgeBase;
    else if (config.debugLevel === 'basic') debugInfo.knowledgeBaseSummary = `KB length: ${knowledgeBase.length}, Dynamic RAG: ${!!debugInfo.dynamicOntologyProvided}`;

    const prologResults = await reasonerService.executeQuery(knowledgeBase, prologQuery);
    if (config.debugLevel === 'verbose') debugInfo.prologResultsJSON = JSON.stringify(prologResults);
    else if (config.debugLevel === 'basic') debugInfo.prologResultsSummary = Array.isArray(prologResults) ? `${prologResults.length} solution(s) found.` : `Result: ${prologResults}`;

    const logicToNlPromptContext = { naturalLanguageQuestion, prologResultsJSON: JSON.stringify(prologResults), style };
    const naturalLanguageAnswer = await llmService.generate(prompts.LOGIC_TO_NL_ANSWER.system, fillTemplate(prompts.LOGIC_TO_NL_ANSWER.user, logicToNlPromptContext));
    if (config.debugLevel === 'verbose') debugInfo.llmTranslationResultToNL = naturalLanguageAnswer;

    logger.info(`[McrService] NL answer generated (OpID: ${operationId}): "${naturalLanguageAnswer}"`);
    return { success: true, answer: naturalLanguageAnswer, debugInfo };

  } catch (error) {
    logger.error(`[McrService] Error querying session ${sessionId} with NL (OpID: ${operationId}, Strategy ID: ${currentStrategyId}): ${error.message}`, { stack: error.stack, details: error.details, errorCode: error.code });
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


/**
 * Translates natural language text directly to Prolog facts/rules.
 * @param {string} naturalLanguageText - The natural language text.
 * @param {string} [strategyIdToUse] - Optional: specific strategy ID to use. Defaults to active strategy ID.
 * @returns {Promise<{success: boolean, rules?: string[], error?: string, strategyId?: string}>}
 */
async function translateNLToRulesDirect(naturalLanguageText, strategyIdToUse) {
  // If no specific strategyIdToUse is provided, derive the default "Assert" variant.
  const effectiveBaseId = strategyIdToUse || baseStrategyId;
  // If a strategyIdToUse is explicitly passed, we honor that directly without routing.
  // Otherwise, we use getOperationalStrategyJson which includes routing.
  const strategyJsonToUse = strategyIdToUse ?
                              (strategyManager.getStrategy(`${effectiveBaseId}-Assert`) || strategyManager.getStrategy(effectiveBaseId) || await getOperationalStrategyJson('Assert', naturalLanguageText))
                            : await getOperationalStrategyJson('Assert', naturalLanguageText);
  const currentStrategyId = strategyJsonToUse.id;

  const operationId = `transNLToRules-${Date.now()}`;
  logger.info(`[McrService] Enter translateNLToRulesDirect (OpID: ${operationId}). Strategy ID: "${currentStrategyId}". NL Text: "${naturalLanguageText}"`);

  if (!strategyJsonToUse) { // Should be caught by getOperationalStrategyJson if default also fails
    logger.error(`[McrService] No valid strategy found for direct NL to Rules. Base ID: "${effectiveBaseId}". OpID: ${operationId}`);
    return { success: false, message: `No valid strategy could be determined for base ID "${effectiveBaseId}".`, error: ErrorCodes.STRATEGY_NOT_FOUND, strategyId: effectiveBaseId };
  }

  try {
    logger.info(`[McrService] Using strategy "${strategyJsonToUse.name}" (ID: ${currentStrategyId}) for direct NL to Rules. OpID: ${operationId}`);
    const globalOntologyRules = await ontologyService.getGlobalOntologyRulesAsString();
    const initialContext = {
      naturalLanguageText,
      ontologyRules: globalOntologyRules,
      lexiconSummary: 'No lexicon summary available for direct translation.',
      llm_model_id: config.llmProvider.model,
    };

    const executor = new StrategyExecutor(strategyJsonToUse);
    const prologRules = await executor.execute(llmService, initialContext);

    if (!Array.isArray(prologRules) || !prologRules.every(r => typeof r === 'string')) {
        logger.error(`[McrService] Strategy "${currentStrategyId}" execution for direct translation did not return an array of strings. OpID: ${operationId}. Output: ${JSON.stringify(prologRules)}`);
        throw new MCRError(ErrorCodes.STRATEGY_INVALID_OUTPUT, 'Strategy execution for direct translation returned an unexpected output format. Expected array of Prolog strings.');
    }
    logger.debug(`[McrService] Strategy "${currentStrategyId}" execution returned (OpID: ${operationId}):`, { prologRules });

    if (!prologRules || prologRules.length === 0) {
      logger.warn(`[McrService] Strategy "${currentStrategyId}" extracted no rules from text (OpID: ${operationId}): "${naturalLanguageText}"`);
      return { success: false, message: 'Could not translate text into valid rules.', error: ErrorCodes.NO_RULES_EXTRACTED, strategyId: currentStrategyId };
    }
    logger.info(`[McrService] Successfully translated NL to Rules (Direct). OpID: ${operationId}. Rules count: ${prologRules.length}. Strategy ID: ${currentStrategyId}`);
    return { success: true, rules: prologRules, strategyId: currentStrategyId };

  } catch (error) {
    logger.error(`[McrService] Error translating NL to Rules (Direct) using strategy "${currentStrategyId}" (OpID: ${operationId}): ${error.message}`, { stack: error.stack, details: error.details, errorCode: error.code });
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
 * Translates a string of Prolog rules/facts directly to natural language.
 * @param {string} prologRules - The Prolog rules/facts as a string.
 * @param {string} [style='conversational'] - The desired style of the explanation ('formal' or 'conversational').
 * @returns {Promise<{success: boolean, explanation?: string, error?: string}>}
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
      error: 'EMPTY_RULES_INPUT', // Standardized error code
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
      prompts.RULES_TO_NL_DIRECT.user,
      promptContext
    );

    const naturalLanguageExplanation = await llmService.generate(
      prompts.RULES_TO_NL_DIRECT.system,
      rulesToNLPromptUser
    );
    logger.debug(
      `[McrService] Prolog rules translated to NL (Direct) (OpID: ${operationId}):\n${naturalLanguageExplanation}`
    );

    if (
      !naturalLanguageExplanation ||
      naturalLanguageExplanation.trim() === ''
    ) {
      logger.warn(
        `[McrService] Empty explanation generated for rules to NL (Direct). OpID: ${operationId}`
      );
      return {
        success: false,
        message: 'Failed to generate a natural language explanation.',
        error: 'EMPTY_EXPLANATION_GENERATED', // Standardized error code
      };
    }
    logger.info(
      `[McrService] Successfully translated Rules to NL (Direct). OpID: ${operationId}. Explanation length: ${naturalLanguageExplanation.length}.`
    );
    return { success: true, explanation: naturalLanguageExplanation };
  } catch (error) {
    logger.error(
      `[McrService] Error translating Rules to NL (Direct) (OpID: ${operationId}): ${error.message}`,
      { error: error.stack }
    );
    return {
      success: false,
      message: `Error during Rules to NL translation: ${error.message}`, // User-friendly message
      error: error.code || 'RULES_TO_NL_TRANSLATION_FAILED', // Specific error code if available
      details: error.message, // Full error message in details
    };
  }
}

/**
 * Generates a natural language explanation of how a query would be resolved using the active translation strategy for query conversion.
 * @param {string} sessionId - The ID of the session.
 * @param {string} naturalLanguageQuestion - The natural language question.
 * @returns {Promise<{success: boolean, explanation?: string, debugInfo?: object, error?: string, strategyId?: string}>}
 */
async function explainQuery(sessionId, naturalLanguageQuestion) {
  const activeStrategyJson = await getOperationalStrategyJson('Query', naturalLanguageQuestion); // Explain uses a query strategy
  const currentStrategyId = activeStrategyJson.id;
  const operationId = `explain-${Date.now()}`;

  logger.info(
    `[McrService] Enter explainQuery for session ${sessionId} (OpID: ${operationId}). Strategy: "${activeStrategyJson.name}" (ID: ${currentStrategyId}). NL Question: "${naturalLanguageQuestion}"`
  );

  if (!sessionManager.getSession(sessionId)) {
    return { success: false, message: 'Session not found.', error: ErrorCodes.SESSION_NOT_FOUND, strategyId: currentStrategyId };
  }

  const debugInfo = { naturalLanguageQuestion, strategyId: currentStrategyId, operationId, level: config.debugLevel };

  try {
    const existingFacts = await sessionManager.getKnowledgeBase(sessionId) || '';
    let contextOntologyRulesForQueryTranslation = '';
    try {
      const globalOntologies = await ontologyService.listOntologies(true);
      if (globalOntologies && globalOntologies.length > 0) {
        contextOntologyRulesForQueryTranslation = globalOntologies.map((ont) => ont.rules).join('\n');
      }
    } catch (ontError) {
      logger.warn(`[McrService] Error fetching global ontologies for NL_TO_QUERY context in explain (OpID: ${operationId}): ${ontError.message}`);
      debugInfo.ontologyErrorForStrategy = `Failed to load global ontologies for query translation context: ${ontError.message}`;
    }

    const lexiconSummary = await sessionManager.getLexiconSummary(sessionId);
    const initialStrategyContext = {
      naturalLanguageQuestion,
      existingFacts,
      ontologyRules: contextOntologyRulesForQueryTranslation,
      lexiconSummary,
      llm_model_id: config.llmProvider.model,
    };

    logger.info(`[McrService] Executing strategy "${activeStrategyJson.name}" (ID: ${currentStrategyId}) for query translation in explain. OpID: ${operationId}.`);
    const executor = new StrategyExecutor(activeStrategyJson);
    const prologQuery = await executor.execute(llmService, initialStrategyContext);

    if (typeof prologQuery !== 'string' || !prologQuery.endsWith('.')) {
        logger.error(`[McrService] Strategy "${currentStrategyId}" execution for explain query did not return a valid Prolog query string. OpID: ${operationId}. Output: ${prologQuery}`);
        throw new MCRError(ErrorCodes.STRATEGY_INVALID_OUTPUT, 'Strategy execution for explain query returned an unexpected output format. Expected Prolog query string ending with a period.');
    }
    logger.info(`[McrService] Strategy "${currentStrategyId}" translated NL to Prolog query for explanation (OpID: ${operationId}): ${prologQuery}`);
    debugInfo.prologQuery = prologQuery;


    if (config.debugLevel === 'verbose') debugInfo.sessionFactsSnapshot = existingFacts;
    else if (config.debugLevel === 'basic') debugInfo.sessionFactsSummary = `Session facts length: ${existingFacts.length}`;

    let explainPromptOntologyRules = '';
    try {
      const ontologiesForExplainPrompt = await ontologyService.listOntologies(true);
      if (ontologiesForExplainPrompt && ontologiesForExplainPrompt.length > 0) {
        explainPromptOntologyRules = ontologiesForExplainPrompt.map((ont) => ont.rules).join('\n');
      }
    } catch (ontErrorForExplain) {
      logger.warn(`[McrService] Error fetching global ontologies for EXPLAIN_PROLOG_QUERY prompt context (OpID: ${operationId}): ${ontErrorForExplain.message}`);
      debugInfo.ontologyErrorForPrompt = `Failed to load global ontologies for explanation prompt: ${ontErrorForExplain.message}`;
    }
    if (config.debugLevel === 'verbose') debugInfo.ontologyRulesForPromptSnapshot = explainPromptOntologyRules;

    const explainPromptContext = { naturalLanguageQuestion, prologQuery, sessionFacts: existingFacts, ontologyRules: explainPromptOntologyRules };
    const explanation = await llmService.generate(prompts.EXPLAIN_PROLOG_QUERY.system, fillTemplate(prompts.EXPLAIN_PROLOG_QUERY.user, explainPromptContext));

    if (!explanation || explanation.trim() === '') {
      return { success: false, message: 'Failed to generate an explanation for the query.', debugInfo, error: ErrorCodes.LLM_EMPTY_RESPONSE, strategyId: currentStrategyId };
    }
    return { success: true, explanation, debugInfo };

  } catch (error) {
    logger.error(`[McrService] Error explaining query for session ${sessionId} (OpID: ${operationId}, Strategy ID: ${currentStrategyId}): ${error.message}`, { stack: error.stack, details: error.details, errorCode: error.code });
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

/**
 * Retrieves all raw prompt templates.
 * @returns {Promise<{success: boolean, prompts?: object, error?: string}>}
 */
// This function can be synchronous if prompts are statically imported and not fetched.
// Making it async for consistency if we ever decide to load prompts dynamically.
async function getPrompts() {
  const operationId = `getPrompts-${Date.now()}`;
  logger.info(`[McrService] Enter getPrompts (OpID: ${operationId})`);
  try {
    // The 'prompts' object is directly imported from './prompts.js'
    logger.debug(
      `[McrService] Successfully retrieved prompts. OpID: ${operationId}. Prompt count: ${Object.keys(prompts).length}`
    );
    return { success: true, prompts: prompts }; // prompts is the imported object
  } catch (error) {
    // This catch is unlikely to be hit if 'prompts' is a static import.
    logger.error(
      `[McrService] Error retrieving prompts (OpID: ${operationId}): ${error.message}`,
      {
        error: error.stack,
      }
    );
    return {
      success: false,
      message: `Error retrieving prompts: ${error.message}`, // User-friendly message
      error: error.code || 'GET_PROMPTS_FAILED', // Specific error code if available
      details: error.message, // Full error message in details
    };
  }
}

/**
 * Formats a specified prompt template with given input variables.
 * @param {string} templateName - The name of the prompt template (e.g., "NL_TO_QUERY").
 * @param {object} inputVariables - An object containing key-value pairs for the template.
 * @returns {Promise<{success: boolean, templateName?: string, rawTemplate?: object, formattedPrompt?: string, error?: string}>}
 */
async function debugFormatPrompt(templateName, inputVariables) {
  const operationId = `debugFormat-${Date.now()}`;
  logger.info(
    `[McrService] Enter debugFormatPrompt (OpID: ${operationId}). Template: ${templateName}`,
    {
      inputVariables, // Log input variables carefully if they might contain sensitive data
    }
  );

  if (!templateName || typeof templateName !== 'string') {
    logger.warn(
      `[McrService] Invalid template name for debugFormatPrompt. OpID: ${operationId}`,
      { templateName }
    );
    return {
      success: false,
      message: 'Template name must be a non-empty string.',
      error: 'INVALID_TEMPLATE_NAME', // Standardized error code
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
      error: 'INVALID_INPUT_VARIABLES', // Standardized error code
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
      error: 'TEMPLATE_NOT_FOUND', // Standardized error code
    };
  }
  if (!template.user) {
    logger.warn(
      `[McrService] Prompt template "${templateName}" has no 'user' field for debugFormatPrompt. OpID: ${operationId}`
    );
    return {
      success: false,
      message: `Prompt template "${templateName}" does not have a 'user' field to format.`,
      error: 'TEMPLATE_USER_FIELD_MISSING', // Standardized error code
    };
  }

  try {
    logger.debug(
      `[McrService] Attempting to fill template "${templateName}" with variables. OpID: ${operationId}`
    );
    const formattedUserPrompt = fillTemplate(template.user, inputVariables); // This line can throw
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
      message: `Error formatting prompt: ${error.message}`, // User-friendly message
      error: error.code || 'PROMPT_FORMATTING_FAILED', // Specific error code if available
      details: error.message, // Full error message in details
    };
  }
}

module.exports = {
  assertNLToSession,
  querySessionWithNL,
  setTranslationStrategy,
  getActiveStrategyId, // Renamed
  createSession: sessionManager.createSession,
  getSession: sessionManager.getSession,
  deleteSession: sessionManager.deleteSession,
  getLexiconSummary: sessionManager.getLexiconSummary, // Expose if API needs it directly
  translateNLToRulesDirect,
  translateRulesToNLDirect,
  explainQuery,
  getPrompts,
  debugFormatPrompt,
  getAvailableStrategies: strategyManager.getAvailableStrategies, // Expose from strategyManager
  // assertNLToSessionWithSIR is removed, its functionality is via assertNLToSession with SIR-R1 strategy
};
