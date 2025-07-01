// new/src/mcrService.js
const llmService = require('./llmService');
const reasonerService = require('./reasonerService');
const sessionManager = require('./sessionManager');
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
    // 1. Translate NL to Logic
    const nlToLogicPromptUser = fillTemplate(prompts.NL_TO_LOGIC.user, { naturalLanguageText });
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
 * @returns {Promise<{success: boolean, answer?: string, debugInfo?: object, error?: string}>}
 */
async function querySessionWithNL(sessionId, naturalLanguageQuestion) {
  logger.info(`[McrService] Querying session ${sessionId} with NL: "${naturalLanguageQuestion}"`);

  if (!sessionManager.getSession(sessionId)) {
    logger.warn(`[McrService] Session ${sessionId} not found for query.`);
    return { success: false, message: 'Session not found.' };
  }

  const debugInfo = {};

  try {
    // 1. Translate NL question to Prolog query
    const nlToQueryPromptUser = fillTemplate(prompts.NL_TO_QUERY.user, { naturalLanguageQuestion });
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

    // 2. Get knowledge base for the session
    const knowledgeBase = sessionManager.getKnowledgeBase(sessionId);
    if (knowledgeBase === null) { // Should be caught by getSession earlier, but good practice
        return { success: false, message: 'Session not found or empty.', debugInfo };
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
};
