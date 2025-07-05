// src/mcrService.js
const llmService = require('./llmService');
const reasonerService = require('./reasonerService');
const sessionManager = require('./sessionManager');
const ontologyService = require('./ontologyService');
const { prompts, fillTemplate } = require('./prompts');
const logger = require('./logger');
const config = require('./config');

// Import Strategies
const DirectS1Strategy = require('./strategies/DirectS1Strategy');
const SIRR1Strategy = require('./strategies/SIRR1Strategy');

// Instantiate strategies
const strategies = {
  'Direct-S1': new DirectS1Strategy(),
  'SIR-R1': new SIRR1Strategy(), // Default retry count for SIRR1Strategy is 1
  // Add other strategies here as they are developed
};

let activeStrategyName = config.translationStrategy;
let activeStrategy = strategies[activeStrategyName];

if (!activeStrategy) {
  logger.warn(
    `[McrService] Configured strategy "${activeStrategyName}" not found. Defaulting to "SIR-R1".`
  );
  activeStrategyName = 'SIR-R1'; // Fallback to a default
  activeStrategy = strategies[activeStrategyName];
  if (!activeStrategy) {
    // Should not happen if SIR-R1 is in strategies
    logger.error(
      "[McrService] Fallback strategy 'SIR-R1' also not found. MCR Service may not function correctly."
    );
    // Or throw an error: throw new Error("Default strategy 'SIR-R1' not found.");
  }
}
logger.info(
  `[McrService] Initialized with active translation strategy: ${activeStrategy.getName()}`
);

/**
 * Sets the active translation strategy for the MCR service.
 * @param {string} strategyName - The name of the strategy to activate (e.g., "Direct-S1", "SIR-R1").
 * @returns {boolean} True if the strategy was successfully set, false otherwise.
 */
function setTranslationStrategy(strategyName) {
  logger.debug(
    `[McrService] Attempting to set translation strategy to: ${strategyName}`
  );
  if (strategies[strategyName]) {
    const oldStrategyName = activeStrategyName;
    activeStrategy = strategies[strategyName];
    activeStrategyName = strategyName;
    logger.info(
      `[McrService] Translation strategy changed from "${oldStrategyName}" to "${activeStrategy.getName()}"`
    );
    return true;
  }
  logger.warn(
    `[McrService] Attempted to set unknown translation strategy: ${strategyName}. Available strategies: ${Object.keys(strategies).join(', ')}`
  );
  return false;
}

/**
 * Gets the name of the currently active translation strategy.
 * @returns {string} The name of the active strategy.
 */
function getActiveStrategyName() {
  return activeStrategyName;
}

/**
 * Asserts natural language text as facts/rules into a session using the active translation strategy.
 * @param {string} sessionId - The ID of the session.
 * @param {string} naturalLanguageText - The natural language text to assert.
 * @returns {Promise<{success: boolean, message: string, addedFacts?: string[], error?: string, strategy?: string}>}
 */
