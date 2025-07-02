// new/src/apiHandlers.js
const mcrService = require('./mcrService');
const ontologyService = require('./ontologyService'); // Added ontologyService
const { ApiError } = require('./errors');
const logger = require('./logger');

async function createSessionHandler(req, res, next) {
  try {
    const session = mcrService.createSession();
    logger.info(`[API] Session created: ${session.id}`);
    res.status(201).json(session);
  } catch (error) {
    logger.error('[API] Error creating session:', error);
    next(new ApiError(500, 'Failed to create session.'));
  }
}

async function assertToSessionHandler(req, res, next) {
  const { sessionId } = req.params;
  const { text } = req.body;

  if (!text || typeof text !== 'string' || text.trim() === '') {
    return next(new ApiError(400, 'Invalid input: "text" property is required in the request body and must be a non-empty string.'));
  }

  try {
    logger.info(`[API] Asserting to session ${sessionId}: "${text}"`);
    const result = await mcrService.assertNLToSession(sessionId, text);
    if (result.success) {
      res.status(200).json({ message: result.message, addedFacts: result.addedFacts });
    } else {
      // Determine appropriate status code based on error type
      if (result.message === 'Session not found.') {
        next(new ApiError(404, result.message, 'SESSION_NOT_FOUND'));
      } else if (result.error === 'conversion_to_fact_failed' || result.error === 'no_facts_extracted') {
        next(new ApiError(400, result.message, result.error.toUpperCase()));
      }
      else {
        next(new ApiError(500, result.message || 'Failed to assert to session.', result.error || 'ASSERT_FAILED'));
      }
    }
  } catch (error) {
    logger.error(`[API] Error asserting to session ${sessionId}:`, error);
    next(new ApiError(500, `Failed to assert to session: ${error.message}`));
  }
}

async function querySessionHandler(req, res, next) {
  const { sessionId } = req.params;
  const { query, options } = req.body; // Extract options from body

  if (!query || typeof query !== 'string' || query.trim() === '') {
    return next(new ApiError(400, 'Invalid input: "query" property is required in the request body and must be a non-empty string.'));
  }

  // Validate options.dynamicOntology if provided
  const dynamicOntology = options && options.dynamicOntology;
  if (dynamicOntology && typeof dynamicOntology !== 'string') {
    return next(new ApiError(400, 'Invalid input: "options.dynamicOntology" must be a string if provided.'));
  }

  const serviceOptions = {
    dynamicOntology: dynamicOntology, // Pass it to the service
    style: options && options.style ? options.style : 'conversational', // Default if not provided
    debug: options && typeof options.debug === 'boolean' ? options.debug : false // Default if not provided
  };

  try {
    logger.info(`[API] Querying session ${sessionId}: "${query}"`, { options: serviceOptions });
    const result = await mcrService.querySessionWithNL(sessionId, query, serviceOptions);
    if (result.success) {
      // Only include debugInfo in response if it was requested and is present
      const responsePayload = { answer: result.answer };
      if (serviceOptions.debug && result.debugInfo) {
        responsePayload.debugInfo = result.debugInfo;
      }
      res.status(200).json(responsePayload);
    } else {
      if (result.message === 'Session not found.') {
         next(new ApiError(404, result.message, 'SESSION_NOT_FOUND'));
      } else if (result.error === 'invalid_prolog_query') {
         next(new ApiError(400, result.message, result.error.toUpperCase(), result.debugInfo));
      }
      else {
         next(new ApiError(500, result.message || 'Failed to query session.', result.error || 'QUERY_FAILED', result.debugInfo));
      }
    }
  } catch (error) {
    logger.error(`[API] Error querying session ${sessionId}:`, error);
    next(new ApiError(500, `Failed to query session: ${error.message}`));
  }
}

