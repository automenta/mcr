// src/mcrService.js
const llmService = require('./llmService');
const reasonerService = require('./reasonerService');
const sessionManager = require('./sessionManager');
const ontologyService = require('./ontologyService');
const { prompts, fillTemplate } = require('./prompts');
const logger = require('./logger');
const config = require('./config');
const strategyManager = require('./strategyManager');
const StrategyExecutor = require('./strategyExecutor');
const { MCRError, ErrorCodes } = require('./errors');
const InputRouter = require('./evolution/inputRouter');
const db = require('./database');

let inputRouterInstance;
try {
  inputRouterInstance = new InputRouter(db);
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

  if (inputRouterInstance && naturalLanguageText) {
    try {
      const recommendedStrategyHash = await inputRouterInstance.route(
        naturalLanguageText,
        config.llmProvider.model
      );
      if (recommendedStrategyHash) {
        strategyJson = strategyManager.getStrategyByHash(recommendedStrategyHash);
        if (strategyJson) {
          logger.info(
            `[McrService] InputRouter recommended strategy by HASH "${recommendedStrategyHash}" (ID: "${strategyJson.id}", Name: "${strategyJson.name}") for ${operationType} on input: "${naturalLanguageText.substring(0, 50)}..."`
          );
        } else {
          logger.warn(
            `[McrService] InputRouter recommended strategy HASH "${recommendedStrategyHash}" but it was not found by StrategyManager. Falling back for input: "${naturalLanguageText.substring(0, 50)}..."`
          );
        }
      } else {
        logger.debug(
          `[McrService] InputRouter did not recommend a specific strategy for "${naturalLanguageText.substring(0, 50)}...". Falling back to default logic.`
        );
      }
    } catch (routerError) {
      logger.error(
        `[McrService] InputRouter failed to recommend a strategy: ${routerError.message}. Falling back.`,
        routerError
      );
    }
  }

  if (!strategyJson) {
    const operationalStrategyId = `${baseStrategyId}-${operationType}`;
    strategyJson = strategyManager.getStrategy(operationalStrategyId);
    let strategyIdToLog = operationalStrategyId;

    if (!strategyJson) {
      logger.warn(
        `[McrService] Configured operational strategy "${operationalStrategyId}" not found. Trying base ID "${baseStrategyId}".`
      );
      strategyJson = strategyManager.getStrategy(baseStrategyId);
      strategyIdToLog = baseStrategyId;
      if (!strategyJson) {
        logger.warn(
          `[McrService] Configured base strategy "${baseStrategyId}" also not found for ${operationType}. Falling back to StrategyManager's default.`
        );
        strategyJson = strategyManager.getDefaultStrategy();
        strategyIdToLog = strategyJson.id;
        logger.warn(
          `[McrService] Using system default strategy "${strategyIdToLog}" (Name: "${strategyJson.name}") for ${operationType}.`
        );
      } else {
        logger.info(
          `[McrService] Using configured base strategy "${strategyIdToLog}" (Name: "${strategyJson.name}") for ${operationType} as operational variant was not found.`
        );
      }
    } else {
      logger.info(
        `[McrService] Using configured operational strategy "${strategyIdToLog}" (Name: "${strategyJson.name}") for ${operationType}.`
      );
    }
  }
  return strategyJson;
}