async function assertNLToSession(sessionId, naturalLanguageText) {
  logger.info(
    `[McrService] Enter assertNLToSession for session ${sessionId} using strategy "${activeStrategy.getName()}". NL Text: "${naturalLanguageText}"`
  );
  const operationId = `assert-${Date.now()}`; // Unique ID for this operation for tracing

  if (!sessionManager.getSession(sessionId)) {
    logger.warn(
      `[McrService] Session ${sessionId} not found for assertion. Operation ID: ${operationId}`
    );
    return {
      success: false,
      message: 'Session not found.',
      error: 'SESSION_NOT_FOUND', // Standardized error code
      strategy: activeStrategy.getName(),
    };
  }

  try {
    const existingFacts = sessionManager.getKnowledgeBase(sessionId) || '';
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
      // Non-fatal for translation, proceed without ontology context for the strategy
    }
    logger.debug(
      `[McrService] Context for strategy assertion (OpID: ${operationId}):`,
      {
        sessionId,
        existingFactsLength: existingFacts.length,
        ontologyRulesLength: ontologyRules.length,
      }
    );

    // Delegate translation to the active strategy
    const lexiconSummary = await sessionManager.getLexiconSummary(sessionId); // Await async call
    const strategyOptions = { existingFacts, ontologyRules, lexiconSummary };
    logger.info(
      `[McrService] Calling strategy "${activeStrategy.getName()}".assert(). OpID: ${operationId}. Lexicon summary length: ${lexiconSummary?.length}`
    );
    const addedFacts = await activeStrategy.assert(
      naturalLanguageText,
      llmService,
      strategyOptions
    );
    logger.debug(
      `[McrService] Strategy "${activeStrategy.getName()}".assert() returned (OpID: ${operationId}):`,
      { addedFacts }
    );

    if (!addedFacts || addedFacts.length === 0) {
      // This case should ideally be handled by the strategy's assert method throwing an error
      logger.warn(
        `[McrService] Strategy "${activeStrategy.getName()}" returned no facts for text: "${naturalLanguageText}". OpID: ${operationId}`
      );
      return {
        success: false,
        message:
          'Could not translate text into valid facts using the current strategy.',
        error: 'NO_FACTS_EXTRACTED_BY_STRATEGY', // Standardized error code
        strategy: activeStrategy.getName(),
      };
    }

    // Validate each generated Prolog fact/rule before adding to session
    for (const factString of addedFacts) {
      // reasonerService.validate is actually validateKnowledgeBase,
      // so it expects a full KB. We are validating individual facts/rules here.
      // A more granular validateFact(factString) in reasonerService would be ideal.
      // For now, we use validateKnowledgeBase by passing the single fact string.
      // This might not be perfect if a fact is only valid in a larger context,
      // but it's good for catching syntax errors within the fact itself.
      const validationResult = await reasonerService.validateKnowledgeBase(
        factString
      );
      if (!validationResult.isValid) {
        const validationErrorMsg = `Generated Prolog is invalid: "${factString}". Error: ${validationResult.error}`;
        logger.error(
          `[McrService] Validation failed for generated Prolog. OpID: ${operationId}. Details: ${validationErrorMsg}`
        );
        return {
          success: false,
          message: 'Failed to assert facts: Generated Prolog is invalid.',
          error: 'INVALID_GENERATED_PROLOG', // Standardized error code
          details: validationErrorMsg, // Keep detailed message in details
          strategy: activeStrategy.getName(),
        };
      }
    }
    logger.info(
      `[McrService] All ${addedFacts.length} generated facts validated successfully. OpID: ${operationId}`
    );

    // Add facts to session if all are valid
    logger.info(
      `[McrService] Attempting to add ${addedFacts.length} fact(s) to session ${sessionId}. OpID: ${operationId}`
    );
    const addSuccess = sessionManager.addFacts(sessionId, addedFacts);
    if (addSuccess) {
      logger.info(
        `[McrService] Facts successfully added to session ${sessionId} using strategy "${activeStrategy.getName()}". OpID: ${operationId}. Facts:`,
        { addedFacts }
      );
      return {
        success: true,
        message: 'Facts asserted successfully.',
        addedFacts,
        strategy: activeStrategy.getName(),
      };
    } else {
      // This case should be less likely if sessionManager.addFacts is robust,
      // but kept for safety.
      logger.error(
        `[McrService] Failed to add facts to session ${sessionId} after validation. OpID: ${operationId}`
      );
      return {
        success: false,
        message: 'Failed to add facts to session manager after validation.',
        error: 'SESSION_ADD_FACTS_FAILED', // Standardized error code
        strategy: activeStrategy.getName(),
      };
    }
  } catch (error) {
    // Errors from strategy.assert() or llmService.generate()
    logger.error(
      `[McrService] Strategy/LLM Error asserting NL to session ${sessionId} using strategy "${activeStrategy.getName()}": ${error.message}`,
      { error: error.stack, errorCode: error.code } // Log stack for better debugging
    );
    return {
      success: false,
      message: `Error during assertion: ${error.message}`, // User-friendly message
      error: error.code || 'STRATEGY_ASSERT_FAILED', // Specific error code from strategy/LLM if available, else generic
      details: error.message, // Full error message in details
      strategy: activeStrategy.getName(),
    };
  }
}