async function getSessionHandler(req, res, next) {
    const { sessionId } = req.params;
    try {
        const session = mcrService.getSession(sessionId);
        if (session) {
            logger.info(`[API] Retrieved session: ${sessionId}`);
            res.status(200).json(session);
        } else {
            logger.warn(`[API] Get session: Session not found: ${sessionId}`);
            next(new ApiError(404, 'Session not found.', 'SESSION_NOT_FOUND'));
        }
    } catch (error) {
        logger.error(`[API] Error retrieving session ${sessionId}:`, error);
        next(new ApiError(500, `Failed to retrieve session: ${error.message}`));
    }
}

async function deleteSessionHandler(req, res, next) {
    const { sessionId } = req.params;
    try {
        const deleted = mcrService.deleteSession(sessionId);
        if (deleted) {
            logger.info(`[API] Session deleted: ${sessionId}`);
            res.status(200).json({ message: `Session ${sessionId} deleted successfully.` });
        } else {
            logger.warn(`[API] Delete session: Session not found: ${sessionId}`);
            next(new ApiError(404, 'Session not found.', 'SESSION_NOT_FOUND'));
        }
    } catch (error) {
        logger.error(`[API] Error deleting session ${sessionId}:`, error);
        next(new ApiError(500, `Failed to delete session: ${error.message}`));
    }
}


module.exports = {
  createSessionHandler,
  assertToSessionHandler,
  querySessionHandler,
  getSessionHandler,
  deleteSessionHandler,
  getStatusHandler, // Add new handler
  createOntologyHandler,
  getOntologyHandler,
  listOntologiesHandler,
  updateOntologyHandler,
  deleteOntologyHandler,
  nlToRulesDirectHandler,
  rulesToNlDirectHandler,
  explainQueryHandler,
  getPromptsHandler,
  debugFormatPromptHandler,
};

// --- Ontology Handlers ---

async function createOntologyHandler(req, res, next) {
  const { name, rules } = req.body;
  if (!name || !rules) {
    return next(new ApiError(400, 'Missing "name" or "rules" in request body.'));
  }
  try {
    const ontology = await ontologyService.createOntology(name, rules);
    logger.info(`[API] Ontology created: ${name}`);
    res.status(201).json(ontology);
  } catch (error) {
    logger.error(`[API] Error creating ontology ${name}:`, error);
    if (error instanceof ApiError) return next(error);
    next(new ApiError(500, `Failed to create ontology '${name}'.`));
  }
}

async function getOntologyHandler(req, res, next) {
  const { name } = req.params;
  try {
    const ontology = await ontologyService.getOntology(name);
    if (ontology) {
      logger.info(`[API] Retrieved ontology: ${name}`);
      res.status(200).json(ontology);
    } else {
      logger.warn(`[API] Get ontology: Ontology not found: ${name}`);
      next(new ApiError(404, `Ontology '${name}' not found.`, 'ONTOLOGY_NOT_FOUND'));
    }
  } catch (error) {
    logger.error(`[API] Error retrieving ontology ${name}:`, error);
    if (error instanceof ApiError) return next(error);
    next(new ApiError(500, `Failed to retrieve ontology '${name}'.`));
  }
}

async function listOntologiesHandler(req, res, next) {
  // Optional query param to include rules content, e.g., /ontologies?includeRules=true
  const includeRules = req.query.includeRules === 'true';
  try {
    const ontologies = await ontologyService.listOntologies(includeRules);
    logger.info(`[API] Listed ontologies. Count: ${ontologies.length}`);
    res.status(200).json(ontologies);
  } catch (error) {
    logger.error('[API] Error listing ontologies:', error);
    if (error instanceof ApiError) return next(error);
    next(new ApiError(500, 'Failed to list ontologies.'));
  }
}

async function updateOntologyHandler(req, res, next) {
  const { name } = req.params;
  const { rules } = req.body;
  if (!rules) {
    return next(new ApiError(400, 'Missing "rules" in request body for update.'));
  }
  try {
    const updatedOntology = await ontologyService.updateOntology(name, rules);
    logger.info(`[API] Ontology updated: ${name}`);
    res.status(200).json(updatedOntology);
  } catch (error) {
    logger.error(`[API] Error updating ontology ${name}:`, error);
    if (error instanceof ApiError) return next(error);
    next(new ApiError(500, `Failed to update ontology '${name}'.`));
  }
}

