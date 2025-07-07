// new/src/apiHandlers.js
const mcrService = require('./mcrService');
const ontologyService = require('./ontologyService'); // Added ontologyService
const { ApiError } = require('./errors');
const logger = require('./logger');

async function createSessionHandler(req, res, next) {
  const correlationId = req.correlationId;
  logger.info(`[API][${correlationId}] Enter createSessionHandler`);
  try {
    const session = await mcrService.createSession(); // Await async call
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
        .json({ message: result.message, addedFacts: result.addedFacts, cost: result.cost }); // Added cost
    } else {
      logger.warn(
        `[API][${correlationId}] Failed to assert to session ${sessionId}. Message: ${result.message}, Error: ${result.error}`
      );
      // Determine appropriate status code based on error type
      // Standardized error codes from mcrService are now in result.error
      let statusCode = 500; // Default to internal server error
      let errorCode = (result.error || 'ASSERT_FAILED').toUpperCase();
      let errorDetails = result.details;

      if (errorCode === 'SESSION_NOT_FOUND') {
        statusCode = 404;
      } else if (
        errorCode === 'NO_FACTS_EXTRACTED_BY_STRATEGY' ||
        errorCode === 'INVALID_GENERATED_PROLOG' ||
        errorCode === 'STRATEGY_ASSERT_FAILED' // Assuming strategy errors might be client-correctable if prompt is bad
      ) {
        // Consider 400 if the error implies a bad request (e.g., text cannot be translated)
        // For INVALID_GENERATED_PROLOG, it's a server-side translation producing bad output, but from client text.
        // Let's use 400 for these as they often stem from the nature of the input text.
        statusCode = 400;
      }
      // For other errors like SESSION_ADD_FACTS_FAILED, 500 is appropriate.

      next(
        new ApiError(
          statusCode,
          result.message || 'Failed to assert to session.',
          errorCode,
          errorDetails // Pass details to ApiError
        )
      );
    }
  } catch (error) {
    // This catch block is for unexpected errors not handled by mcrService's structured return
    logger.error(
      `[API][${correlationId}] Unexpected error asserting to session ${sessionId}:`,
      { error: error.stack }
    );
    next(
      new ApiError(
        500,
        `An unexpected error occurred during assertion: ${error.message}`,
        'UNEXPECTED_ASSERT_ERROR'
      )
    );
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

  // Server's debugLevel from config
  const serverDebugLevel = require('./config').debugLevel;
  // Client's requested debug flag
  const clientRequestedDebug =
    options && typeof options.debug === 'boolean' ? options.debug : false;

  const serviceOptions = {
    dynamicOntology: dynamicOntology,
    style: options && options.style ? options.style : 'conversational',
    // Pass the client's debug request to mcrService,
    // mcrService will then use its own config.debugLevel to shape the actual debugInfo content.
    // The 'debug' flag here tells mcrService that the client is interested in debug output.
    debug: clientRequestedDebug,
  };
  logger.debug(
    `[API][${correlationId}] Service options for query (clientDebug: ${clientRequestedDebug}, serverDebug: ${serverDebugLevel}):`,
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
      const responsePayload = { answer: result.answer, cost: result.cost }; // Added cost

      // Only include debugInfo in response if client requested it AND server's level allows some form of it.
      // mcrService now shapes debugInfo based on its config.debugLevel.
      // apiHandler respects client's "options.debug" to include it or not.
      if (
        clientRequestedDebug &&
        result.debugInfo &&
        serverDebugLevel !== 'none'
      ) {
        responsePayload.debugInfo = result.debugInfo;
        logger.debug(
          `[API][${correlationId}] Including debugInfo in response for session ${sessionId} (level: ${result.debugInfo.level}).`
        );
      }
      res.status(200).json(responsePayload);
    } else {
      logger.warn(
        `[API][${correlationId}] Failed to query session ${sessionId}. Message: ${result.message}, Error: ${result.error}, Details: ${JSON.stringify(result.details)}`,
        { debugInfo: result.debugInfo }
      );
      // Standardized error codes from mcrService are now in result.error
      let statusCode = 500; // Default to internal server error
      let errorCode = (result.error || 'QUERY_FAILED').toUpperCase();
      // debugInfo from mcrService might contain the original error message if it's a STRATEGY_QUERY_FAILED
      let errorDetails =
        result.debugInfo && result.debugInfo.error
          ? { serviceError: result.debugInfo.error, ...result.debugInfo }
          : result.debugInfo;
      if (result.details) {
        // If mcrService explicitly provides details
        errorDetails = {
          ...(errorDetails || {}),
          serviceDetails: result.details,
        };
      }

      if (errorCode === 'SESSION_NOT_FOUND') {
        statusCode = 404;
      } else if (
        errorCode === 'STRATEGY_QUERY_FAILED' // Assuming strategy errors might be client-correctable
        // Add other specific 400 error codes from mcrService.querySessionWithNL if any
      ) {
        statusCode = 400; // Or 500 if it's truly an internal strategy problem not due to input
      } else if (errorCode === 'INTERNAL_KB_NOT_FOUND_FOR_SESSION') {
        statusCode = 500; // This is an internal server error
      }
      // For other errors, 500 is appropriate.

      next(
        new ApiError(
          statusCode,
          result.message || 'Failed to query session.',
          errorCode,
          errorDetails // Pass potentially augmented debugInfo as details
        )
      );
    }
  } catch (error) {
    // This catch block is for unexpected errors not handled by mcrService's structured return
    logger.error(
      `[API][${correlationId}] Unexpected error querying session ${sessionId}:`,
      { error: error.stack }
    );
    next(
      new ApiError(
        500,
        `An unexpected error occurred during query: ${error.message}`,
        'UNEXPECTED_QUERY_ERROR'
      )
    );
  }
}

