// new/src/apiHandlers.js
const mcrService = require('./mcrService');
const ontologyService = require('./ontologyService'); // Added ontologyService
const { ApiError } = require('./errors');
const logger = require('./logger');

async function createSessionHandler(req, res, next) {
  const correlationId = req.correlationId;
  logger.info(`[API][${correlationId}] Enter createSessionHandler`);
  try {
    const session = mcrService.createSession();
    logger.info(
      `[API][${correlationId}] Session created successfully: ${session.id}`
    );
    res.status(201).json(session);
  } catch (error) {
    logger.error(`[API][${correlationId}] Error creating session:`, {
      error: error.stack,
    });
    next(new ApiError(500, 'Failed to create session.'));
  }
}

async function assertToSessionHandler(req, res, next) {
  const correlationId = req.correlationId;
  const { sessionId } = req.params;
  const { text } = req.body;
  logger.info(
    `[API][${correlationId}] Enter assertToSessionHandler for session ${sessionId}. Text length: ${text?.length}`
  );

  if (!text || typeof text !== 'string' || text.trim() === '') {
    logger.warn(
      `[API][${correlationId}] Invalid input for assertToSessionHandler: "text" is missing or invalid.`
    );
    return next(
      new ApiError(
        400,
        'Invalid input: "text" property is required in the request body and must be a non-empty string.'
      )
    );
  }

  try {
    logger.debug(
      `[API][${correlationId}] Calling mcrService.assertNLToSession for session ${sessionId}. Text: "${text}"`
    );
    const result = await mcrService.assertNLToSession(sessionId, text);
    if (result.success) {
      logger.info(
        `[API][${correlationId}] Successfully asserted to session ${sessionId}. Facts added: ${result.addedFacts?.length}`
      );
      res
        .status(200)
        .json({ message: result.message, addedFacts: result.addedFacts });
    } else {
      logger.warn(
        `[API][${correlationId}] Failed to assert to session ${sessionId}. Message: ${result.message}, Error: ${result.error}`
      );
      // Determine appropriate status code based on error type
      if (result.message === 'Session not found.') {
        next(new ApiError(404, result.message, 'SESSION_NOT_FOUND'));
      } else if (
        result.error === 'conversion_to_fact_failed' ||
        result.error === 'no_facts_extracted_by_strategy' // Corrected error code based on mcrService
      ) {
        next(new ApiError(400, result.message, result.error.toUpperCase()));
      } else {
        next(
          new ApiError(
            500,
            result.message || 'Failed to assert to session.',
            result.error || 'ASSERT_FAILED'
          )
        );
      }
    }
  } catch (error) {
    logger.error(
      `[API][${correlationId}] Error asserting to session ${sessionId}:`,
      { error: error.stack }
    );
    next(new ApiError(500, `Failed to assert to session: ${error.message}`));
  }
}