async function deleteOntologyHandler(req, res, next) {
  const { name } = req.params;
  try {
    await ontologyService.deleteOntology(name);
    logger.info(`[API] Ontology deleted: ${name}`);
    res.status(200).json({ message: `Ontology '${name}' deleted successfully.` });
  } catch (error) {
    logger.error(`[API] Error deleting ontology ${name}:`, error);
    if (error instanceof ApiError) return next(error);
    next(new ApiError(500, `Failed to delete ontology '${name}'.`));
  }
}

// --- Direct Translation Handlers ---

async function nlToRulesDirectHandler(req, res, next) {
  const { text } = req.body;
  if (!text || typeof text !== 'string' || text.trim() === '') {
    return next(new ApiError(400, 'Invalid input: "text" property is required and must be a non-empty string.'));
  }

  try {
    logger.info(`[API] Translating NL to Rules (Direct): "${text}"`);
    const result = await mcrService.translateNLToRulesDirect(text);
    if (result.success) {
      // The 'rules' field contains the array of rule strings.
      // 'rawOutput' contains the full string from LLM, which might include the '% Cannot convert...' message.
      res.status(200).json({ rules: result.rules, rawOutput: result.rawOutput });
    } else {
      next(new ApiError(
        result.error === 'no_rules_extracted' ? 400 : 500,
        result.message || 'Failed to translate NL to Rules.',
        result.error ? result.error.toUpperCase() : 'NL_TO_RULES_FAILED'
      ));
    }
  } catch (error) {
    logger.error(`[API] Error in nlToRulesDirectHandler: ${error.message}`, error);
    next(new ApiError(500, `Translation failed: ${error.message}`));
  }
}

// --- Status Handler ---
const { name, version, description } = require('../../package.json');

async function getStatusHandler(req, res, next) {
  try {
    // More detailed status, similar to old root GET /
    logger.info('[API] Get status handler invoked.');
    res.status(200).json({
      status: 'ok',
      name,
      version,
      description,
      message: 'MCR Streamlined API is running.',
      // Could add more dynamic status info here if needed, e.g., LLM provider from config
      llmProvider: require('./config').llm.provider,
    });
  } catch (error) {
    logger.error('[API] Error in getStatusHandler:', error);
    next(new ApiError(500, 'Failed to retrieve server status.'));
  }
}


// --- Utility/Debug Handlers ---

async function getPromptsHandler(req, res, next) {
  try {
    logger.info('[API] Getting all prompt templates.');
    const result = await mcrService.getPrompts(); // This is actually synchronous in current mcrService
    if (result.success) {
      res.status(200).json(result.prompts);
    } else {
      // Should not happen with current static implementation
      next(new ApiError(500, result.message || 'Failed to get prompts.', 'GET_PROMPTS_FAILED'));
    }
  } catch (error) {
    logger.error(`[API] Error in getPromptsHandler: ${error.message}`, error);
    next(new ApiError(500, `Failed to get prompts: ${error.message}`));
  }
}

async function debugFormatPromptHandler(req, res, next) {
  const { templateName, inputVariables } = req.body;

  if (!templateName || typeof templateName !== 'string' || templateName.trim() === '') {
    return next(new ApiError(400, 'Invalid input: "templateName" is required.'));
  }
  if (!inputVariables || typeof inputVariables !== 'object') {
    return next(new ApiError(400, 'Invalid input: "inputVariables" must be an object.'));
  }

  try {
    logger.info(`[API] Debugging prompt format for template: ${templateName}`);
    const result = await mcrService.debugFormatPrompt(templateName, inputVariables);
    if (result.success) {
      res.status(200).json({
        templateName: result.templateName,
        rawTemplate: result.rawTemplate,
        formattedUserPrompt: result.formattedUserPrompt,
        inputVariables: result.inputVariables,
      });
    } else {
      let statusCode = 500;
      if (result.error === 'invalid_template_name' || result.error === 'invalid_input_variables' || result.error === 'template_not_found' || result.error === 'template_user_field_missing') {
        statusCode = 400;
      }
      next(new ApiError(
        statusCode,
        result.message || 'Failed to format prompt.',
        result.error ? result.error.toUpperCase() : 'DEBUG_FORMAT_PROMPT_FAILED'
      ));
    }
  } catch (error) {
    logger.error(`[API] Error in debugFormatPromptHandler for ${templateName}: ${error.message}`, error);
    next(new ApiError(500, `Failed to format prompt: ${error.message}`));
  }
}

