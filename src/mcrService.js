// new/src/mcrService.js
const llmService = require('./llmService');
const reasonerService = require('./reasonerService');
const sessionManager = require('./sessionManager');
const ontologyService = require('./ontologyService'); // Added ontologyService
const { prompts, fillTemplate } = require('./prompts');
const logger = require('./logger');

/**
 * Asserts natural language text as facts/rules into a session.
 * @param {string} sessionId - The ID of the session.
 * @param {string} naturalLanguageText - The natural language text to assert.
 * @returns {Promise<{success: boolean, message: string, addedFacts?: string[], error?: string}>}
 */
async function assertNLToSession(sessionId, naturalLanguageText) {
  logger.info(`[McrService] Asserting NL to session ${sessionId}: "${naturalLanguageText}"`);

  if (!sessionManager.getSession(sessionId)) {
    logger.warn(`[McrService] Session ${sessionId} not found for assertion.`);
    return { success: false, message: 'Session not found.' };
  }

  try {
    // 1. Gather context for the prompt
    const existingFacts = sessionManager.getKnowledgeBase(sessionId) || '';
    let ontologyRules = '';
    try {
      const globalOntologies = await ontologyService.listOntologies(true);
      if (globalOntologies && globalOntologies.length > 0) {
        ontologyRules = globalOntologies.map(ont => ont.rules).join('\n');
      }
    } catch (ontError) {
      logger.warn(`[McrService] Error fetching global ontologies for NL_TO_LOGIC context in session ${sessionId}: ${ontError.message}`);
      // Non-fatal for translation, proceed without ontology context
    }

    // 2. Translate NL to Logic with context
    const nlToLogicPromptUser = fillTemplate(prompts.NL_TO_LOGIC.user, {
      naturalLanguageText,
      existingFacts,
      ontologyRules,
    });
    const prologFactsString = await llmService.generate(
      prompts.NL_TO_LOGIC.system,
      nlToLogicPromptUser
    );
    logger.debug(`[McrService] NL translated to Prolog: \n${prologFactsString}`);

    if (prologFactsString.includes('% Cannot convert query to fact.')) {
        logger.warn(`[McrService] LLM indicated text is a query, not assertable fact: "${naturalLanguageText}"`);
        return { success: false, message: 'Input text appears to be a query, not an assertable fact.', error: 'conversion_to_fact_failed' };
    }

    const addedFacts = prologFactsString.split('\n').map(f => f.trim()).filter(f => f.length > 0 && f.endsWith('.'));
    if (addedFacts.length === 0) {
        logger.warn(`[McrService] No valid Prolog facts extracted from LLM output for text: "${naturalLanguageText}"`);
        return { success: false, message: 'Could not translate text into valid facts.', error: 'no_facts_extracted' };
    }

    // 2. Add facts to session
    const success = sessionManager.addFacts(sessionId, addedFacts);
    if (success) {
      logger.info(`[McrService] Facts successfully added to session ${sessionId}.`);
      return { success: true, message: 'Facts asserted successfully.', addedFacts };
    } else {
      logger.error(`[McrService] Failed to add facts to session ${sessionId}.`);
      return { success: false, message: 'Failed to add facts to session.', error: 'session_add_failed' };
    }
  } catch (error) {
    logger.error(`[McrService] Error asserting NL to session ${sessionId}: ${error.message}`, { error });
    return { success: false, message: `Error during assertion: ${error.message}`, error: error.message };
  }
}

/**
 * Queries a session using a natural language question.
 * @param {string} sessionId - The ID of the session.
 * @param {string} naturalLanguageQuestion - The natural language question.
 * @param {object} [options] - Optional parameters.
 * @param {string} [options.dynamicOntology] - Optional string containing dynamic Prolog rules for this query.
 * @returns {Promise<{success: boolean, answer?: string, debugInfo?: object, error?: string}>}
 */
