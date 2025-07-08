// src/services/translationService.js
const llmService = require('../llmService');
const reasonerService = require('../reasonerService');
const sessionManager = require('../sessionManager');
const ontologyService = require('../ontologyService');
const { prompts, fillTemplate, getPromptTemplateByName } = require('../prompts');
const logger = require('../logger');
const config = require('../config');
const strategyManager = require('../strategyManager');
const StrategyExecutor = require('../strategyExecutor');
const { MCRError, ErrorCodes } = require('../errors');

// logger.info('[TranslationService] ErrorCodes at module load:', ErrorCodes); // Diagnostic Removed

// Helper function (potentially shared or moved to a common utils if mcrService also needs it)
// For now, keeping it here. If mcrService's getOperationalStrategyJson is refactored to be more accessible,
// this could use that.
async function getStrategyForOperation(operationType, naturalLanguageText, baseStrategyIdFromConfig) {
  // This is a simplified version. Ideally, this logic would be shared or mcrService would expose it.
  // For now, we'll assume direct strategy or assert/query suffixed strategy.
  const operationSuffix = operationType === 'Assert' ? '-Assert' : '-Query';
  const operationalStrategyId = `${baseStrategyIdFromConfig}${operationSuffix}`;
  let strategyJson = strategyManager.getStrategy(operationalStrategyId);

  if (strategyJson) {
    logger.info(
      `[TranslationService] Using configured operational strategy: "${strategyJson.id}" for ${operationType}`
    );
  } else {
    logger.warn(
      `[TranslationService] Operational strategy "${operationalStrategyId}" not found for ${operationType}. Trying base strategy "${baseStrategyIdFromConfig}".`
    );
    strategyJson =
      strategyManager.getStrategy(baseStrategyIdFromConfig) ||
      strategyManager.getDefaultStrategy(); // Fallback to default if base also not found
    logger.info(`[TranslationService] Using fallback strategy: "${strategyJson.id}" for ${operationType}`);
  }
  return strategyJson;
}


async function translateNLToRulesDirect(naturalLanguageText, strategyIdToUse) {
  const effectiveBaseId = strategyIdToUse || config.translationStrategy; // Use config directly
  const strategyJsonToUse = strategyIdToUse
    ? strategyManager.getStrategy(`${effectiveBaseId}-Assert`) || // Prefer assert variant
      strategyManager.getStrategy(effectiveBaseId) ||
      (await getStrategyForOperation('Assert', naturalLanguageText, config.translationStrategy))
    : await getStrategyForOperation('Assert', naturalLanguageText, config.translationStrategy);

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
      error: ErrorCodes.EMPTY_RULES_INPUT, // Using defined ErrorCode
    };
  }

  const directRulesToNlPrompt = getPromptTemplateByName('RULES_TO_NL_DIRECT');
  if (!directRulesToNlPrompt) {
    logger.error("[TranslationService] RULES_TO_NL_DIRECT prompt template not found.");
    return {
        success: false,
        message: "Internal error: RULES_TO_NL_DIRECT prompt template not found.",
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
    // Check if llmExplanationResult exists and has a 'text' property
    if (llmExplanationResult && typeof llmExplanationResult.text === 'string') {
      nlExplanationText = llmExplanationResult.text;
    } else if (llmExplanationResult && llmExplanationResult.text === null) {
      // Handles the case where llmService returns { text: null }
      nlExplanationText = null;
    }
    // If llmExplanationResult is null or doesn't have a string/null 'text' property, nlExplanationText remains null.

    // TODO: Handle llmExplanationResult.costData

    logger.debug(
      `[TranslationService] Prolog rules translated to NL (Direct) (OpID: ${operationId}):\n${nlExplanationText}`
    );

    if (
      nlExplanationText === null || // Check for explicit null or undefined
      (typeof nlExplanationText === 'string' && nlExplanationText.trim() === '')
    ) {
      logger.warn(
        `[TranslationService] Empty explanation generated for rules to NL (Direct). OpID: ${operationId}`
      );
      // logger.warn(
      //   `[TranslationService] Value of ErrorCodes.EMPTY_EXPLANATION_GENERATED: ${ErrorCodes.EMPTY_EXPLANATION_GENERATED}`
      // );
      // console.log('[TranslationService] ErrorCodes inside translateRulesToNLDirect:', ErrorCodes); // Diagnostic Removed
      // console.log(`[TranslationService] Value of ErrorCodes.EMPTY_EXPLANATION_GENERATED inside: ${ErrorCodes.EMPTY_EXPLANATION_GENERATED}`); // Diagnostic Removed
      return {
        success: false,
        message: 'Failed to generate a natural language explanation.',
        error: ErrorCodes.EMPTY_EXPLANATION_GENERATED, // Using defined ErrorCode
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
      error: error.code || 'RULES_TO_NL_TRANSLATION_FAILED', // Keep generic or define new
      details: error.message,
    };
  }
}

async function explainQuery(sessionId, naturalLanguageQuestion) {
  // This function needs getOperationalStrategyJson from mcrService or a similar utility.
  // For now, we'll use the simplified getStrategyForOperation.
  const activeStrategyJson = await getStrategyForOperation('Query', naturalLanguageQuestion, config.translationStrategy);
  const currentStrategyId = activeStrategyJson.id;
  const operationId = `explain-${Date.now()}`;

  logger.info(
    `[TranslationService] Enter explainQuery for session ${sessionId} (OpID: ${operationId}). Strategy: "${activeStrategyJson.name}" (ID: ${currentStrategyId}). NL Question: "${naturalLanguageQuestion}"`
  );

  if (!sessionManager.getSession(sessionId)) {
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

  const explainPrologQueryPrompt = getPromptTemplateByName('EXPLAIN_PROLOG_QUERY');
  if (!explainPrologQueryPrompt) {
     logger.error("[TranslationService] EXPLAIN_PROLOG_QUERY prompt template not found.");
     return {
        success: false,
        message: "Internal error: EXPLAIN_PROLOG_QUERY prompt template not found.",
        error: ErrorCodes.PROMPT_TEMPLATE_NOT_FOUND,
        debugInfo,
     };
  }

  try {
    const existingFacts =
      (await sessionManager.getKnowledgeBase(sessionId)) || '';
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

    const lexiconSummary = await sessionManager.getLexiconSummary(sessionId);
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
      reasonerService, // reasonerService might not be used by all query strategies but executor expects it
      initialStrategyContext
    );
    const prologQuery = strategyExecutionResult; // Assuming query strategies return the prolog query string
    // TODO: Handle strategyExecutionResult.totalCost; if execute returns an object with cost

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
    // TODO: Handle llmExplanationResult.costData

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