// --- Explain Query Handler ---
async function explainQueryHandler(req, res, next) {
  const { sessionId } = req.params;
  const { query: naturalLanguageQuestion } = req.body; // Renaming for clarity to match service

  if (!naturalLanguageQuestion || typeof naturalLanguageQuestion !== 'string' || naturalLanguageQuestion.trim() === '') {
    return next(new ApiError(400, 'Invalid input: "query" property (natural language question) is required.'));
  }

  try {
    logger.info(`[API] Explaining query for session ${sessionId}: "${naturalLanguageQuestion}"`);
    const result = await mcrService.explainQuery(sessionId, naturalLanguageQuestion);

    if (result.success) {
      res.status(200).json({
        explanation: result.explanation,
        debugInfo: result.debugInfo,
      });
    } else {
      let statusCode = 500;
      if (result.error === 'session_not_found') statusCode = 404;
      if (result.error === 'invalid_prolog_query_explain' || result.error === 'empty_explanation_generated') statusCode = 400;

      next(new ApiError(
        statusCode,
        result.message || 'Failed to explain query.',
        result.error ? result.error.toUpperCase() : 'EXPLAIN_QUERY_FAILED',
        result.debugInfo
      ));
    }
  } catch (error) {
    logger.error(`[API] Error in explainQueryHandler for session ${sessionId}: ${error.message}`, error);
    next(new ApiError(500, `Failed to explain query: ${error.message}`));
  }
}

async function rulesToNlDirectHandler(req, res, next) {
  const { rules: rulesInput, style } = req.body; // style is optional
  let rulesString;

  if (!rulesInput) {
    return next(new ApiError(400, 'Invalid input: "rules" property is required.'));
  }

  if (Array.isArray(rulesInput)) {
    // Join array elements, ensuring each ends with a period if not already.
    rulesString = rulesInput.map(r => r.trim()).filter(r => r.length > 0).map(r => r.endsWith('.') ? r : `${r}.`).join('\n');
  } else if (typeof rulesInput === 'string') {
    rulesString = rulesInput.trim();
  } else {
    return next(new ApiError(400, 'Invalid input: "rules" must be a string or an array of strings.'));
  }

  if (rulesString === '') {
    return next(new ApiError(400, 'Invalid input: "rules" property must not be empty after processing.'));
  }

  if (style && (typeof style !== 'string' || !['formal', 'conversational'].includes(style.toLowerCase()))) {
      return next(new ApiError(400, 'Invalid input: "style" must be "formal" or "conversational".'));
  }

  try {
    logger.info(`[API] Translating Rules to NL (Direct). Style: ${style || 'conversational'}`);
    const result = await mcrService.translateRulesToNLDirect(rulesString, style);
    if (result.success) {
      res.status(200).json({ explanation: result.explanation });
    } else {
      next(new ApiError(
         result.error === 'empty_rules_input' || result.error === 'empty_explanation_generated' ? 400 : 500,
         result.message || 'Failed to translate Rules to NL.',
         result.error ? result.error.toUpperCase() : 'RULES_TO_NL_FAILED'
      ));
    }
  } catch (error) {
    logger.error(`[API] Error in rulesToNlDirectHandler: ${error.message}`, error);
    next(new ApiError(500, `Translation failed: ${error.message}`));
  }
}