/**
 * Queries a session using a natural language question and the active translation strategy.
 * @param {string} sessionId - The ID of the session.
 * @param {string} naturalLanguageQuestion - The natural language question.
 * @param {object} [queryOptions] - Optional parameters for the query (e.g., style for answer, dynamicOntology).
 * @returns {Promise<{success: boolean, answer?: string, debugInfo?: object, error?: string, strategy?: string}>}
 */
async function querySessionWithNL(
  sessionId,
  naturalLanguageQuestion,
  queryOptions = {}
) {
  const { dynamicOntology, style = 'conversational' } = queryOptions; // Extract style for LOGIC_TO_NL_ANSWER
  logger.info(
    `[McrService] Enter querySessionWithNL for session ${sessionId} using strategy "${activeStrategy.getName()}". NL Question: "${naturalLanguageQuestion}"`,
    { queryOptions }
  );
  const operationId = `query-${Date.now()}`; // Unique ID for this operation

  if (!sessionManager.getSession(sessionId)) {
    logger.warn(
      `[McrService] Session ${sessionId} not found for query. OpID: ${operationId}`
    );
    return {
      success: false,
      message: 'Session not found.',
      error: 'SESSION_NOT_FOUND', // Standardized error code
      strategy: activeStrategy.getName(),
    };
  }

  const debugInfo = {
    strategy: activeStrategy.getName(),
    operationId,
    level: config.debugLevel, // Include current debug level being applied
  };

  try {
    const existingFacts = sessionManager.getKnowledgeBase(sessionId) || '';
    let ontologyRules = ''; // For strategy context
    try {
      const globalOntologies = await ontologyService.listOntologies(true);
      if (globalOntologies && globalOntologies.length > 0) {
        ontologyRules = globalOntologies.map((ont) => ont.rules).join('\n');
        if (config.debugLevel === 'verbose') {
          logger.debug(
            `[McrService] Loaded ${globalOntologies.length} global ontologies for strategy query context. OpID: ${operationId}`
          );
        }
      }
    } catch (ontError) {
      logger.warn(
        `[McrService] Error fetching global ontologies for query strategy context in session ${sessionId}: ${ontError.message}. OpID: ${operationId}`
      );
      if (config.debugLevel !== 'none') {
        debugInfo.ontologyErrorForStrategy = `Failed to load global ontologies for query translation: ${ontError.message}`;
      }
    }

    if (config.debugLevel === 'verbose') {
        logger.debug(
          `[McrService] Context for strategy query (OpID: ${operationId}):`,
          {
            sessionId,
            existingFactsLength: existingFacts.length,
            ontologyRulesLength: ontologyRules.length,
          }
        );
    }

    // Delegate NL to Prolog query translation to the active strategy
    const lexiconSummary = sessionManager.getLexiconSummary(sessionId);
    const strategyOptions = { existingFacts, ontologyRules, lexiconSummary };

    if (config.debugLevel === 'verbose') {
        logger.info(
          `[McrService] Calling strategy "${activeStrategy.getName()}".query(). OpID: ${operationId}. Lexicon summary length: ${lexiconSummary?.length}`
        );
    }
    const prologQuery = await activeStrategy.query(
      naturalLanguageQuestion,
      llmService,
      strategyOptions
    );
    logger.info( // Always log the generated prolog query at info level for traceability
      `[McrService] Strategy "${activeStrategy.getName()}" translated NL question to Prolog query (OpID: ${operationId}): ${prologQuery}`
    );

    if (config.debugLevel !== 'none') {
      debugInfo.prologQuery = prologQuery;
    }

    // The strategy's query method should throw an error if it fails or produces an invalid query.

    // Get knowledge base for the session (session facts)
    let knowledgeBase = await sessionManager.getKnowledgeBase(sessionId); // Await async call
    if (knowledgeBase === null) { // This condition might be less likely if getSession already confirmed existence.
      // However, if getKnowledgeBase itself can return null for an existing session (e.g., empty facts), handle it.
      // Assuming getSession check is primary for session existence.
      // If session exists but KB is truly null/empty, it might be valid.
      // For now, keeping the check as it was, but noting `await`.
      logger.warn(`[McrService] Knowledge base is null for session ${sessionId}. OpID: ${operationId}`);
      // This could mean an empty KB or an issue reading it.
      // If an empty KB is valid, we might just proceed with an empty string.
      // For safety, if it's null (not just empty string), it might indicate an issue.
      // However, sessionManager.getKnowledgeBase returns null if sessionData is null.
      // And sessionManager.getSession would have already returned null if sessionData was null.
      // So this path should ideally not be hit if getSession passed.
      // Let's assume if getSession passed, getKnowledgeBase will give a string (possibly empty).
      // The original check `if (!sessionManager.getSession(sessionId))` handles non-existent sessions.
      // The `|| ''` in `const existingFacts = await sessionManager.getKnowledgeBase(sessionId) || '';` for strategy options
      // suggests empty string is the expected "empty" state.
      // So, `knowledgeBase` here should not be null if session exists.
      // This specific check might be redundant if `sessionManager.getSession(sessionId)` at the top is sufficient.
      // Let's simplify: if `getSession` passed, `getKnowledgeBase` will give us the string (or it's an internal error).
      // The `|| ''` pattern is good for `existingFacts` for strategy context.
      // For the main KB for the reasoner, an empty string is fine.

      // Re-evaluating: The first check `if (!await sessionManager.getSession(sessionId))` is the primary guard.
      // If that passes, `sessionManager.getKnowledgeBase(sessionId)` should return a string (possibly empty).
      // So, the `knowledgeBase === null` check here is likely redundant or indicates an unexpected state.
      // For now, let's trust the initial `getSession` check and that `getKnowledgeBase` returns a string.
      // The `existingFacts` for strategy context is handled with `|| ''`.
      // The `knowledgeBase` for reasoner can be an empty string.
      // No change needed here if the above logic holds. The `await` is the key fix.
      // This case should ideally not be hit if the primary session check passed.
      // If it does, it implies an internal inconsistency or an issue with getKnowledgeBase.
      logger.error(`[McrService] Knowledge base is null for existing session ${sessionId}. OpID: ${operationId}. This indicates an unexpected state.`);
      return {
        success: false,
        message: 'Internal error: Knowledge base not found for an existing session.',
        debugInfo,
        error: 'INTERNAL_KB_NOT_FOUND_FOR_SESSION', // More specific internal error code
      };
    }

    // Augment with global ontologies
    try {
      const globalOntologies = await ontologyService.listOntologies(true); // includeRules = true
      if (globalOntologies && globalOntologies.length > 0) {
        const currentOntologyRules = globalOntologies // Renamed to avoid conflict with outer scope
          .map((ont) => ont.rules)
          .join('\n');
        knowledgeBase += `\n% --- Global Ontologies ---\n${currentOntologyRules}`;
        logger.debug(
          `[McrService] Augmented knowledge base with ${globalOntologies.length} global ontologies.`
        );
      }
    } catch (ontError) {
      logger.error(
        `[McrService] Error fetching global ontologies for session ${sessionId}: ${ontError.message}`,
        { error: ontError }
      );
      // Decide if this is a fatal error for the query or just a warning
      // For now, proceed with session KB only if global ontologies fail
      debugInfo.ontologyError = `Failed to load global ontologies: ${ontError.message}`;
    }

    // Augment with dynamic ontology if provided for this specific query
    if (
      dynamicOntology &&
      typeof dynamicOntology === 'string' &&
      dynamicOntology.trim() !== ''
    ) {
      knowledgeBase += `\n% --- Dynamic RAG Ontology (Query-Specific) ---\n${dynamicOntology.trim()}`;
      logger.debug(
        `[McrService] Augmented knowledge base with dynamic (RAG) ontology for session ${sessionId}.`
      );
      debugInfo.dynamicOntologyProvided = true;
    }

    if (config.debugLevel === 'verbose') {
      debugInfo.knowledgeBaseSnapshot = knowledgeBase;
      logger.debug(
        `[McrService] Knowledge base for query execution (OpID: ${operationId}). Length: ${knowledgeBase.length}`
      );
    } else if (config.debugLevel === 'basic') {
      debugInfo.knowledgeBaseSummary = `KB length: ${knowledgeBase.length}, Dynamic RAG provided: ${!!debugInfo.dynamicOntologyProvided}`;
    }


    // 3. Execute Prolog query
    if (config.debugLevel === 'verbose') {
        logger.info(
          `[McrService] Executing Prolog query with reasonerService. OpID: ${operationId}`
        );
    }
    const prologResults = await reasonerService.executeQuery(
      knowledgeBase,
      prologQuery
    );

    if (config.debugLevel === 'verbose') {
        logger.debug(
          `[McrService] Prolog query execution results (OpID: ${operationId}):`,
          prologResults
        );
        debugInfo.prologResults = prologResults; // Full results for verbose
        debugInfo.prologResultsJSON = JSON.stringify(prologResults);
    } else if (config.debugLevel === 'basic') {
        // For basic, maybe just a summary of results, e.g., number of solutions or true/false
        debugInfo.prologResultsSummary = Array.isArray(prologResults)
          ? `${prologResults.length} solution(s) found.`
          : `Result: ${prologResults}`;
        // Avoid sending full JSON unless verbose
    }


    // 4. Translate Prolog results to NL answer
    const prologResultsForPrompt = config.debugLevel === 'verbose' ? debugInfo.prologResultsJSON : JSON.stringify(prologResults);
    const logicToNlPromptContext = {
      naturalLanguageQuestion,
      prologResultsJSON: prologResultsForPrompt, // Use potentially summarized or full JSON
      style: style,
    };
    if (config.debugLevel === 'verbose') {
        logger.info(
          `[McrService] Generating NL answer from Prolog results using LLM. OpID: ${operationId}`
        );
        logger.debug(
          `[McrService] Context for LOGIC_TO_NL_ANSWER prompt (OpID: ${operationId}):`,
          logicToNlPromptContext
        );
    }

    const naturalLanguageAnswer = await llmService.generate(
      prompts.LOGIC_TO_NL_ANSWER.system,
      fillTemplate(prompts.LOGIC_TO_NL_ANSWER.user, logicToNlPromptContext)
    );
    logger.info( // Always log the final NL answer at info level
      `[McrService] NL answer generated (OpID: ${operationId}): "${naturalLanguageAnswer}"`
    );

    if (config.debugLevel === 'verbose') {
      debugInfo.llmTranslationResultToNL = naturalLanguageAnswer; // LLM's raw output for this step
    }

    logger.info(
      `[McrService] Exit querySessionWithNL for session ${sessionId} successfully. OpID: ${operationId}. Strategy: ${activeStrategy.getName()}`
    );
    return { success: true, answer: naturalLanguageAnswer, debugInfo };
  } catch (error) {
    logger.error(
      `[McrService] Error querying session ${sessionId} with NL (OpID: ${operationId}): ${error.message}`,
      { error: error.stack } // Log full error for strategy related issues
    );
    debugInfo.error = error.message;
    return {
      success: false,
      message: `Error during query: ${error.message}`, // User-friendly message
      debugInfo, // Contains detailed error from the catch block if any
      error: error.code || 'STRATEGY_QUERY_FAILED', // Specific error code from strategy/LLM if available, else generic
      details: error.message, // Full error message in details
      strategy: activeStrategy.getName(),
    };
  }
}

