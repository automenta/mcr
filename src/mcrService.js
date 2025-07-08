// src/mcrService.js
const llmService = require('./llmService');
const reasonerService = require('./reasonerService');
// const sessionManager = require('./sessionManager'); // Old import
const InMemorySessionStore = require('./InMemorySessionStore');
const FileSessionStore = require('./FileSessionStore'); // Import FileSessionStore
const ontologyService = require('./ontologyService');
const { prompts, fillTemplate, getPromptTemplateByName } = require('./prompts');
const logger = require('./logger');
const config = require('./config');
const strategyManager = require('./strategyManager');
const StrategyExecutor = require('./strategyExecutor');
const { MCRError, ErrorCodes } = require('./errors');
const KeywordInputRouter = require('./evolution/keywordInputRouter.js');
const db = require('./database');

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

let baseStrategyId = config.translationStrategy;

async function getOperationalStrategyJson(operationType, naturalLanguageText) {
  let strategyJson = null;
  const llmModelId = config.llm[config.llm.provider]?.model || 'default';

  // 1. Attempt to find the best strategy using the Input Router
  if (inputRouterInstance && naturalLanguageText) {
    try {
      const recommendedStrategyHash = await inputRouterInstance.route(
        naturalLanguageText,
        llmModelId
      );
      if (recommendedStrategyHash) {
        strategyJson = strategyManager.getStrategyByHash(
          recommendedStrategyHash
        );
        if (strategyJson) {
          logger.info(
            `[McrService] InputRouter recommended strategy by HASH "${recommendedStrategyHash.substring(0, 12)}" (ID: "${strategyJson.id}") for input: "${naturalLanguageText.substring(0, 50)}..."`
          );
        } else {
          logger.warn(
            `[McrService] InputRouter recommended strategy HASH "${recommendedStrategyHash.substring(0, 12)}" but it was not found by StrategyManager. Falling back.`
          );
        }
      }
    } catch (routerError) {
      logger.error(
        `[McrService] InputRouter failed: ${routerError.message}. Falling back.`
      );
    }
  }

  // 2. Fallback to configured strategy if router doesn't provide one
  if (!strategyJson) {
    const operationSuffix = operationType === 'Assert' ? '-Assert' : '-Query';
    const operationalStrategyId = `${baseStrategyId}${operationSuffix}`;
    strategyJson = strategyManager.getStrategy(operationalStrategyId);
    if (strategyJson) {
      logger.info(
        `[McrService] Using configured operational strategy: "${strategyJson.id}"`
      );
    } else {
      // 3. Final fallback to the base strategy ID or system default
      logger.warn(
        `[McrService] Operational strategy "${operationalStrategyId}" not found. Trying base strategy "${baseStrategyId}".`
      );
      strategyJson =
        strategyManager.getStrategy(baseStrategyId) ||
        strategyManager.getDefaultStrategy();
      logger.info(`[McrService] Using fallback strategy: "${strategyJson.id}"`);
    }
  }
  return strategyJson;
}

async function logInitialStrategy() {
  try {
    const initialDisplayStrategy = await getOperationalStrategyJson(
      'Assert',
      'System startup initial strategy check.'
    );
    logger.info(
      `[McrService] Initialized with base translation strategy ID: "${baseStrategyId}". Effective assertion strategy: "${initialDisplayStrategy.name}" (ID: ${initialDisplayStrategy.id})`
    );
  } catch (e) {
    logger.error(
      `[McrService] Failed to initialize with a default assertion strategy. Base ID: "${baseStrategyId}". Error: ${e.message}`
    );
  }
}
logInitialStrategy();

/**
 * Sets the base translation strategy ID for the MCR service.
 * The system will attempt to use variants like `${strategyId}-Assert` or `${strategyId}-Query`
 * based on the operation type, or the strategyId itself if variants are not found.
 * @param {string} strategyId - The ID of the base strategy to set (e.g., "SIR-R1", "Direct-S1").
 * @returns {Promise<boolean>} True if the strategy (or its variants) was found and set, false otherwise.
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
      const currentAssertStrategy = await getOperationalStrategyJson(
        'Assert',
        'Strategy set check.'
      );
      logger.info(
        `[McrService] Base translation strategy ID changed from "${oldBaseStrategyId}" to "${baseStrategyId}". Effective assertion strategy: "${currentAssertStrategy.name}" (ID: ${currentAssertStrategy.id})`
      );
    } catch (e) {
      logger.warn(
        `[McrService] Base translation strategy ID changed from "${oldBaseStrategyId}" to "${baseStrategyId}", but failed to determine effective assertion strategy for logging: ${e.message}`
      );
    }
    return true;
  }

  logger.warn(
    `[McrService] Attempted to set unknown or invalid base strategy ID: ${strategyId}. Neither "${assertVariantId}", "${queryVariantId}" nor the base ID "${strategyId}" itself were found. Available strategies: ${JSON.stringify(strategyManager.getAvailableStrategies())}`
  );
  return false;
}

/**
 * Gets the currently active base translation strategy ID.
 * @returns {string} The ID of the active base strategy.
 */
