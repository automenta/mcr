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
  if (strategies[strategyName]) {
    activeStrategy = strategies[strategyName];
    activeStrategyName = strategyName;
    logger.info(
      `[McrService] Translation strategy changed to: ${activeStrategy.getName()}`
    );
    return true;
  }
  logger.warn(
    `[McrService] Attempted to set unknown translation strategy: ${strategyName}`
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
    `[McrService] Asserting NL to session ${sessionId} using strategy "${activeStrategy.getName()}": "${naturalLanguageText}"`
  );

  if (!sessionManager.getSession(sessionId)) {
    logger.warn(`[McrService] Session ${sessionId} not found for assertion.`);
    return {
      success: false,
      message: 'Session not found.',
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

    // Delegate translation to the active strategy
    const addedFacts = await activeStrategy.assert(
      naturalLanguageText,
      llmService,
      {
        existingFacts,
        ontologyRules,
      }
    );

    if (!addedFacts || addedFacts.length === 0) {
      // This case should ideally be handled by the strategy's assert method throwing an error
      logger.warn(
        `[McrService] Strategy "${activeStrategy.getName()}" returned no facts for text: "${naturalLanguageText}"`
      );
      return {
        success: false,
        message:
          'Could not translate text into valid facts using the current strategy.',
        error: 'no_facts_extracted_by_strategy',
        strategy: activeStrategy.getName(),
      };
    }

    // Add facts to session
    const success = sessionManager.addFacts(sessionId, addedFacts);
    if (success) {
      logger.info(
        `[McrService] Facts successfully added to session ${sessionId} using strategy "${activeStrategy.getName()}".`
      );
      return {
        success: true,
        message: 'Facts asserted successfully.',
        addedFacts,
        strategy: activeStrategy.getName(),
      };
    } else {
      logger.error(`[McrService] Failed to add facts to session ${sessionId}.`);
      return {
        success: false,
        message: 'Failed to add facts to session.',
        error: 'session_add_failed',
        strategy: activeStrategy.getName(),
      };
    }
  } catch (error) {
    logger.error(
      `[McrService] Error asserting NL to session ${sessionId} using strategy "${activeStrategy.getName()}": ${error.message}`,
      { error: error.stack } // Log stack for better debugging
    );
    return {
      success: false,
      message: `Error during assertion: ${error.message}`,
      error: error.message,
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
    `[McrService] Querying session ${sessionId} with NL using strategy "${activeStrategy.getName()}": "${naturalLanguageQuestion}"`,
    { dynamicOntologyProvided: !!dynamicOntology, style }
  );

  if (!sessionManager.getSession(sessionId)) {
    logger.warn(`[McrService] Session ${sessionId} not found for query.`);
    return {
      success: false,
      message: 'Session not found.',
      strategy: activeStrategy.getName(),
    };
  }

  const debugInfo = { strategy: activeStrategy.getName() };

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
        `[McrService] Error fetching global ontologies for query context in session ${sessionId}: ${ontError.message}`
      );
      // Non-fatal, proceed without ontology context for strategy
    }

    // Delegate NL to Prolog query translation to the active strategy
    const prologQuery = await activeStrategy.query(
      naturalLanguageQuestion,
      llmService,
      {
        existingFacts,
        ontologyRules,
      }
    );
    logger.debug(
      `[McrService] Strategy "${activeStrategy.getName()}" translated NL question to Prolog query: ${prologQuery}`
    );
    debugInfo.prologQuery = prologQuery;

    // The strategy's query method should throw an error if it fails or produces an invalid query.
    // No need to re-validate prologQuery string here as strategy is responsible.

    // Get knowledge base for the session (session facts)
    let knowledgeBase = sessionManager.getKnowledgeBase(sessionId);
    if (knowledgeBase === null) {
      // Should be caught by getSession earlier
      return {
        success: false,
        message: 'Session not found or empty when building knowledge base.',
        debugInfo,
        error: 'session_kb_not_found',
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

    debugInfo.knowledgeBaseSnapshot = knowledgeBase; // For debugging, might be large

    // 3. Execute Prolog query
    const prologResults = await reasonerService.executeQuery(
      knowledgeBase,
      prologQuery
    );
    logger.debug(`[McrService] Prolog query execution results:`, prologResults);
    debugInfo.prologResults = prologResults;
    debugInfo.prologResultsJSON = JSON.stringify(prologResults);

    // 4. Translate Prolog results to NL answer
    const logicToNlPromptUser = fillTemplate(prompts.LOGIC_TO_NL_ANSWER.user, {
      naturalLanguageQuestion,
      prologResultsJSON: debugInfo.prologResultsJSON,
      style: style, // Use the extracted style, defaulting to 'conversational' if not provided
    });
    const naturalLanguageAnswer = await llmService.generate(
      prompts.LOGIC_TO_NL_ANSWER.system,
      logicToNlPromptUser
    );
    logger.info(`[McrService] NL answer generated: "${naturalLanguageAnswer}"`);
    debugInfo.naturalLanguageAnswer = naturalLanguageAnswer;

    return { success: true, answer: naturalLanguageAnswer, debugInfo };
  } catch (error) {
    logger.error(
      `[McrService] Error querying session ${sessionId} with NL: ${error.message}`,
      { error } // Log full error for strategy related issues
    );
    debugInfo.error = error.message;
    return {
      success: false,
      message: `Error during query: ${error.message}`,
      debugInfo,
      error: error.message,
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
  logger.info(
    `[McrService] Translating NL to Rules (Direct) using strategy "${strategyName}": "${naturalLanguageText}"`
  );

  const strategyToUse = strategies[strategyName] || activeStrategy;
  if (!strategyToUse) {
    logger.error(
      `[McrService] No valid strategy found for translateNLToRulesDirect (requested: ${strategyName}, active: ${activeStrategyName})`
    );
    return {
      success: false,
      message: 'No valid translation strategy available.',
      error: 'strategy_not_found',
    };
  }

  try {
    // The `assert` method of a strategy is designed to return Prolog facts/rules.
    // We don't have session context here (existingFacts, ontologyRules) for this direct translation.
    // Strategies should be able to handle missing options if they are designed to.
    const prologRules = await strategyToUse.assert(
      naturalLanguageText,
      llmService,
      {}
    );

    if (!prologRules || prologRules.length === 0) {
      logger.warn(
        `[McrService] Strategy "${strategyToUse.getName()}" extracted no rules from text: "${naturalLanguageText}"`
      );
      return {
        success: false,
        message: 'Could not translate text into valid rules.',
        error: 'no_rules_extracted_by_strategy',
        strategy: strategyToUse.getName(),
      };
    }

    return {
      success: true,
      rules: prologRules,
      strategy: strategyToUse.getName(),
    };
  } catch (error) {
    logger.error(
      `[McrService] Error translating NL to Rules (Direct) using strategy "${strategyToUse.getName()}": ${error.message}`,
      { error: error.stack }
    );
    return {
      success: false,
      message: `Error during NL to Rules translation: ${error.message}`,
      error: error.message,
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
  logger.info(`[McrService] Translating Rules to NL (Direct). Style: ${style}`);
  logger.debug(
    `[McrService] Rules for direct translation to NL:\n${prologRules}`
  );

  if (
    !prologRules ||
    typeof prologRules !== 'string' ||
    prologRules.trim() === ''
  ) {
    return {
      success: false,
      message: 'Input Prolog rules must be a non-empty string.',
      error: 'empty_rules_input',
    };
  }

  try {
    const rulesToNLPromptUser = fillTemplate(prompts.RULES_TO_NL_DIRECT.user, {
      prologRules,
      style,
    });
    const naturalLanguageExplanation = await llmService.generate(
      prompts.RULES_TO_NL_DIRECT.system,
      rulesToNLPromptUser
    );
    logger.debug(
      `[McrService] Prolog rules translated to NL (Direct):\n${naturalLanguageExplanation}`
    );

    if (
      !naturalLanguageExplanation ||
      naturalLanguageExplanation.trim() === ''
    ) {
      logger.warn(
        `[McrService] Empty explanation generated for rules to NL (Direct).`
      );
      return {
        success: false,
        message: 'Failed to generate a natural language explanation.',
        error: 'empty_explanation_generated',
      };
    }

    return { success: true, explanation: naturalLanguageExplanation };
  } catch (error) {
    logger.error(
      `[McrService] Error translating Rules to NL (Direct): ${error.message}`,
      { error: error.stack }
    );
    return {
      success: false,
      message: `Error during Rules to NL translation: ${error.message}`,
      error: error.message,
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
  logger.info(
    `[McrService] Explaining query for session ${sessionId} using strategy "${activeStrategy.getName()}": "${naturalLanguageQuestion}"`
  );

  const sessionExists = sessionManager.getSession(sessionId);
  if (!sessionExists) {
    logger.warn(
      `[McrService] Session ${sessionId} not found for explain query.`
    );
    return {
      success: false,
      message: 'Session not found.',
      error: 'session_not_found',
      strategy: activeStrategy.getName(),
    };
  }

  const debugInfo = {
    naturalLanguageQuestion,
    strategy: activeStrategy.getName(),
  };

  try {
    const existingFacts = sessionManager.getKnowledgeBase(sessionId) || '';
    let globalOntologyRules = ''; // For the main EXPLAIN_PROLOG_QUERY prompt
    let contextOntologyRulesForQueryTranslation = ''; // For the strategy.query context

    try {
      const globalOntologies = await ontologyService.listOntologies(true);
      if (globalOntologies && globalOntologies.length > 0) {
        const rulesText = globalOntologies.map((ont) => ont.rules).join('\n');
        globalOntologyRules = rulesText;
        contextOntologyRulesForQueryTranslation = rulesText;
        logger.debug(
          `[McrService] Fetched ${globalOntologies.length} global ontologies for explanation context.`
        );
      }
    } catch (ontError) {
      logger.warn(
        `[McrService] Error fetching global ontologies for explanation context (session ${sessionId}): ${ontError.message}`
      );
      debugInfo.ontologyError = `Failed to load global ontologies: ${ontError.message}`;
      // Non-fatal, proceed
    }

    // Translate NL question to Prolog query using the active strategy
    const prologQuery = await activeStrategy.query(
      naturalLanguageQuestion,
      llmService,
      {
        existingFacts, // Provide existing facts as context to the strategy
        ontologyRules: contextOntologyRulesForQueryTranslation, // Provide ontology rules as context
      }
    );
    logger.debug(
      `[McrService] Strategy "${activeStrategy.getName()}" translated NL to Prolog query for explanation: ${prologQuery}`
    );
    debugInfo.prologQuery = prologQuery;

    // The strategy's query method should throw an error if it fails.

    // Session facts for the main explanation prompt
    debugInfo.sessionFacts = existingFacts; // Already fetched
    debugInfo.ontologyRules = globalOntologyRules; // Already fetched

    // Generate explanation using LLM with the EXPLAIN_PROLOG_QUERY prompt
    const explainPromptUser = fillTemplate(prompts.EXPLAIN_PROLOG_QUERY.user, {
      naturalLanguageQuestion,
      prologQuery,
      sessionFacts: existingFacts,
      ontologyRules: globalOntologyRules,
    });

    const explanation = await llmService.generate(
      prompts.EXPLAIN_PROLOG_QUERY.system,
      explainPromptUser
    );
    logger.info(`[McrService] Explanation generated for session ${sessionId}`);
    debugInfo.rawExplanation = explanation;

    if (!explanation || explanation.trim() === '') {
      logger.warn(`[McrService] Empty explanation generated for query.`);
      return {
        success: false,
        message: 'Failed to generate an explanation for the query.',
        debugInfo,
        error: 'empty_explanation_generated',
      };
    }

    return { success: true, explanation, debugInfo };
  } catch (error) {
    logger.error(
      `[McrService] Error explaining query for session ${sessionId}: ${error.message}`,
      { error: error.stack }
    );
    debugInfo.error = error.message;
    return {
      success: false,
      message: `Error during query explanation: ${error.message}`,
      debugInfo,
      error: error.message,
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
  logger.info(`[McrService] Retrieving all prompt templates.`);
  try {
    // The 'prompts' object is directly imported from './prompts.js'
    // No complex logic needed, just return it.
    return { success: true, prompts: prompts }; // prompts is the imported object
  } catch (error) {
    // This catch is unlikely to be hit if 'prompts' is a static import.
    logger.error(`[McrService] Error retrieving prompts: ${error.message}`, {
      error,
    });
    return {
      success: false,
      message: `Error retrieving prompts: ${error.message}`,
      error: error.message,
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
  logger.info(`[McrService] Formatting prompt template: ${templateName}`, {
    inputVariables,
  });

  if (!templateName || typeof templateName !== 'string') {
    return {
      success: false,
      message: 'Template name must be a non-empty string.',
      error: 'invalid_template_name',
    };
  }
  if (!inputVariables || typeof inputVariables !== 'object') {
    return {
      success: false,
      message: 'Input variables must be an object.',
      error: 'invalid_input_variables',
    };
  }

  const template = prompts[templateName];
  if (!template) {
    return {
      success: false,
      message: `Prompt template "${templateName}" not found.`,
      error: 'template_not_found',
    };
  }
  if (!template.user) {
    // Assuming all usable templates have a 'user' part
    return {
      success: false,
      message: `Prompt template "${templateName}" does not have a 'user' field to format.`,
      error: 'template_user_field_missing',
    };
  }

  try {
    const formattedPrompt = fillTemplate(template.user, inputVariables);
    return {
      success: true,
      templateName,
      rawTemplate: template,
      formattedUserPrompt: formattedPrompt,
      inputVariables,
    };
  } catch (error) {
    logger.error(
      `[McrService] Error formatting prompt ${templateName}: ${error.message}`,
      { error: error.stack }
    );
    return {
      success: false,
      message: `Error formatting prompt: ${error.message}`,
      error: error.message,
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
  translateNLToRulesDirect,
  translateRulesToNLDirect,
  explainQuery,
  getPrompts,
  debugFormatPrompt,
  // assertNLToSessionWithSIR is removed, its functionality is via assertNLToSession with SIR-R1 strategy
};