async function querySessionHandler(req, res, next) {
  const correlationId = req.correlationId;
  const { sessionId } = req.params;
  const { query, options } = req.body; // Extract options from body
  logger.info(
    `[API][${correlationId}] Enter querySessionHandler for session ${sessionId}. Query length: ${query?.length}`,
    { options }
  );

  if (!query || typeof query !== 'string' || query.trim() === '') {
    logger.warn(
      `[API][${correlationId}] Invalid input for querySessionHandler: "query" is missing or invalid.`
    );
    return next(
      new ApiError(
        400,
        'Invalid input: "query" property is required in the request body and must be a non-empty string.'
      )
    );
  }

  // Validate options.dynamicOntology if provided
  const dynamicOntology = options && options.dynamicOntology;
  if (dynamicOntology && typeof dynamicOntology !== 'string') {
    logger.warn(
      `[API][${correlationId}] Invalid input for querySessionHandler: "options.dynamicOntology" is not a string.`
    );
    return next(
      new ApiError(
        400,
        'Invalid input: "options.dynamicOntology" must be a string if provided.'
      )
    );
  }

  const serviceOptions = {
    dynamicOntology: dynamicOntology, // Pass it to the service
    style: options && options.style ? options.style : 'conversational', // Default if not provided
    debug:
      options && typeof options.debug === 'boolean' ? options.debug : false, // Default if not provided
  };
  logger.debug(
    `[API][${correlationId}] Service options for query:`,
    serviceOptions
  );

  try {
    logger.debug(
      `[API][${correlationId}] Calling mcrService.querySessionWithNL for session ${sessionId}. Query: "${query}"`
    );
    const result = await mcrService.querySessionWithNL(
      sessionId,
      query,
      serviceOptions
    );
    if (result.success) {
      logger.info(
        `[API][${correlationId}] Successfully queried session ${sessionId}. Answer length: ${result.answer?.length}`
      );
      const responsePayload = { answer: result.answer };
      if (serviceOptions.debug && result.debugInfo) {
        responsePayload.debugInfo = result.debugInfo; // Consider redacting sensitive parts of debugInfo if necessary
        logger.debug(
          `[API][${correlationId}] Including debugInfo in response for session ${sessionId}.`
        );
      }
      res.status(200).json(responsePayload);
    } else {
      logger.warn(
        `[API][${correlationId}] Failed to query session ${sessionId}. Message: ${result.message}, Error: ${result.error}`,
        { debugInfo: result.debugInfo }
      );
      if (result.message === 'Session not found.') {
        next(new ApiError(404, result.message, 'SESSION_NOT_FOUND'));
      } else if (result.error === 'invalid_prolog_query') {
        next(
          new ApiError(
            400,
            result.message,
            result.error.toUpperCase(),
            result.debugInfo // Consider redacting
          )
        );
      } else {
        next(
          new ApiError(
            500,
            result.message || 'Failed to query session.',
            result.error || 'QUERY_FAILED',
            result.debugInfo // Consider redacting
          )
        );
      }
    }
  } catch (error) {
    logger.error(
      `[API][${correlationId}] Error querying session ${sessionId}:`,
      { error: error.stack }
    );
    next(new ApiError(500, `Failed to query session: ${error.message}`));
  }
}

async function getSessionHandler(req, res, next) {
  const correlationId = req.correlationId;
  const { sessionId } = req.params;
  logger.info(
    `[API][${correlationId}] Enter getSessionHandler for session ${sessionId}`
  );
  try {
    const session = mcrService.getSession(sessionId);
    if (session) {
      logger.info(
        `[API][${correlationId}] Successfully retrieved session ${sessionId}.`
      );
      res.status(200).json(session);
    } else {
      logger.warn(
        `[API][${correlationId}] Session not found for getSessionHandler: ${sessionId}`
      );
      next(new ApiError(404, 'Session not found.', 'SESSION_NOT_FOUND'));
    }
  } catch (error) {
    logger.error(
      `[API][${correlationId}] Error retrieving session ${sessionId}:`,
      { error: error.stack }
    );
    next(new ApiError(500, `Failed to retrieve session: ${error.message}`));
  }
}