function getActiveStrategyId() {
  return baseStrategyId;
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
    naturalLanguageText
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
 * It translates the NL question to a Prolog query, executes it, and translates the results back to a natural language answer.
 * Optionally, it can also trace the proof and provide a natural language explanation of the reasoning steps.
 * @param {string} sessionId - The ID of the session to query.
 * @param {string} naturalLanguageQuestion - The natural language question.
 * @param {object} [queryOptions={}] - Optional. Options for the query.
 * @param {string} [queryOptions.dynamicOntology] - Optional. A string of Prolog rules to dynamically add to the KB for this query.
 * @param {string} [queryOptions.style="conversational"] - Optional. The desired style for the NL answer.
 * @param {boolean} [queryOptions.trace=false] - Optional. Whether to generate and return a proof trace explanation.
 * @returns {Promise<object>} An object containing the NL answer and optionally an explanation, or an error.
 *                            Successful structure: `{ success: true, answer: string, explanation?: string, debugInfo: object }`
 *                            Error structure: `{ success: false, message: string, debugInfo: object, error: string, ... }`
 */
async function querySessionWithNL(
  sessionId,
  naturalLanguageQuestion,
  queryOptions = {}
) {
  const activeStrategyJson = await getOperationalStrategyJson(
    'Query',
    naturalLanguageQuestion
  );
  const currentStrategyId = activeStrategyJson.id;
  const {
    dynamicOntology,
    style = 'conversational',
    trace = false,
  } = queryOptions;
  logger.info(
    `[McrService] Enter querySessionWithNL for session ${sessionId} using strategy "${activeStrategyJson.name}" (ID: ${currentStrategyId}). NL Question: "${naturalLanguageQuestion}"`,
    { queryOptions }
  );
  const operationId = `query-${Date.now()}`;

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
    traceRequested: trace,
  };

  try {
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
    const prologQuery = await executor.execute(
      llmService,
      reasonerService,
      initialContext
    );

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

    let knowledgeBase = await sessionStore.getKnowledgeBase(sessionId);
    if (knowledgeBase === null) {
      throw new MCRError(
        ErrorCodes.INTERNAL_KB_NOT_FOUND,
        'Internal error: Knowledge base not found for an existing session.'
      );
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

    if (dynamicOntology && typeof dynamicOntology === 'string' && dynamicOntology.trim() !== '') {
      knowledgeBase += `\n% --- Dynamic RAG Ontology (Query-Specific) ---\n${dynamicOntology.trim()}`;
      debugInfo.dynamicOntologyProvided = true;
    }

    if (config.debugLevel === 'verbose') {
      debugInfo.knowledgeBaseSnapshot = knowledgeBase;
    }

    const reasonerResult = await reasonerService.executeQuery(
      knowledgeBase,
      prologQuery,
      { trace } // Pass trace option to reasoner
    );

    const { results: prologResults, trace: proofTrace } = reasonerResult;

    if (config.debugLevel === 'verbose') {
      debugInfo.prologResultsJSON = JSON.stringify(prologResults);
      debugInfo.proofTrace = proofTrace;
    }

    const logicToNlPromptContext = {
      naturalLanguageQuestion,
      prologResultsJSON: JSON.stringify(prologResults),
      style,
    };
    const llmAnswerResult = await llmService.generate(
      prompts.LOGIC_TO_NL_ANSWER.system,
      fillTemplate(prompts.LOGIC_TO_NL_ANSWER.user, logicToNlPromptContext)
    );
    const naturalLanguageAnswerText = llmAnswerResult?.text;

    if (!naturalLanguageAnswerText) {
      logger.warn(
        `[McrService] LLM returned no text for LOGIC_TO_NL_ANSWER. OpID: ${operationId}`
      );
      return {
        success: false,
        message: 'Failed to generate a natural language answer from query results.',
        debugInfo,
        error: ErrorCodes.LLM_EMPTY_RESPONSE,
        strategyId: currentStrategyId,
      };
    }

    let explanation = null;
    if (trace && proofTrace) {
      logger.info(
        `[McrService] Generating proof explanation from trace. OpID: ${operationId}`
      );
      const tracePrompt = getPromptTemplateByName('LOGIC_TRACE_TO_NL');
      if (tracePrompt) {
        const traceContext = { trace: JSON.stringify(proofTrace, null, 2) };
        const llmTraceResult = await llmService.generate(
          tracePrompt.system,
          fillTemplate(tracePrompt.user, traceContext)
        );
        explanation = llmTraceResult?.text;
        if (config.debugLevel === 'verbose') {
          debugInfo.traceExplanation = explanation;
        }
      } else {
        logger.warn(
          `[McrService] LOGIC_TRACE_TO_NL prompt template not found. Cannot generate explanation. OpID: ${operationId}`
        );
        debugInfo.traceExplanationError = 'LOGIC_TRACE_TO_NL prompt not found.';
      }
    }

    logger.info(
      `[McrService] NL answer generated (OpID: ${operationId}): "${naturalLanguageAnswerText}"`
    );
    return {
      success: true,
      answer: naturalLanguageAnswerText,
      explanation,
      debugInfo,
    };
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
  const effectiveBaseId = strategyIdToUse || baseStrategyId; // Use mcrService's baseStrategyId
  const strategyJsonToUse = strategyIdToUse
    ? strategyManager.getStrategy(`${effectiveBaseId}-Assert`) || // Prefer assert variant
      strategyManager.getStrategy(effectiveBaseId) ||
      (await getOperationalStrategyJson('Assert', naturalLanguageText)) // Fallback to mcrService's logic
    : await getOperationalStrategyJson('Assert', naturalLanguageText);

  if (!strategyJsonToUse) {
    logger.error(
      `[McrService] No valid strategy found for direct NL to Rules. Base ID: "${effectiveBaseId}".`
    );
    return {
      success: false,
      message: `No valid strategy could be determined for base ID "${effectiveBaseId}".`,
      error: ErrorCodes.STRATEGY_NOT_FOUND,
      strategyId: effectiveBaseId,
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
    naturalLanguageQuestion
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
  setTranslationStrategy,
  getActiveStrategyId,
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
};