// The assertNLToSessionWithSIR function is now effectively superseded by using assertNLToSession
// with the 'SIR-R1' strategy. If specific retry logic for SIR was desired independent of the strategy's
// own retry mechanism (if any), it would need to be part of the SIRR1Strategy.
// For now, assertNLToSessionWithSIR is removed as its functionality is covered by the strategy pattern.

/**
 * Translates natural language text directly to Prolog facts/rules.
 * @param {string} naturalLanguageText - The natural language text.
 * @param {string} [strategyName] - Optional: specific strategy to use for this translation. Defaults to active strategy.
 * @returns {Promise<{success: boolean, rules?: string[], error?: string, strategy?: string, rawOutput?: string}>}
 */
async function translateNLToRulesDirect(
  naturalLanguageText,
  strategyName = activeStrategyName
) {
  const operationId = `transNLToRules-${Date.now()}`;
  logger.info(
    `[McrService] Enter translateNLToRulesDirect (OpID: ${operationId}). Strategy: "${strategyName}". NL Text: "${naturalLanguageText}"`
  );

  const strategyToUse = strategies[strategyName] || activeStrategy;
  if (!strategyToUse) {
    logger.error(
      `[McrService] No valid strategy found for translateNLToRulesDirect (OpID: ${operationId}). Requested: ${strategyName}, Active: ${activeStrategyName}. Available: ${Object.keys(strategies).join(', ')}`
    );
    return {
      success: false,
      message: 'No valid translation strategy available.',
      error: 'STRATEGY_NOT_FOUND', // Standardized error code
    };
  }

  try {
    // The `assert` method of a strategy is designed to return Prolog facts/rules.
    // We don't have session context here (existingFacts, ontologyRules) for this direct translation.
    // Strategies should be able to handle missing options if they are designed for this use case.
    logger.info(
      `[McrService] Calling strategy "${strategyToUse.getName()}".assert() for direct NL to Rules. OpID: ${operationId}`
    );
    const prologRules = await strategyToUse.assert(
      naturalLanguageText,
      llmService,
      // No session-specific lexicon for direct translation, could consider a global lexicon if available
      { ontologyRules: await ontologyService.getGlobalOntologyRulesAsString() }
    );
    logger.debug(
      `[McrService] Strategy "${strategyToUse.getName()}".assert() returned (OpID: ${operationId}):`,
      { prologRules }
    );

    if (!prologRules || prologRules.length === 0) {
      logger.warn(
        `[McrService] Strategy "${strategyToUse.getName()}" extracted no rules from text (OpID: ${operationId}): "${naturalLanguageText}"`
      );
      return {
        success: false,
        message: 'Could not translate text into valid rules.',
        error: 'NO_RULES_EXTRACTED_BY_STRATEGY', // Standardized error code
        strategy: strategyToUse.getName(),
      };
    }
    logger.info(
      `[McrService] Successfully translated NL to Rules (Direct). OpID: ${operationId}. Rules count: ${prologRules.length}. Strategy: ${strategyToUse.getName()}`
    );
    return {
      success: true,
      rules: prologRules,
      strategy: strategyToUse.getName(),
    };
  } catch (error) {
    logger.error(
      `[McrService] Error translating NL to Rules (Direct) using strategy "${strategyToUse.getName()}" (OpID: ${operationId}): ${error.message}`,
      { error: error.stack }
    );
    return {
      success: false,
      message: `Error during NL to Rules translation: ${error.message}`, // User-friendly message
      error: error.code || 'NL_TO_RULES_TRANSLATION_FAILED', // Specific error code if available
      details: error.message, // Full error message in details
      strategy: strategyToUse.getName(),
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
 * @returns {Promise<{success: boolean, explanation?: string, debugInfo?: object, error?: string, strategy?: string}>}
 */
async function explainQuery(sessionId, naturalLanguageQuestion) {
  const operationId = `explain-${Date.now()}`;
  logger.info(
    `[McrService] Enter explainQuery for session ${sessionId} (OpID: ${operationId}). Strategy: "${activeStrategy.getName()}". NL Question: "${naturalLanguageQuestion}"`
  );

  const sessionExists = await sessionManager.getSession(sessionId); // Await async call
  if (!sessionExists) {
    logger.warn(
      `[McrService] Session ${sessionId} not found for explain query. OpID: ${operationId}`
    );
    return {
      success: false,
      message: 'Session not found.',
      error: 'SESSION_NOT_FOUND', // Standardized error code
      strategy: activeStrategy.getName(),
    };
  }

  const debugInfo = {
    naturalLanguageQuestion, // Always include original question
    strategy: activeStrategy.getName(),
    operationId,
    level: config.debugLevel,
  };

  try {
    const existingFacts = sessionManager.getKnowledgeBase(sessionId) || '';
    let contextOntologyRulesForQueryTranslation = '';

    try {
      const globalOntologies = await ontologyService.listOntologies(true);
      if (globalOntologies && globalOntologies.length > 0) {
        contextOntologyRulesForQueryTranslation = globalOntologies
          .map((ont) => ont.rules)
          .join('\n');
        if (config.debugLevel === 'verbose') {
            logger.debug(
              `[McrService] Fetched ${globalOntologies.length} global ontologies for NL_TO_QUERY context in explain. OpID: ${operationId}`
            );
        }
      }
    } catch (ontError) {
      logger.warn(
        `[McrService] Error fetching global ontologies for NL_TO_QUERY context in explain (session ${sessionId}, OpID: ${operationId}): ${ontError.message}`
      );
      if (config.debugLevel !== 'none') {
        debugInfo.ontologyErrorForStrategy = `Failed to load global ontologies for query translation context: ${ontError.message}`;
      }
    }

    if (config.debugLevel === 'verbose') {
        logger.debug(
          `[McrService] Context for strategy query in explain (OpID: ${operationId}):`,
          {
            sessionId,
            existingFactsLength: existingFacts.length,
            ontologyRulesLength: contextOntologyRulesForQueryTranslation.length,
          }
        );
    }


    const lexiconSummary = sessionManager.getLexiconSummary(sessionId);
    if (config.debugLevel === 'verbose') {
        logger.info(
          `[McrService] Calling strategy "${activeStrategy.getName()}".query() for explanation. OpID: ${operationId}. Lexicon length: ${lexiconSummary?.length}`
        );
    }
    const strategyOptions = {
      existingFacts,
      ontologyRules: contextOntologyRulesForQueryTranslation,
      lexiconSummary,
    };
    const prologQuery = await activeStrategy.query(
      naturalLanguageQuestion,
      llmService,
      strategyOptions
    );
    logger.info( // Always log translated query
      `[McrService] Strategy "${activeStrategy.getName()}" translated NL to Prolog query for explanation (OpID: ${operationId}): ${prologQuery}`
    );
    if (config.debugLevel !== 'none') {
      debugInfo.prologQuery = prologQuery;
    }


    if (config.debugLevel === 'verbose') {
      debugInfo.sessionFactsSnapshot = existingFacts; // Verbose only
    } else if (config.debugLevel === 'basic') {
      debugInfo.sessionFactsSummary = `Session facts length: ${existingFacts.length}`;
    }

    let explainPromptOntologyRules = ''; // For the EXPLAIN_PROLOG_QUERY prompt context
    try {
      const ontologiesForExplainPrompt =
        await ontologyService.listOntologies(true);
      if (ontologiesForExplainPrompt && ontologiesForExplainPrompt.length > 0) {
        explainPromptOntologyRules = ontologiesForExplainPrompt
          .map((ont) => ont.rules)
          .join('\n');
        if (config.debugLevel === 'verbose') {
            logger.debug(
              `[McrService] Fetched ${ontologiesForExplainPrompt.length} global ontologies for EXPLAIN_PROLOG_QUERY prompt. OpID: ${operationId}`
            );
        }
      }
    } catch (ontErrorForExplain) {
      logger.warn(
        `[McrService] Error fetching global ontologies for EXPLAIN_PROLOG_QUERY prompt context (session ${sessionId}, OpID: ${operationId}): ${ontErrorForExplain.message}`
      );
      if (config.debugLevel !== 'none') {
        debugInfo.ontologyErrorForPrompt = `Failed to load global ontologies for explanation prompt: ${ontErrorForExplain.message}`;
      }
    }
    if (config.debugLevel === 'verbose') {
      debugInfo.ontologyRulesForPromptSnapshot = explainPromptOntologyRules; // Verbose only
    }


    const explainPromptContext = {
      naturalLanguageQuestion,
      prologQuery,
      sessionFacts: existingFacts, // Full facts for prompt, regardless of debugInfo level for API response
      ontologyRules: explainPromptOntologyRules, // Full rules for prompt
    };

    if (config.debugLevel === 'verbose') {
        logger.info(
          `[McrService] Generating explanation using LLM with EXPLAIN_PROLOG_QUERY prompt. OpID: ${operationId}`
        );
        logger.debug(
          `[McrService] Context for EXPLAIN_PROLOG_QUERY prompt (OpID: ${operationId}):`,
          explainPromptContext // This context itself can be large
        );
    }

    const explanation = await llmService.generate(
      prompts.EXPLAIN_PROLOG_QUERY.system,
      fillTemplate(prompts.EXPLAIN_PROLOG_QUERY.user, explainPromptContext)
    );
    logger.info( // Always log generated explanation
      `[McrService] Explanation generated for session ${sessionId}. OpID: ${operationId}. Length: ${explanation?.length}`
    );

    if (config.debugLevel === 'verbose') {
      debugInfo.llmRawExplanation = explanation; // Verbose only
    } else if (config.debugLevel === 'basic' && explanation) {
      debugInfo.explanationSummary = `Explanation length: ${explanation.length}`;
    }


    if (!explanation || explanation.trim() === '') {
      logger.warn(
        `[McrService] Empty explanation generated for query. OpID: ${operationId}. Strategy: ${activeStrategy.getName()}`
      );
      return {
        success: false,
        message: 'Failed to generate an explanation for the query.',
        debugInfo,
        error: 'EMPTY_EXPLANATION_GENERATED', // Standardized error code
      };
    }
    logger.info(
      `[McrService] Exit explainQuery successfully for session ${sessionId}. OpID: ${operationId}. Strategy: ${activeStrategy.getName()}`
    );
    return { success: true, explanation, debugInfo };
  } catch (error) {
    logger.error(
      `[McrService] Error explaining query for session ${sessionId} (OpID: ${operationId}): ${error.message}`,
      { error: error.stack }
    );
    debugInfo.error = error.message;
    return {
      success: false,
      message: `Error during query explanation: ${error.message}`, // User-friendly message
      debugInfo, // Contains detailed error from the catch block if any
      error: error.code || 'EXPLAIN_QUERY_FAILED', // Specific error code if available
      details: error.message, // Full error message in details
      strategy: activeStrategy.getName(),
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
  setTranslationStrategy, // Expose the function to change strategy
  getActiveStrategyName, // Expose function to get current strategy name
  // Expose session management directly if needed by API handlers for create/delete
  createSession: sessionManager.createSession,
  getSession: sessionManager.getSession,
  deleteSession: sessionManager.deleteSession,
  getLexiconSummary: sessionManager.getLexiconSummary, // Expose if API needs it directly
  translateNLToRulesDirect,
  translateRulesToNLDirect,
  explainQuery,
  getPrompts,
  debugFormatPrompt,
  // assertNLToSessionWithSIR is removed, its functionality is via assertNLToSession with SIR-R1 strategy
};