async function querySessionWithNL(sessionId, naturalLanguageQuestion, options = {}) {
  const { dynamicOntology } = options;
  logger.info(`[McrService] Querying session ${sessionId} with NL: "${naturalLanguageQuestion}"`, { dynamicOntologyProvided: !!dynamicOntology });

  if (!sessionManager.getSession(sessionId)) {
    logger.warn(`[McrService] Session ${sessionId} not found for query.`);
    return { success: false, message: 'Session not found.' };
  }

  const debugInfo = {};

  try {
    // 1. Gather context for NL_TO_QUERY prompt
    const existingFactsForQueryPrompt = sessionManager.getKnowledgeBase(sessionId) || '';
    let ontologyRulesForQueryPrompt = '';
    try {
      const globalOntologies = await ontologyService.listOntologies(true);
      if (globalOntologies && globalOntologies.length > 0) {
        ontologyRulesForQueryPrompt = globalOntologies.map(ont => ont.rules).join('\n');
      }
    } catch (ontError) {
      logger.warn(`[McrService] Error fetching global ontologies for NL_TO_QUERY context in session ${sessionId}: ${ontError.message}`);
      // Non-fatal, proceed without ontology context for the prompt
    }

    // Translate NL question to Prolog query with context
    const nlToQueryPromptUser = fillTemplate(prompts.NL_TO_QUERY.user, {
      naturalLanguageQuestion,
      existingFacts: existingFactsForQueryPrompt,
      ontologyRules: ontologyRulesForQueryPrompt,
    });
    const prologQuery = await llmService.generate(
      prompts.NL_TO_QUERY.system,
      nlToQueryPromptUser
    );
    logger.debug(`[McrService] NL question translated to Prolog query: ${prologQuery}`);
    debugInfo.prologQuery = prologQuery;

    if (!prologQuery || !prologQuery.trim().endsWith('.')) {
        logger.error(`[McrService] LLM generated invalid Prolog query: "${prologQuery}"`);
        return { success: false, message: 'Failed to translate question to a valid query.', debugInfo, error: 'invalid_prolog_query' };
    }

    // 2. Get knowledge base for the session (session facts)
    let knowledgeBase = sessionManager.getKnowledgeBase(sessionId);
    if (knowledgeBase === null) { // Should be caught by getSession earlier
        return { success: false, message: 'Session not found or empty when building knowledge base.', debugInfo, error: 'session_kb_not_found' };
    }

    // Augment with global ontologies
    try {
      const globalOntologies = await ontologyService.listOntologies(true); // includeRules = true
      if (globalOntologies && globalOntologies.length > 0) {
        const ontologyRules = globalOntologies.map(ont => ont.rules).join('\n');
        knowledgeBase += `\n% --- Global Ontologies ---\n${ontologyRules}`;
        logger.debug(`[McrService] Augmented knowledge base with ${globalOntologies.length} global ontologies.`);
      }
    } catch (ontError) {
      logger.error(`[McrService] Error fetching global ontologies for session ${sessionId}: ${ontError.message}`, { error: ontError });
      // Decide if this is a fatal error for the query or just a warning
      // For now, proceed with session KB only if global ontologies fail
      debugInfo.ontologyError = `Failed to load global ontologies: ${ontError.message}`;
    }

    // Augment with dynamic ontology if provided for this specific query
    if (dynamicOntology && typeof dynamicOntology === 'string' && dynamicOntology.trim() !== '') {
      knowledgeBase += `\n% --- Dynamic RAG Ontology (Query-Specific) ---\n${dynamicOntology.trim()}`;
      logger.debug(`[McrService] Augmented knowledge base with dynamic (RAG) ontology for session ${sessionId}.`);
      debugInfo.dynamicOntologyProvided = true;
    }

    debugInfo.knowledgeBaseSnapshot = knowledgeBase; // For debugging, might be large

    // 3. Execute Prolog query
    const prologResults = await reasonerService.executeQuery(knowledgeBase, prologQuery);
    logger.debug(`[McrService] Prolog query execution results:`, prologResults);
    debugInfo.prologResults = prologResults;
    debugInfo.prologResultsJSON = JSON.stringify(prologResults);


    // 4. Translate Prolog results to NL answer
    const logicToNlPromptUser = fillTemplate(prompts.LOGIC_TO_NL_ANSWER.user, {
      naturalLanguageQuestion,
      prologResultsJSON: debugInfo.prologResultsJSON,
    });
    const naturalLanguageAnswer = await llmService.generate(
      prompts.LOGIC_TO_NL_ANSWER.system,
      logicToNlPromptUser
    );
    logger.info(`[McrService] NL answer generated: "${naturalLanguageAnswer}"`);
    debugInfo.naturalLanguageAnswer = naturalLanguageAnswer;

    return { success: true, answer: naturalLanguageAnswer, debugInfo };

  } catch (error) {
    logger.error(`[McrService] Error querying session ${sessionId} with NL: ${error.message}`, { error });
    debugInfo.error = error.message;
    return { success: false, message: `Error during query: ${error.message}`, debugInfo, error: error.message };
  }
}