async function getSessionHandler(req, res, next) {
  const correlationId = req.correlationId;
  const { sessionId } = req.params;
  logger.info(
    `[API][${correlationId}] Enter getSessionHandler for session ${sessionId}`
  );
  try {
    const session = await mcrService.getSession(sessionId); // Await async call
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
  // Strategy Management Handlers
  listStrategiesHandler,
  setStrategyHandler,
  getActiveStrategyHandler,
};

// --- Strategy Management Handlers ---
async function listStrategiesHandler(req, res, next) {
  const correlationId = req.correlationId;
  logger.info(`[API][${correlationId}] Enter listStrategiesHandler`);
  try {
    const strategies = mcrService.getAvailableStrategies(); // This should be synchronous from strategyManager via mcrService
    logger.info(`[API][${correlationId}] Successfully listed available strategies. Count: ${strategies.length}`);
    res.status(200).json({ strategies });
  } catch (error) {
    logger.error(`[API][${correlationId}] Error listing strategies:`, { error: error.stack });
    next(new ApiError(500, 'Failed to list strategies.'));
  }
}

async function setStrategyHandler(req, res, next) {
  const correlationId = req.correlationId;
  const { strategyName } = req.body;
  logger.info(`[API][${correlationId}] Enter setStrategyHandler. StrategyName: ${strategyName}`);

  if (!strategyName || typeof strategyName !== 'string' || strategyName.trim() === '') {
    logger.warn(`[API][${correlationId}] Invalid input for setStrategyHandler: "strategyName" is missing or invalid.`);
    return next(new ApiError(400, 'Invalid input: "strategyName" is required.'));
  }

  try {
    const success = mcrService.setTranslationStrategy(strategyName);
    if (success) {
      const currentStrategy = mcrService.getActiveStrategyName();
      logger.info(`[API][${correlationId}] Translation strategy successfully set to: ${currentStrategy}`);
      res.status(200).json({ message: `Translation strategy set to ${currentStrategy}`, activeStrategy: currentStrategy });
    } else {
      logger.warn(`[API][${correlationId}] Failed to set translation strategy to: ${strategyName}. It might be invalid or already active.`);
      // mcrService.setTranslationStrategy now returns false if strategy is unknown or already active (but logs info for latter)
      // It's better to check if it's simply not found vs already active.
      // For now, if it's not found, it's a 400. If found but already active, it's still a success.
      // The mcrService.setTranslationStrategy was updated to handle this.
      // If it returns false, it implies the strategy was not found.
      next(new ApiError(400, `Failed to set translation strategy. Unknown strategy: ${strategyName}.`, 'STRATEGY_NOT_FOUND'));
    }
  } catch (error) {
    logger.error(`[API][${correlationId}] Error setting translation strategy:`, { error: error.stack });
    next(new ApiError(500, `Failed to set translation strategy: ${error.message}`));
  }
}

async function getActiveStrategyHandler(req, res, next) {
  const correlationId = req.correlationId;
  logger.info(`[API][${correlationId}] Enter getActiveStrategyHandler`);
  try {
    const activeStrategy = mcrService.getActiveStrategyName();
    logger.info(`[API][${correlationId}] Successfully retrieved active strategy: ${activeStrategy}`);
    res.status(200).json({ activeStrategy });
  } catch (error) {
    logger.error(`[API][${correlationId}] Error retrieving active strategy:`, { error: error.stack });
    next(new ApiError(500, 'Failed to retrieve active strategy.'));
  }
}


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
        .json({ rules: result.rules, rawOutput: result.rawOutput, cost: result.cost }); // Added cost
    } else {
      logger.warn(
        `[API][${correlationId}] Failed to translate NL to Rules (Direct). Message: ${result.message}, Error: ${result.error}`
      );
      next(
        new ApiError(
          result.error === 'no_rules_extracted_by_strategy' ? 400 : 500, // Corrected error code
          result.message || 'Failed to translate NL to Rules.',
          result.error ? result.error.toUpperCase() : 'NL_TO_RULES_FAILED', // Use standardized code from mcrService
          result.details // Pass details if provided by mcrService
        )
      );
    }
  } catch (error) {
    // This catch block is for unexpected errors not handled by mcrService's structured return
    logger.error(
      `[API][${correlationId}] Unexpected error in nlToRulesDirectHandler: ${error.message}`,
      { error: error.stack }
    );
    next(
      new ApiError(
        500,
        `An unexpected error occurred during NL to Rules translation: ${error.message}`,
        'UNEXPECTED_NL_TO_RULES_ERROR'
      )
    );
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
      // mcrService now returns uppercase error codes
      if (
        result.error === 'INVALID_TEMPLATE_NAME' ||
        result.error === 'INVALID_INPUT_VARIABLES' ||
        result.error === 'TEMPLATE_NOT_FOUND' ||
        result.error === 'TEMPLATE_USER_FIELD_MISSING'
      ) {
        statusCode = 400;
      }
      next(
        new ApiError(
          statusCode,
          result.message || 'Failed to format prompt.',
          result.error || 'DEBUG_FORMAT_PROMPT_FAILED', // Already uppercase from mcrService or default
          result.details
        )
      );
    }
  } catch (error) {
    logger.error(
      `[API][${correlationId}] Unexpected error in debugFormatPromptHandler for ${templateName}: ${error.message}`,
      { error: error.stack }
    );
    next(
      new ApiError(
        500,
        `An unexpected error occurred during prompt formatting: ${error.message}`,
        'UNEXPECTED_DEBUG_FORMAT_ERROR'
      )
    );
  }
}