async function logInitialStrategy() {
  try {
    const initialDisplayStrategy = await getOperationalStrategyJson('Assert', 'System startup initial strategy check.');
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
      const currentAssertStrategy = await getOperationalStrategyJson('Assert', 'Strategy set check.');
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

function getActiveStrategyId() {
  return baseStrategyId;
}

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
    const existingFacts = (await sessionManager.getKnowledgeBase(sessionId)) || '';
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
    const initialContext = { naturalLanguageText, existingFacts, ontologyRules, lexiconSummary, llm_model_id: config.llmProvider.model };

    logger.info(`[McrService] Executing strategy "${activeStrategyJson.name}" (ID: ${currentStrategyId}) for assertion. OpID: ${operationId}.`);
    const executor = new StrategyExecutor(activeStrategyJson);
    const executionResult = await executor.execute(llmService, initialContext);

    const addedFacts = executionResult; // In SIR-R1-Assert, the result of the strategy is directly the array of prolog clauses.
    const costOfExecution = null; // executionResult.totalCost; // TODO: Re-enable cost tracking if strategy executor provides it.

    // Validate addedFacts structure (array of strings)
    if (!Array.isArray(addedFacts) || !addedFacts.every((f) => typeof f === 'string')) {
      logger.error(
        `[McrService] Strategy "${currentStrategyId}" execution for assertion did not return an array of strings. OpID: ${operationId}. Output: ${JSON.stringify(addedFacts)}`,
        { costOfExecution }
      );
      throw new MCRError(ErrorCodes.STRATEGY_INVALID_OUTPUT, 'Strategy execution for assertion returned an unexpected output format. Expected array of Prolog strings.');
    }
    logger.debug(`[McrService] Strategy "${currentStrategyId}" execution returned (OpID: ${operationId}):`, { addedFacts, costOfExecution });

    if (!addedFacts || addedFacts.length === 0) {
      logger.warn(`[McrService] Strategy "${currentStrategyId}" returned no facts for text: "${naturalLanguageText}". OpID: ${operationId}`, { costOfExecution });
      return { success: false, message: 'Could not translate text into valid facts using the current strategy.', error: ErrorCodes.NO_FACTS_EXTRACTED, strategyId: currentStrategyId, cost: costOfExecution };
    }

    for (const factString of addedFacts) {
      const validationResult = await reasonerService.validateKnowledgeBase(factString);
      if (!validationResult.isValid) {
        const validationErrorMsg = `Generated Prolog is invalid: "${factString}". Error: ${validationResult.error}`;
        logger.error(`[McrService] Validation failed for generated Prolog. OpID: ${operationId}. Details: ${validationErrorMsg}`, { costOfExecution });
        return { success: false, message: 'Failed to assert facts: Generated Prolog is invalid.', error: ErrorCodes.INVALID_GENERATED_PROLOG, details: validationErrorMsg, strategyId: currentStrategyId, cost: costOfExecution };
      }
    }
    logger.info(`[McrService] All ${addedFacts.length} generated facts validated successfully. OpID: ${operationId}`);

    const addSuccess = sessionManager.addFacts(sessionId, addedFacts);
    if (addSuccess) {
      logger.info(`[McrService] Facts successfully added to session ${sessionId}. OpID: ${operationId}. Facts:`, { addedFacts, costOfExecution });
      return { success: true, message: 'Facts asserted successfully.', addedFacts, strategyId: currentStrategyId, cost: costOfExecution };
    } else {
      logger.error(`[McrService] Failed to add facts to session ${sessionId} after validation. OpID: ${operationId}`, { costOfExecution });
      return { success: false, message: 'Failed to add facts to session manager after validation.', error: ErrorCodes.SESSION_ADD_FACTS_FAILED, strategyId: currentStrategyId, cost: costOfExecution };
    }
  } catch (error) {
    logger.error(`[McrService] Error asserting NL to session ${sessionId} using strategy "${currentStrategyId}": ${error.message}`, { stack: error.stack, details: error.details, errorCode: error.code });
    // Ensure cost is included in error returns if available, or null otherwise
    const cost = error.costData || null; // Assuming error object might carry costData
    return { success: false, message: `Error during assertion: ${error.message}`, error: error.code || ErrorCodes.STRATEGY_EXECUTION_ERROR, details: error.message, strategyId: currentStrategyId, cost };
  }
}