async function deleteSessionHandler(req, res, next) {
  const correlationId = req.correlationId;
  const { sessionId } = req.params;
  logger.info(
    `[API][${correlationId}] Enter deleteSessionHandler for session ${sessionId}`
  );
  try {
    const deleted = mcrService.deleteSession(sessionId);
    if (deleted) {
      logger.info(
        `[API][${correlationId}] Successfully deleted session ${sessionId}.`
      );
      res
        .status(200)
        .json({ message: `Session ${sessionId} deleted successfully.` });
    } else {
      logger.warn(
        `[API][${correlationId}] Session not found for deleteSessionHandler: ${sessionId}`
      );
      next(new ApiError(404, 'Session not found.', 'SESSION_NOT_FOUND'));
    }
  } catch (error) {
    logger.error(
      `[API][${correlationId}] Error deleting session ${sessionId}:`,
      { error: error.stack }
    );
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
  const correlationId = req.correlationId;
  const { name, rules } = req.body;
  logger.info(
    `[API][${correlationId}] Enter createOntologyHandler. Name: ${name}, Rules length: ${rules?.length}`
  );

  if (!name || !rules) {
    // Basic validation, service might do more
    logger.warn(
      `[API][${correlationId}] Invalid input for createOntologyHandler: "name" or "rules" missing.`
    );
    return next(
      new ApiError(400, 'Missing "name" or "rules" in request body.')
    );
  }
  try {
    const ontology = await ontologyService.createOntology(name, rules);
    logger.info(
      `[API][${correlationId}] Ontology created successfully: ${name}`
    );
    res.status(201).json(ontology);
  } catch (error) {
    logger.error(`[API][${correlationId}] Error creating ontology ${name}:`, {
      error: error.stack,
    });
    if (error instanceof ApiError) return next(error);
    next(new ApiError(500, `Failed to create ontology '${name}'.`));
  }
}

async function getOntologyHandler(req, res, next) {
  const correlationId = req.correlationId;
  const { name } = req.params;
  logger.info(
    `[API][${correlationId}] Enter getOntologyHandler for ontology: ${name}`
  );
  try {
    const ontology = await ontologyService.getOntology(name);
    if (ontology) {
      logger.info(
        `[API][${correlationId}] Successfully retrieved ontology: ${name}`
      );
      res.status(200).json(ontology);
    } else {
      logger.warn(
        `[API][${correlationId}] Ontology not found for getOntologyHandler: ${name}`
      );
      next(
        new ApiError(404, `Ontology '${name}' not found.`, 'ONTOLOGY_NOT_FOUND')
      );
    }
  } catch (error) {
    logger.error(`[API][${correlationId}] Error retrieving ontology ${name}:`, {
      error: error.stack,
    });
    if (error instanceof ApiError) return next(error);
    next(new ApiError(500, `Failed to retrieve ontology '${name}'.`));
  }
}

async function listOntologiesHandler(req, res, next) {
  const correlationId = req.correlationId;
  const includeRules = req.query.includeRules === 'true';
  logger.info(
    `[API][${correlationId}] Enter listOntologiesHandler. Include rules: ${includeRules}`
  );
  try {
    const ontologies = await ontologyService.listOntologies(includeRules);
    logger.info(
      `[API][${correlationId}] Successfully listed ontologies. Count: ${ontologies.length}`
    );
    res.status(200).json(ontologies);
  } catch (error) {
    logger.error(`[API][${correlationId}] Error listing ontologies:`, {
      error: error.stack,
    });
    if (error instanceof ApiError) return next(error);
    next(new ApiError(500, 'Failed to list ontologies.'));
  }
}

async function updateOntologyHandler(req, res, next) {
  const correlationId = req.correlationId;
  const { name } = req.params;
  const { rules } = req.body;
  logger.info(
    `[API][${correlationId}] Enter updateOntologyHandler for ontology: ${name}. Rules length: ${rules?.length}`
  );

  if (!rules) {
    // Basic validation
    logger.warn(
      `[API][${correlationId}] Invalid input for updateOntologyHandler: "rules" missing.`
    );
    return next(
      new ApiError(400, 'Missing "rules" in request body for update.')
    );
  }
  try {
    const updatedOntology = await ontologyService.updateOntology(name, rules);
    logger.info(
      `[API][${correlationId}] Ontology updated successfully: ${name}`
    );
    res.status(200).json(updatedOntology);
  } catch (error) {
    logger.error(`[API][${correlationId}] Error updating ontology ${name}:`, {
      error: error.stack,
    });
    if (error instanceof ApiError) return next(error);
    next(new ApiError(500, `Failed to update ontology '${name}'.`));
  }
}

async function deleteOntologyHandler(req, res, next) {
  const correlationId = req.correlationId;
  const { name } = req.params;
  logger.info(
    `[API][${correlationId}] Enter deleteOntologyHandler for ontology: ${name}`
  );
  try {
    await ontologyService.deleteOntology(name);
    logger.info(
      `[API][${correlationId}] Ontology deleted successfully: ${name}`
    );
    res
      .status(200)
      .json({ message: `Ontology '${name}' deleted successfully.` });
  } catch (error) {
    logger.error(`[API][${correlationId}] Error deleting ontology ${name}:`, {
      error: error.stack,
    });
    if (error instanceof ApiError) return next(error);
    next(new ApiError(500, `Failed to delete ontology '${name}'.`));
  }
}

// --- Direct Translation Handlers ---

async function nlToRulesDirectHandler(req, res, next) {
  const correlationId = req.correlationId;
  const { text } = req.body;
  logger.info(
    `[API][${correlationId}] Enter nlToRulesDirectHandler. Text length: ${text?.length}`
  );

  if (!text || typeof text !== 'string' || text.trim() === '') {
    logger.warn(
      `[API][${correlationId}] Invalid input for nlToRulesDirectHandler: "text" is missing or invalid.`
    );
    return next(
      new ApiError(
        400,
        'Invalid input: "text" property is required and must be a non-empty string.'
      )
    );
  }

  try {
    logger.debug(
      `[API][${correlationId}] Calling mcrService.translateNLToRulesDirect. Text: "${text}"`
    );
    const result = await mcrService.translateNLToRulesDirect(text);
    if (result.success) {
      logger.info(
        `[API][${correlationId}] Successfully translated NL to Rules (Direct). Rules count: ${result.rules?.length}`
      );
      res
        .status(200)
        .json({ rules: result.rules, rawOutput: result.rawOutput }); // rawOutput might be useful for clients
    } else {
      logger.warn(
        `[API][${correlationId}] Failed to translate NL to Rules (Direct). Message: ${result.message}, Error: ${result.error}`
      );
      next(
        new ApiError(
          result.error === 'no_rules_extracted_by_strategy' ? 400 : 500, // Corrected error code
          result.message || 'Failed to translate NL to Rules.',
          result.error ? result.error.toUpperCase() : 'NL_TO_RULES_FAILED'
        )
      );
    }
  } catch (error) {
    logger.error(
      `[API][${correlationId}] Error in nlToRulesDirectHandler: ${error.message}`,
      { error: error.stack }
    );
    next(new ApiError(500, `Translation failed: ${error.message}`));
  }
}

// --- Status Handler ---
const { name, version, description } = require('../package.json');

async function getStatusHandler(req, res, next) {
  const correlationId = req.correlationId;
  logger.info(`[API][${correlationId}] Enter getStatusHandler`);
  try {
    const statusInfo = {
      status: 'ok',
      name,
      version,
      description,
      message: 'MCR Streamlined API is running.',
      llmProvider: require('./config').llm.provider,
      correlationId, // Include correlation ID in status response for easier tracing
    };
    logger.info(
      `[API][${correlationId}] Successfully retrieved server status.`
    );
    res.status(200).json(statusInfo);
  } catch (error) {
    logger.error(`[API][${correlationId}] Error in getStatusHandler:`, {
      error: error.stack,
    });
    next(new ApiError(500, 'Failed to retrieve server status.'));
  }
}

// --- Utility/Debug Handlers ---

async function getPromptsHandler(req, res, next) {
  const correlationId = req.correlationId;
  logger.info(`[API][${correlationId}] Enter getPromptsHandler`);
  try {
    const result = await mcrService.getPrompts();
    if (result.success) {
      logger.info(
        `[API][${correlationId}] Successfully retrieved all prompt templates. Count: ${Object.keys(result.prompts).length}`
      );
      res.status(200).json(result.prompts);
    } else {
      logger.error(
        `[API][${correlationId}] Failed to get prompts from mcrService. Message: ${result.message}`
      );
      next(
        new ApiError(
          500,
          result.message || 'Failed to get prompts.',
          'GET_PROMPTS_FAILED'
        )
      );
    }
  } catch (error) {
    logger.error(
      `[API][${correlationId}] Error in getPromptsHandler: ${error.message}`,
      { error: error.stack }
    );
    next(new ApiError(500, `Failed to get prompts: ${error.message}`));
  }
}

async function debugFormatPromptHandler(req, res, next) {
  const correlationId = req.correlationId;
  const { templateName, inputVariables } = req.body;
  logger.info(
    `[API][${correlationId}] Enter debugFormatPromptHandler for template: ${templateName}`,
    { keys: inputVariables ? Object.keys(inputVariables) : null }
  );

  if (
    !templateName ||
    typeof templateName !== 'string' ||
    templateName.trim() === ''
  ) {
    logger.warn(
      `[API][${correlationId}] Invalid input for debugFormatPromptHandler: "templateName" is missing or invalid.`
    );
    return next(
      new ApiError(400, 'Invalid input: "templateName" is required.')
    );
  }
  if (!inputVariables || typeof inputVariables !== 'object') {
    logger.warn(
      `[API][${correlationId}] Invalid input for debugFormatPromptHandler: "inputVariables" is not an object.`
    );
    return next(
      new ApiError(400, 'Invalid input: "inputVariables" must be an object.')
    );
  }

  try {
    logger.debug(
      `[API][${correlationId}] Calling mcrService.debugFormatPrompt for template: ${templateName}`
    );
    const result = await mcrService.debugFormatPrompt(
      templateName,
      inputVariables
    );
    if (result.success) {
      logger.info(
        `[API][${correlationId}] Successfully formatted prompt for debug: ${templateName}`
      );
      res.status(200).json({
        templateName: result.templateName,
        rawTemplate: result.rawTemplate, // Potentially large, be mindful
        formattedUserPrompt: result.formattedUserPrompt, // Potentially large
        inputVariables: result.inputVariables, // Potentially large/sensitive
      });
    } else {
      logger.warn(
        `[API][${correlationId}] Failed to format prompt for debug: ${templateName}. Message: ${result.message}, Error: ${result.error}`
      );
      let statusCode = 500;
      if (
        result.error === 'invalid_template_name' ||
        result.error === 'invalid_input_variables' ||
        result.error === 'template_not_found' ||
        result.error === 'template_user_field_missing'
      ) {
        statusCode = 400;
      }
      next(
        new ApiError(
          statusCode,
          result.message || 'Failed to format prompt.',
          result.error
            ? result.error.toUpperCase()
            : 'DEBUG_FORMAT_PROMPT_FAILED'
        )
      );
    }
  } catch (error) {
    logger.error(
      `[API][${correlationId}] Error in debugFormatPromptHandler for ${templateName}: ${error.message}`,
      { error: error.stack }
    );
    next(new ApiError(500, `Failed to format prompt: ${error.message}`));
  }
}

// --- Explain Query Handler ---
async function explainQueryHandler(req, res, next) {
  const correlationId = req.correlationId;
  const { sessionId } = req.params;
  const { query: naturalLanguageQuestion } = req.body;
  logger.info(
    `[API][${correlationId}] Enter explainQueryHandler for session ${sessionId}. NLQ length: ${naturalLanguageQuestion?.length}`
  );

  if (
    !naturalLanguageQuestion ||
    typeof naturalLanguageQuestion !== 'string' ||
    naturalLanguageQuestion.trim() === ''
  ) {
    logger.warn(
      `[API][${correlationId}] Invalid input for explainQueryHandler: "query" is missing or invalid.`
    );
    return next(
      new ApiError(
        400,
        'Invalid input: "query" property (natural language question) is required.'
      )
    );
  }

  try {
    logger.debug(
      `[API][${correlationId}] Calling mcrService.explainQuery for session ${sessionId}. NLQ: "${naturalLanguageQuestion}"`
    );
    const result = await mcrService.explainQuery(
      sessionId,
      naturalLanguageQuestion
    );

    if (result.success) {
      logger.info(
        `[API][${correlationId}] Successfully explained query for session ${sessionId}. Explanation length: ${result.explanation?.length}`
      );
      res.status(200).json({
        explanation: result.explanation,
        debugInfo: result.debugInfo, // Consider redacting
      });
    } else {
      logger.warn(
        `[API][${correlationId}] Failed to explain query for session ${sessionId}. Message: ${result.message}, Error: ${result.error}`,
        { debugInfo: result.debugInfo }
      );
      let statusCode = 500;
      if (result.error === 'session_not_found') statusCode = 404;
      if (
        result.error === 'invalid_prolog_query_explain' || // This error is not explicitly thrown by mcrService, but keeping for safety
        result.error === 'empty_explanation_generated'
      )
        statusCode = 400;

      next(
        new ApiError(
          statusCode,
          result.message || 'Failed to explain query.',
          result.error ? result.error.toUpperCase() : 'EXPLAIN_QUERY_FAILED',
          result.debugInfo // Consider redacting
        )
      );
    }
  } catch (error) {
    logger.error(
      `[API][${correlationId}] Error in explainQueryHandler for session ${sessionId}: ${error.message}`,
      { error: error.stack }
    );
    next(new ApiError(500, `Failed to explain query: ${error.message}`));
  }
}

async function rulesToNlDirectHandler(req, res, next) {
  const correlationId = req.correlationId;
  const { rules: rulesInput, style } = req.body;
  logger.info(
    `[API][${correlationId}] Enter rulesToNlDirectHandler. Style: ${style}. Input type: ${typeof rulesInput}`
  );
  let rulesString;

  if (!rulesInput) {
    logger.warn(
      `[API][${correlationId}] Invalid input for rulesToNlDirectHandler: "rules" is missing.`
    );
    return next(
      new ApiError(400, 'Invalid input: "rules" property is required.')
    );
  }

  if (Array.isArray(rulesInput)) {
    logger.debug(
      `[API][${correlationId}] Processing array of rules for rulesToNlDirectHandler. Count: ${rulesInput.length}`
    );
    rulesString = rulesInput
      .map((r) => r.trim())
      .filter((r) => r.length > 0)
      .map((r) => (r.endsWith('.') ? r : `${r}.`))
      .join('\n');
  } else if (typeof rulesInput === 'string') {
    logger.debug(
      `[API][${correlationId}] Processing string of rules for rulesToNlDirectHandler. Length: ${rulesInput.length}`
    );
    rulesString = rulesInput.trim();
  } else {
    logger.warn(
      `[API][${correlationId}] Invalid input type for "rules" in rulesToNlDirectHandler.`
    );
    return next(
      new ApiError(
        400,
        'Invalid input: "rules" must be a string or an array of strings.'
      )
    );
  }

  if (rulesString === '') {
    logger.warn(
      `[API][${correlationId}] "rules" property is empty after processing for rulesToNlDirectHandler.`
    );
    return next(
      new ApiError(
        400,
        'Invalid input: "rules" property must not be empty after processing.'
      )
    );
  }
  logger.debug(
    `[API][${correlationId}] Processed rules string length: ${rulesString.length}`
  );

  if (
    style &&
    (typeof style !== 'string' ||
      !['formal', 'conversational'].includes(style.toLowerCase()))
  ) {
    logger.warn(
      `[API][${correlationId}] Invalid "style" for rulesToNlDirectHandler: ${style}`
    );
    return next(
      new ApiError(
        400,
        'Invalid input: "style" must be "formal" or "conversational".'
      )
    );
  }

  try {
    logger.debug(
      `[API][${correlationId}] Calling mcrService.translateRulesToNLDirect. Style: ${style || 'conversational'}`
    );
    const result = await mcrService.translateRulesToNLDirect(
      rulesString,
      style
    );
    if (result.success) {
      logger.info(
        `[API][${correlationId}] Successfully translated Rules to NL (Direct). Explanation length: ${result.explanation?.length}`
      );
      res.status(200).json({ explanation: result.explanation });
    } else {
      logger.warn(
        `[API][${correlationId}] Failed to translate Rules to NL (Direct). Message: ${result.message}, Error: ${result.error}`
      );
      next(
        new ApiError(
          result.error === 'empty_rules_input' ||
          result.error === 'empty_explanation_generated'
            ? 400
            : 500,
          result.message || 'Failed to translate Rules to NL.',
          result.error ? result.error.toUpperCase() : 'RULES_TO_NL_FAILED'
        )
      );
    }
  } catch (error) {
    logger.error(
      `[API][${correlationId}] Error in rulesToNlDirectHandler: ${error.message}`,
      { error: error.stack }
    );
    next(new ApiError(500, `Translation failed: ${error.message}`));
  }
}