module.exports = {
  assertNLToSession,
  querySessionWithNL,
  // Expose session management directly if needed by API handlers for create/delete
  createSession: sessionManager.createSession,
  getSession: sessionManager.getSession,
  deleteSession: sessionManager.deleteSession,
  translateNLToRulesDirect,
  translateRulesToNLDirect,
  explainQuery,
  getPrompts,
  debugFormatPrompt,
};

/**
 * Translates natural language text directly to Prolog facts/rules.
 * @param {string} naturalLanguageText - The natural language text.
 * @returns {Promise<{success: boolean, rules?: string[], error?: string}>}
 */
async function translateNLToRulesDirect(naturalLanguageText) {
  logger.info(`[McrService] Translating NL to Rules (Direct): "${naturalLanguageText}"`);
  try {
    const nlToRulesPromptUser = fillTemplate(prompts.NL_TO_RULES_DIRECT.user, { naturalLanguageText });
    const prologRulesString = await llmService.generate(
      prompts.NL_TO_RULES_DIRECT.system,
      nlToRulesPromptUser
    );
    logger.debug(`[McrService] NL translated to Prolog (Direct):\n${prologRulesString}`);

    // Similar to assert, check for conversion issues if the prompt supports it (NL_TO_LOGIC does)
    if (prompts.NL_TO_RULES_DIRECT.system === prompts.NL_TO_LOGIC.system && prologRulesString.includes('% Cannot convert query to fact.')) {
        logger.warn(`[McrService] LLM indicated text might be a query for direct translation: "${naturalLanguageText}"`);
        // For direct translation, this might be acceptable or still an issue depending on desired strictness
        // Let's treat it as a partial success but with a note. Or could be an error.
        // For now, we'll return the raw output.
    }

    const rules = prologRulesString.split('\n').map(r => r.trim()).filter(r => r.length > 0 && r.endsWith('.'));
    if (rules.length === 0 && !prologRulesString.includes('% Cannot convert query to fact.')) { // Avoid error if it's the specific "cannot convert" message
        logger.warn(`[McrService] No valid Prolog rules extracted from LLM output (Direct) for text: "${naturalLanguageText}"`);
        return { success: false, message: 'Could not translate text into valid rules.', error: 'no_rules_extracted' };
    }

    return { success: true, rules: rules, rawOutput: prologRulesString };
  } catch (error) {
    logger.error(`[McrService] Error translating NL to Rules (Direct): ${error.message}`, { error });
    return { success: false, message: `Error during NL to Rules translation: ${error.message}`, error: error.message };
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
  logger.debug(`[McrService] Rules for direct translation to NL:\n${prologRules}`);

  if (!prologRules || typeof prologRules !== 'string' || prologRules.trim() === '') {
    return { success: false, message: 'Input Prolog rules must be a non-empty string.', error: 'empty_rules_input' };
  }

  try {
    const rulesToNLPromptUser = fillTemplate(prompts.RULES_TO_NL_DIRECT.user, { prologRules, style });
    const naturalLanguageExplanation = await llmService.generate(
      prompts.RULES_TO_NL_DIRECT.system,
      rulesToNLPromptUser
    );
    logger.debug(`[McrService] Prolog rules translated to NL (Direct):\n${naturalLanguageExplanation}`);

    if (!naturalLanguageExplanation || naturalLanguageExplanation.trim() === '') {
        logger.warn(`[McrService] Empty explanation generated for rules to NL (Direct).`);
        return { success: false, message: 'Failed to generate a natural language explanation.', error: 'empty_explanation_generated' };
    }

    return { success: true, explanation: naturalLanguageExplanation };
  } catch (error) {
    logger.error(`[McrService] Error translating Rules to NL (Direct): ${error.message}`, { error });
    return { success: false, message: `Error during Rules to NL translation: ${error.message}`, error: error.message };
  }
}

/**
 * Generates a natural language explanation of how a query would be resolved.
 * @param {string} sessionId - The ID of the session.
 * @param {string} naturalLanguageQuestion - The natural language question.
 * @returns {Promise<{success: boolean, explanation?: string, debugInfo?: object, error?: string}>}
 */
async function explainQuery(sessionId, naturalLanguageQuestion) {
  logger.info(`[McrService] Explaining query for session ${sessionId}: "${naturalLanguageQuestion}"`);

  const sessionExists = sessionManager.getSession(sessionId);
  if (!sessionExists) {
    logger.warn(`[McrService] Session ${sessionId} not found for explain query.`);
    return { success: false, message: 'Session not found.', error: 'session_not_found' };
  }

  const debugInfo = { naturalLanguageQuestion };

  try {
    // 1. Gather context for NL_TO_QUERY prompt (for translating the question first)
    const existingFactsForExplainPrompt = sessionManager.getKnowledgeBase(sessionId) || '';
    let ontologyRulesForExplainPrompt = ''; // This context is for the NL_TO_QUERY part
    let globalOntologyRulesForExplainMain = ''; // This context is for the EXPLAIN_PROLOG_QUERY prompt

    try {
      const globalOntologies = await ontologyService.listOntologies(true);
      if (globalOntologies && globalOntologies.length > 0) {
        const rulesText = globalOntologies.map(ont => ont.rules).join('\n');
        ontologyRulesForExplainPrompt = rulesText;
        globalOntologyRulesForExplainMain = rulesText; // Also used later for the main explanation prompt
        logger.debug(`[McrService] Fetched ${globalOntologies.length} global ontologies for explanation context.`);
      }
    } catch (ontError) {
      logger.warn(`[McrService] Error fetching global ontologies for explanation context (session ${sessionId}): ${ontError.message}`);
      debugInfo.ontologyError = `Failed to load global ontologies: ${ontError.message}`;
      // Non-fatal, proceed with available context
    }

    // Translate NL question to Prolog query, now with context
    const nlToQueryPromptUser = fillTemplate(prompts.NL_TO_QUERY.user, {
        naturalLanguageQuestion,
        existingFacts: existingFactsForExplainPrompt,
        ontologyRules: ontologyRulesForExplainPrompt,
    });
    const prologQuery = await llmService.generate(
      prompts.NL_TO_QUERY.system,
      nlToQueryPromptUser
    );
    logger.debug(`[McrService] NL question translated to Prolog query for explanation: ${prologQuery}`);
    debugInfo.prologQuery = prologQuery;

    if (!prologQuery || !prologQuery.trim().endsWith('.')) {
      logger.error(`[McrService] LLM generated invalid Prolog query for explanation: "${prologQuery}"`);
      return { success: false, message: 'Failed to translate question to a valid query for explanation.', debugInfo, error: 'invalid_prolog_query_explain' };
    }

    // 2. Get session facts
    const sessionFacts = sessionManager.getKnowledgeBase(sessionId) || ''; // Default to empty string if null
    debugInfo.sessionFacts = sessionFacts;

    // 3. Get global ontology rules
    let globalOntologyRules = '';
    try {
      const globalOntologies = await ontologyService.listOntologies(true); // includeRules = true
      if (globalOntologies && globalOntologies.length > 0) {
        globalOntologyRules = globalOntologies.map(ont => ont.rules).join('\n');
        logger.debug(`[McrService] Fetched ${globalOntologies.length} global ontologies for explanation.`);
      }
    } catch (ontError) {
      logger.warn(`[McrService] Error fetching global ontologies for explanation (session ${sessionId}): ${ontError.message}`);
      debugInfo.ontologyError = `Failed to load global ontologies: ${ontError.message}`;
      // Non-fatal, proceed with available context
    }
    debugInfo.ontologyRules = globalOntologyRules;

    // 4. Generate explanation using LLM
    const explainPromptUser = fillTemplate(prompts.EXPLAIN_PROLOG_QUERY.user, {
      naturalLanguageQuestion,
      prologQuery,
      sessionFacts: existingFactsForExplainPrompt, // Use the facts fetched earlier
      ontologyRules: globalOntologyRulesForExplainMain, // Use the ontology rules fetched earlier
    });

    const explanation = await llmService.generate(
      prompts.EXPLAIN_PROLOG_QUERY.system,
      explainPromptUser
    );
    logger.info(`[McrService] Explanation generated for session ${sessionId}`);
    debugInfo.rawExplanation = explanation;

    if (!explanation || explanation.trim() === '') {
        logger.warn(`[McrService] Empty explanation generated for query.`);
        return { success: false, message: 'Failed to generate an explanation for the query.', debugInfo, error: 'empty_explanation_generated' };
    }

    return { success: true, explanation, debugInfo };

  } catch (error) {
    logger.error(`[McrService] Error explaining query for session ${sessionId}: ${error.message}`, { error });
    debugInfo.error = error.message;
    return { success: false, message: `Error during query explanation: ${error.message}`, debugInfo, error: error.message };
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
    logger.error(`[McrService] Error retrieving prompts: ${error.message}`, { error });
    return { success: false, message: `Error retrieving prompts: ${error.message}`, error: error.message };
  }
}

/**
 * Formats a specified prompt template with given input variables.
 * @param {string} templateName - The name of the prompt template (e.g., "NL_TO_QUERY").
 * @param {object} inputVariables - An object containing key-value pairs for the template.
 * @returns {Promise<{success: boolean, templateName?: string, rawTemplate?: object, formattedPrompt?: string, error?: string}>}
 */
async function debugFormatPrompt(templateName, inputVariables) {
  logger.info(`[McrService] Formatting prompt template: ${templateName}`, { inputVariables });

  if (!templateName || typeof templateName !== 'string') {
    return { success: false, message: 'Template name must be a non-empty string.', error: 'invalid_template_name' };
  }
  if (!inputVariables || typeof inputVariables !== 'object') {
    return { success: false, message: 'Input variables must be an object.', error: 'invalid_input_variables' };
  }

  const template = prompts[templateName];
  if (!template) {
    return { success: false, message: `Prompt template "${templateName}" not found.`, error: 'template_not_found' };
  }
  if (!template.user) { // Assuming all usable templates have a 'user' part
    return { success: false, message: `Prompt template "${templateName}" does not have a 'user' field to format.`, error: 'template_user_field_missing' };
  }

  try {
    // For this debug tool, we are interested in the 'user' part of the prompt mostly.
    // The 'system' part is static for a given template.
    const formattedPrompt = fillTemplate(template.user, inputVariables);
    return {
      success: true,
      templateName,
      rawTemplate: template, // Return the whole template object (system + user)
      formattedUserPrompt: formattedPrompt, // Specifically the formatted user part
      inputVariables
    };
  } catch (error) {
    logger.error(`[McrService] Error formatting prompt ${templateName}: ${error.message}`, { error });
    return { success: false, message: `Error formatting prompt: ${error.message}`, error: error.message };
  }
}
