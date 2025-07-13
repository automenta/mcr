// src/translationService.js
const llmService = require('./llmService');
const reasonerService = require('./reasonerService');
const ontologyService = require('./ontologyService');
const { prompts, fillTemplate, getPromptTemplateByName } = require('./prompts');
const logger = require('./util/logger');
const config = require('./config');
const strategyManager = require('./strategyManager');
const StrategyExecutor = require('./strategyExecutor');
const { MCRError, ErrorCodes } = require('./errors');
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
async function translateNLToRulesDirect(naturalLanguageText, strategyIdToUse, getActiveStrategyId, getOperationalStrategyJson) {
  // Use getOperationalStrategyJson from mcrService
  const effectiveBaseId = strategyIdToUse || getActiveStrategyId(); // Use mcrService's baseStrategyId
  const strategyJsonToUse = strategyIdToUse
    ? strategyManager.getStrategy(`${effectiveBaseId}-Assert`) || // Prefer assert variant
      strategyManager.getStrategy(effectiveBaseId) ||
      (await getOperationalStrategyJson('Assert', naturalLanguageText)) // Fallback to mcrService's logic
    : await getOperationalStrategyJson('Assert', naturalLanguageText);

  if (!strategyJsonToUse) {
    logger.error(
      `[TranslationService] No valid strategy found for direct NL to Rules. Base ID: "${effectiveBaseId}".`
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
    `[TranslationService] Enter translateNLToRulesDirect (OpID: ${operationId}). Strategy ID: "${currentStrategyId}". NL Text: "${naturalLanguageText}"`
  );

  try {
    logger.info(
      `[TranslationService] Using strategy "${strategyJsonToUse.name}" (ID: ${currentStrategyId}) for direct NL to Rules. OpID: ${operationId}`
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
      reasonerService, // reasonerService might not be a part of all assert strategies but executor expects it
      initialContext
    );
    const prologRules = executionResult; // Assuming direct strategies return the array of strings
    // TODO: Handle executionResult.totalCost; if execute returns an object with cost

    if (
      !Array.isArray(prologRules) ||
      !prologRules.every((r) => typeof r === 'string')
    ) {
      logger.error(
        `[TranslationService] Strategy "${currentStrategyId}" execution for direct translation did not return an array of strings. OpID: ${operationId}. Output: ${JSON.stringify(prologRules)}`
      );
      throw new MCRError(
        ErrorCodes.STRATEGY_INVALID_OUTPUT,
        'Strategy execution for direct translation returned an unexpected output format. Expected array of Prolog strings.'
      );
    }
    logger.debug(
      `[TranslationService] Strategy "${currentStrategyId}" execution returned (OpID: ${operationId}):`,
      { prologRules }
    );

    if (!prologRules || prologRules.length === 0) {
      logger.warn(
        `[TranslationService] Strategy "${currentStrategyId}" extracted no rules from text (OpID: ${operationId}): "${naturalLanguageText}"`
      );
      return {
        success: false,
        message: 'Could not translate text into valid rules.',
        error: ErrorCodes.NO_RULES_EXTRACTED,
        strategyId: currentStrategyId,
      };
    }
    logger.info(
      `[TranslationService] Successfully translated NL to Rules (Direct). OpID: ${operationId}. Rules count: ${prologRules.length}. Strategy ID: ${currentStrategyId}`
    );
    return { success: true, rules: prologRules, strategyId: currentStrategyId };
  } catch (error) {
    logger.error(
      `[TranslationService] Error translating NL to Rules (Direct) using strategy "${currentStrategyId}" (OpID: ${operationId}): ${error.message}`,
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
    `[TranslationService] Enter translateRulesToNLDirect (OpID: ${operationId}). Style: ${style}. Rules length: ${prologRules?.length}`
  );
  logger.debug(
    `[TranslationService] Rules for direct translation to NL (OpID: ${operationId}):\n${prologRules}`
  );

  if (
    !prologRules ||
    typeof prologRules !== 'string' ||
    prologRules.trim() === ''
  ) {
    logger.warn(
      `[TranslationService] translateRulesToNLDirect called with empty or invalid prologRules. OpID: ${operationId}`
    );
    return {
      success: false,
      message: 'Input Prolog rules must be a non-empty string.',
      error: ErrorCodes.EMPTY_RULES_INPUT,
    };
  }

  const directRulesToNlPrompt = getPromptTemplateByName('RULES_TO_NL_DIRECT');
  if (!directRulesToNlPrompt) {
    logger.error('[TranslationService] RULES_TO_NL_DIRECT prompt template not found.');
    return {
      success: false,
      message: 'Internal error: RULES_TO_NL_DIRECT prompt template not found.',
      error: ErrorCodes.PROMPT_TEMPLATE_NOT_FOUND,
    };
  }

  try {
    const promptContext = { prologRules, style };
    logger.info(
      `[TranslationService] Generating NL explanation from rules using LLM. OpID: ${operationId}`
    );
    logger.debug(
      `[TranslationService] Context for RULES_TO_NL_DIRECT prompt (OpID: ${operationId}):`,
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
      `[TranslationService] Prolog rules translated to NL (Direct) (OpID: ${operationId}):\n${nlExplanationText}`
    );

    if (
      nlExplanationText === null ||
      (typeof nlExplanationText === 'string' && nlExplanationText.trim() === '')
    ) {
      logger.warn(
        `[TranslationService] Empty explanation generated for rules to NL (Direct). OpID: ${operationId}`
      );
      return {
        success: false,
        message: 'Failed to generate a natural language explanation.',
        error: ErrorCodes.EMPTY_EXPLANATION_GENERATED,
      };
    }
    logger.info(
      `[TranslationService] Successfully translated Rules to NL (Direct). OpID: ${operationId}. Explanation length: ${nlExplanationText.length}.`
    );
    return { success: true, explanation: nlExplanationText };
  } catch (error) {
    logger.error(
      `[TranslationService] Error translating Rules to NL (Direct) (OpID: ${operationId}): ${error.message}`,
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
async function explainQuery(sessionId, naturalLanguageQuestion, getOperationalStrategyJson, getSession, getKnowledgeBase, getLexiconSummary) {
  // Use getOperationalStrategyJson from mcrService
  const activeStrategyJson = await getOperationalStrategyJson(
    'Query',
    naturalLanguageQuestion
  );
  const currentStrategyId = activeStrategyJson.id;
  const operationId = `explain-${Date.now()}`;

  logger.info(
    `[TranslationService] Enter explainQuery for session ${sessionId} (OpID: ${operationId}). Strategy: "${activeStrategyJson.name}" (ID: ${currentStrategyId}). NL Question: "${naturalLanguageQuestion}"`
  );

  // Use sessionStore and await the async call
  const sessionExists = await getSession(sessionId);
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
      '[TranslationService] EXPLAIN_PROLOG_QUERY prompt template not found.'
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
      (await getKnowledgeBase(sessionId)) || '';
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
        `[TranslationService] Error fetching global ontologies for NL_TO_QUERY context in explain (OpID: ${operationId}): ${ontError.message}`
      );
      debugInfo.ontologyErrorForStrategy = `Failed to load global ontologies for query translation context: ${ontError.message}`;
    }

    const lexiconSummary = await getLexiconSummary(sessionId);
    const initialStrategyContext = {
      naturalLanguageQuestion,
      existingFacts,
      ontologyRules: contextOntologyRulesForQueryTranslation,
      lexiconSummary,
      llm_model_id: config.llm[config.llm.provider]?.model || 'default',
    };

    logger.info(
      `[TranslationService] Executing strategy "${activeStrategyJson.name}" (ID: ${currentStrategyId}) for query translation in explain. OpID: ${operationId}.`
    );
    const executor = new StrategyExecutor(activeStrategyJson);
    const strategyExecutionResult = await executor.execute(
      llmService,
      reasonerService, // reasonerService might not be a part of all query strategies but executor expects it
      initialStrategyContext
    );
    const prologQuery = strategyExecutionResult;

    if (typeof prologQuery !== 'string' || !prologQuery.endsWith('.')) {
      logger.error(
        `[TranslationService] Strategy "${currentStrategyId}" execution for explain query did not return a valid Prolog query string. OpID: ${operationId}. Output: ${prologQuery}`
      );
      throw new MCRError(
        ErrorCodes.STRATEGY_INVALID_OUTPUT,
        'Strategy execution for explain query returned an unexpected output format. Expected Prolog query string ending with a period.'
      );
    }
    logger.info(
      `[TranslationService] Strategy "${currentStrategyId}" translated NL to Prolog query for explanation (OpID: ${operationId}): ${prologQuery}`
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
        `[TranslationService] Error fetching global ontologies for EXPLAIN_PROLOG_QUERY prompt context (OpID: ${operationId}): ${ontErrorForExplain.message}`
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
      `[TranslationService] Error explaining query for session ${sessionId} (OpID: ${operationId}, Strategy ID: ${currentStrategyId}): ${error.message}`,
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

module.exports = {
  translateNLToRulesDirect,
  translateRulesToNLDirect,
  explainQuery,
};