// --- Explain Query Handler ---
async function explainQueryHandler(req, res, next) {
  const correlationId = req.correlationId;
  const { sessionId } = req.params;
  const { query: naturalLanguageQuestion, options } = req.body; // Allow options for debug
  logger.info(
    `[API][${correlationId}] Enter explainQueryHandler for session ${sessionId}. NLQ length: ${naturalLanguageQuestion?.length}`,
    { options }
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
    // Pass client's debug request to mcrService for explainQuery
    const clientRequestedDebugExplain =
      options && typeof options.debug === 'boolean' ? options.debug : false;
    const serverDebugLevelExplain = require('./config').debugLevel;

    const result = await mcrService.explainQuery(
      sessionId,
      naturalLanguageQuestion,
      { debug: clientRequestedDebugExplain } // Pass debug hint to service
    );

    if (result.success) {
      logger.info(
        `[API][${correlationId}] Successfully explained query for session ${sessionId}. Explanation length: ${result.explanation?.length}`
      );
      const responsePayload = { explanation: result.explanation, cost: result.cost }; // Added cost
      // Similar logic for including debugInfo as in querySessionHandler
      if (
        clientRequestedDebugExplain &&
        result.debugInfo &&
        serverDebugLevelExplain !== 'none'
      ) {
        responsePayload.debugInfo = result.debugInfo;
        logger.debug(
          `[API][${correlationId}] Including debugInfo in explain response for session ${sessionId} (level: ${result.debugInfo.level}).`
        );
      }
      res.status(200).json(responsePayload);
    } else {
      logger.warn(
        `[API][${correlationId}] Failed to explain query for session ${sessionId}. Message: ${result.message}, Error: ${result.error}, Details: ${JSON.stringify(result.details)}`,
        { debugInfo: result.debugInfo }
      );
      let statusCode = 500;
      let errorCode = (result.error || 'EXPLAIN_QUERY_FAILED').toUpperCase();
      let errorDetails =
        result.debugInfo && result.debugInfo.error
          ? { serviceError: result.debugInfo.error, ...result.debugInfo }
          : result.debugInfo;
      if (result.details) {
        errorDetails = {
          ...(errorDetails || {}),
          serviceDetails: result.details,
        };
      }

      if (errorCode === 'SESSION_NOT_FOUND') {
        statusCode = 404;
      } else if (
        errorCode === 'EMPTY_EXPLANATION_GENERATED' ||
        errorCode === 'STRATEGY_QUERY_FAILED' // If query translation by strategy fails
      ) {
        statusCode = 400; // Problem with input or translation leading to no explanation
      }

      next(
        new ApiError(
          statusCode,
          result.message || 'Failed to explain query.',
          errorCode,
          errorDetails
        )
      );
    }
  } catch (error) {
    logger.error(
      `[API][${correlationId}] Unexpected error in explainQueryHandler for session ${sessionId}: ${error.message}`,
      { error: error.stack }
    );
    next(
      new ApiError(
        500,
        `An unexpected error occurred during query explanation: ${error.message}`,
        'UNEXPECTED_EXPLAIN_QUERY_ERROR'
      )
    );
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
      res.status(200).json({ explanation: result.explanation, cost: result.cost }); // Added cost
    } else {
      logger.warn(
        `[API][${correlationId}] Failed to translate Rules to NL (Direct). Message: ${result.message}, Error: ${result.error}`
      );
      let statusCode = 500;
      let errorCode = (result.error || 'RULES_TO_NL_FAILED').toUpperCase();

      if (
        errorCode === 'EMPTY_RULES_INPUT' ||
        errorCode === 'EMPTY_EXPLANATION_GENERATED'
      ) {
        statusCode = 400;
      }
      // Consider other mcrService error codes if any

      next(
        new ApiError(
          statusCode,
          result.message || 'Failed to translate Rules to NL.',
          errorCode,
          result.details
        )
      );
    }
  } catch (error) {
    logger.error(
      `[API][${correlationId}] Unexpected error in rulesToNlDirectHandler: ${error.message}`,
      { error: error.stack }
    );
    next(
      new ApiError(
        500,
        `An unexpected error occurred during Rules to NL translation: ${error.message}`,
        'UNEXPECTED_RULES_TO_NL_ERROR'
      )
    );
  }
}