async function querySessionWithNL(sessionId, naturalLanguageQuestion, queryOptions = {}) {
  const activeStrategyJson = await getOperationalStrategyJson('Query', naturalLanguageQuestion);
  const currentStrategyId = activeStrategyJson.id;
  const { dynamicOntology, style = 'conversational' } = queryOptions;
  logger.info(
    `[McrService] Enter querySessionWithNL for session ${sessionId} using strategy "${activeStrategyJson.name}" (ID: ${currentStrategyId}). NL Question: "${naturalLanguageQuestion}"`, { queryOptions }
  );
  const operationId = `query-${Date.now()}`;

  if (!sessionManager.getSession(sessionId)) {
    logger.warn(`[McrService] Session ${sessionId} not found for query. OpID: ${operationId}`);
    return { success: false, message: 'Session not found.', error: ErrorCodes.SESSION_NOT_FOUND, strategyId: currentStrategyId };
  }

  const debugInfo = { strategyId: currentStrategyId, operationId, level: config.debugLevel };

  try {
    const existingFacts = (await sessionManager.getKnowledgeBase(sessionId)) || '';
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
    const initialContext = { naturalLanguageQuestion, existingFacts, ontologyRules, lexiconSummary, llm_model_id: config.llmProvider.model };

    logger.info(`[McrService] Executing strategy "${activeStrategyJson.name}" (ID: ${currentStrategyId}) for query translation. OpID: ${operationId}.`);
    const executor = new StrategyExecutor(activeStrategyJson);
    const strategyExecutionResult = await executor.execute(llmService, initialContext);
    const prologQuery = strategyExecutionResult; // Corrected: strategyExecutionResult is the prolog query string
    // TODO: Accumulate/return strategyExecutionResult.totalCost; if execute returns an object with cost

    if (typeof prologQuery !== 'string' || !prologQuery.endsWith('.')) {
      logger.error(`[McrService] Strategy "${currentStrategyId}" execution for query did not return a valid Prolog query string. OpID: ${operationId}. Output: ${prologQuery}`);
      throw new MCRError(ErrorCodes.STRATEGY_INVALID_OUTPUT, 'Strategy execution for query returned an unexpected output format. Expected Prolog query string ending with a period.');
    }
    logger.info(`[McrService] Strategy "${currentStrategyId}" translated NL question to Prolog query (OpID: ${operationId}): ${prologQuery}`);
    debugInfo.prologQuery = prologQuery;

    let knowledgeBase = await sessionManager.getKnowledgeBase(sessionId);
    if (knowledgeBase === null) {
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
    const llmAnswerResult = await llmService.generate(prompts.LOGIC_TO_NL_ANSWER.system, fillTemplate(prompts.LOGIC_TO_NL_ANSWER.user, logicToNlPromptContext));
    const naturalLanguageAnswerText = llmAnswerResult && typeof llmAnswerResult.text === 'string' ? llmAnswerResult.text : null;
    // TODO: Accumulate/return llmAnswerResult.costData

    if (config.debugLevel === 'verbose') debugInfo.llmTranslationResultToNL = naturalLanguageAnswerText;

    if (!naturalLanguageAnswerText) { // Check if LLM failed to provide an answer text
        logger.warn(`[McrService] LLM returned no text for LOGIC_TO_NL_ANSWER. OpID: ${operationId}`);
        return { success: false, message: 'Failed to generate a natural language answer from query results.', debugInfo, error: ErrorCodes.LLM_EMPTY_RESPONSE, strategyId: currentStrategyId };
    }

    logger.info(`[McrService] NL answer generated (OpID: ${operationId}): "${naturalLanguageAnswerText}"`);
    return { success: true, answer: naturalLanguageAnswerText, debugInfo };
  } catch (error) {
    logger.error(`[McrService] Error querying session ${sessionId} with NL (OpID: ${operationId}, Strategy ID: ${currentStrategyId}): ${error.message}`, { stack: error.stack, details: error.details, errorCode: error.code });
    debugInfo.error = error.message;
    return { success: false, message: `Error during query: ${error.message}`, debugInfo, error: error.code || ErrorCodes.STRATEGY_EXECUTION_ERROR, details: error.message, strategyId: currentStrategyId };
  }
}

async function translateNLToRulesDirect(naturalLanguageText, strategyIdToUse) {
  const effectiveBaseId = strategyIdToUse || baseStrategyId;
  const strategyJsonToUse = strategyIdToUse
    ? strategyManager.getStrategy(`${effectiveBaseId}-Assert`) || strategyManager.getStrategy(effectiveBaseId) || (await getOperationalStrategyJson('Assert', naturalLanguageText))
    : await getOperationalStrategyJson('Assert', naturalLanguageText);

  if (!strategyJsonToUse) {
    logger.error(`[McrService] No valid strategy found for direct NL to Rules. Base ID: "${effectiveBaseId}".`);
    return { success: false, message: `No valid strategy could be determined for base ID "${effectiveBaseId}".`, error: ErrorCodes.STRATEGY_NOT_FOUND, strategyId: effectiveBaseId };
  }
  const currentStrategyId = strategyJsonToUse.id;
  const operationId = `transNLToRules-${Date.now()}`;
  logger.info(`[McrService] Enter translateNLToRulesDirect (OpID: ${operationId}). Strategy ID: "${currentStrategyId}". NL Text: "${naturalLanguageText}"`);

  try {
    logger.info(`[McrService] Using strategy "${strategyJsonToUse.name}" (ID: ${currentStrategyId}) for direct NL to Rules. OpID: ${operationId}`);
    const globalOntologyRules = await ontologyService.getGlobalOntologyRulesAsString();
    const initialContext = { naturalLanguageText, ontologyRules: globalOntologyRules, lexiconSummary: 'No lexicon summary available for direct translation.', llm_model_id: config.llmProvider.model };

    const executor = new StrategyExecutor(strategyJsonToUse);
    const executionResult = await executor.execute(llmService, initialContext);
    const prologRules = executionResult;
    // TODO: Handle executionResult.totalCost; if execute returns an object with cost

    if (!Array.isArray(prologRules) || !prologRules.every((r) => typeof r === 'string')) {
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
    return { success: false, message: `Error during NL to Rules translation: ${error.message}`, error: error.code || ErrorCodes.STRATEGY_EXECUTION_ERROR, details: error.message, strategyId: currentStrategyId };
  }
}

async function translateRulesToNLDirect(prologRules, style = 'conversational') {
  const operationId = `transRulesToNL-${Date.now()}`;
  logger.info(`[McrService] Enter translateRulesToNLDirect (OpID: ${operationId}). Style: ${style}. Rules length: ${prologRules?.length}`);
  logger.debug(`[McrService] Rules for direct translation to NL (OpID: ${operationId}):\n${prologRules}`);

  if (!prologRules || typeof prologRules !== 'string' || prologRules.trim() === '') {
    logger.warn(`[McrService] translateRulesToNLDirect called with empty or invalid prologRules. OpID: ${operationId}`);
    return { success: false, message: 'Input Prolog rules must be a non-empty string.', error: 'EMPTY_RULES_INPUT' };
  }

  try {
    const promptContext = { prologRules, style };
    logger.info(`[McrService] Generating NL explanation from rules using LLM. OpID: ${operationId}`);
    logger.debug(`[McrService] Context for RULES_TO_NL_DIRECT prompt (OpID: ${operationId}):`, promptContext);
    const rulesToNLPromptUser = fillTemplate(prompts.RULES_TO_NL_DIRECT.user, promptContext);

    const llmExplanationResult = await llmService.generate(prompts.RULES_TO_NL_DIRECT.system, rulesToNLPromptUser);
    const nlExplanationText = (llmExplanationResult && typeof llmExplanationResult.text === 'string') ? llmExplanationResult.text : null;
    // TODO: Handle llmExplanationResult.costData

    logger.debug(`[McrService] Prolog rules translated to NL (Direct) (OpID: ${operationId}):\n${nlExplanationText}`);

    if (!nlExplanationText || (typeof nlExplanationText === 'string' && nlExplanationText.trim() === '')) {
      logger.warn(`[McrService] Empty explanation generated for rules to NL (Direct). OpID: ${operationId}`);
      return { success: false, message: 'Failed to generate a natural language explanation.', error: 'EMPTY_EXPLANATION_GENERATED' };
    }
    logger.info(`[McrService] Successfully translated Rules to NL (Direct). OpID: ${operationId}. Explanation length: ${nlExplanationText.length}.`);
    return { success: true, explanation: nlExplanationText };
  } catch (error) {
    logger.error(`[McrService] Error translating Rules to NL (Direct) (OpID: ${operationId}): ${error.message}`,{ error: error.stack });
    return { success: false, message: `Error during Rules to NL translation: ${error.message}`, error: error.code || 'RULES_TO_NL_TRANSLATION_FAILED', details: error.message };
  }
}

async function explainQuery(sessionId, naturalLanguageQuestion) {
  const activeStrategyJson = await getOperationalStrategyJson('Query', naturalLanguageQuestion);
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
    const existingFacts = (await sessionManager.getKnowledgeBase(sessionId)) || '';
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
    const initialStrategyContext = { naturalLanguageQuestion, existingFacts, ontologyRules: contextOntologyRulesForQueryTranslation, lexiconSummary, llm_model_id: config.llmProvider.model };

    logger.info(`[McrService] Executing strategy "${activeStrategyJson.name}" (ID: ${currentStrategyId}) for query translation in explain. OpID: ${operationId}.`);
    const executor = new StrategyExecutor(activeStrategyJson);
    const strategyExecutionResult = await executor.execute(llmService, initialStrategyContext);
    const prologQuery = strategyExecutionResult; // Corrected: strategyExecutionResult is the prolog query string
    // TODO: Handle strategyExecutionResult.totalCost; if execute returns an object with cost

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
    const llmExplanationResult = await llmService.generate(prompts.EXPLAIN_PROLOG_QUERY.system, fillTemplate(prompts.EXPLAIN_PROLOG_QUERY.user, explainPromptContext));
    const explanationText = (llmExplanationResult && typeof llmExplanationResult.text === 'string') ? llmExplanationResult.text : null;
    // TODO: Handle llmExplanationResult.costData

    if (!explanationText || (typeof explanationText === 'string' && explanationText.trim() === '')) {
      return { success: false, message: 'Failed to generate an explanation for the query.', debugInfo, error: ErrorCodes.LLM_EMPTY_RESPONSE, strategyId: currentStrategyId };
    }
    return { success: true, explanation: explanationText, debugInfo };
  } catch (error) {
    logger.error(`[McrService] Error explaining query for session ${sessionId} (OpID: ${operationId}, Strategy ID: ${currentStrategyId}): ${error.message}`, { stack: error.stack, details: error.details, errorCode: error.code });
    debugInfo.error = error.message;
    return { success: false, message: `Error during query explanation: ${error.message}`, debugInfo, error: error.code || ErrorCodes.STRATEGY_EXECUTION_ERROR, details: error.message, strategyId: currentStrategyId };
  }
}

async function getPrompts() {
  const operationId = `getPrompts-${Date.now()}`;
  logger.info(`[McrService] Enter getPrompts (OpID: ${operationId})`);
  try {
    logger.debug(`[McrService] Successfully retrieved prompts. OpID: ${operationId}. Prompt count: ${Object.keys(prompts).length}`);
    return { success: true, prompts: prompts };
  } catch (error) {
    logger.error(`[McrService] Error retrieving prompts (OpID: ${operationId}): ${error.message}`, { error: error.stack });
    return { success: false, message: `Error retrieving prompts: ${error.message}`, error: error.code || 'GET_PROMPTS_FAILED', details: error.message };
  }
}

async function debugFormatPrompt(templateName, inputVariables) {
  const operationId = `debugFormat-${Date.now()}`;
  logger.info(`[McrService] Enter debugFormatPrompt (OpID: ${operationId}). Template: ${templateName}`, { inputVariables });

  if (!templateName || typeof templateName !== 'string') {
    logger.warn(`[McrService] Invalid template name for debugFormatPrompt. OpID: ${operationId}`, { templateName });
    return { success: false, message: 'Template name must be a non-empty string.', error: 'INVALID_TEMPLATE_NAME' };
  }
  if (!inputVariables || typeof inputVariables !== 'object') {
    logger.warn(`[McrService] Invalid input variables for debugFormatPrompt (OpID: ${operationId}). Received: ${typeof inputVariables}`,{ inputVariables });
    return { success: false, message: 'Input variables must be an object.', error: 'INVALID_INPUT_VARIABLES' };
  }

  const template = prompts[templateName];
  if (!template) {
    logger.warn(`[McrService] Prompt template "${templateName}" not found for debugFormatPrompt. OpID: ${operationId}`);
    return { success: false, message: `Prompt template "${templateName}" not found.`, error: 'TEMPLATE_NOT_FOUND' };
  }
  if (!template.user) {
    logger.warn(`[McrService] Prompt template "${templateName}" has no 'user' field for debugFormatPrompt. OpID: ${operationId}`);
    return { success: false, message: `Prompt template "${templateName}" does not have a 'user' field to format.`, error: 'TEMPLATE_USER_FIELD_MISSING' };
  }

  try {
    logger.debug(`[McrService] Attempting to fill template "${templateName}" with variables. OpID: ${operationId}`);
    const formattedUserPrompt = fillTemplate(template.user, inputVariables);
    logger.info(`[McrService] Successfully formatted prompt "${templateName}". OpID: ${operationId}`);
    return { success: true, templateName, rawTemplate: template, formattedUserPrompt, inputVariables };
  } catch (error) {
    logger.error(`[McrService] Error formatting prompt ${templateName} (OpID: ${operationId}): ${error.message}`, { error: error.stack });
    return { success: false, message: `Error formatting prompt: ${error.message}`, error: error.code || 'PROMPT_FORMATTING_FAILED', details: error.message };
  }
}

module.exports = {
  assertNLToSession,
  querySessionWithNL,
  setTranslationStrategy,
  getActiveStrategyId,
  createSession: sessionManager.createSession,
  getSession: sessionManager.getSession,
  deleteSession: sessionManager.deleteSession,
  getLexiconSummary: sessionManager.getLexiconSummary,
  translateNLToRulesDirect,
  translateRulesToNLDirect,
  explainQuery,
  getPrompts,
  debugFormatPrompt,
  getAvailableStrategies: strategyManager.getAvailableStrategies,
};
