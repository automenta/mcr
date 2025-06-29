const SessionManager = require('./sessionManager');
const LlmService = require('./llmService');
const ReasonerService = require('./reasonerService');
const ApiError = require('./errors');
const logger = require('./logger').logger;
const {
  version: appVersion,
  name: appName,
  description: appDescription,
} = require('../package.json');

const VALID_STYLES = ['conversational', 'formal'];

function validateNonEmptyString(field, fieldName, errorCodePrefix) {
  if (!field || typeof field !== 'string' || field.trim() === '') {
    throw new ApiError(
      400,
      `Missing or invalid required field '${fieldName}'. Must be a non-empty string.`,
      `${errorCodePrefix}_INVALID_${fieldName.toUpperCase()}`
    );
  }
}

function validateOptionalString(field, fieldName, errorCodePrefix) {
  if (field && (typeof field !== 'string' || field.trim() === '')) {
    throw new ApiError(
      400,
      `Invalid optional field '${fieldName}'. Must be a non-empty string if provided.`,
      `${errorCodePrefix}_INVALID_${fieldName.toUpperCase()}`
    );
  }
}

function validateStyle(style, fieldName, errorCodePrefix) {
  if (style && !VALID_STYLES.includes(style.toLowerCase())) {
    throw new ApiError(
      400,
      `Invalid '${fieldName}'. Must be one of ${VALID_STYLES.join(', ')}.`,
      `${errorCodePrefix}_INVALID_${fieldName.toUpperCase()}`
    );
  }
}

const ApiHandlers = {
  getRoot: (req, res) =>
    res.json({
      status: 'ok',
      name: appName || 'Model Context Reasoner',
      version: appVersion || 'unknown',
      description: appDescription || 'MCR API',
    }),

  createSession: (req, res, next) => {
    let session; // Define session outside try to log it in catch if needed
    try {
      logger.debug('Attempting SessionManager.create() in createSession handler');
      session = SessionManager.create();
      logger.debug('SessionManager.create() successful', { sessionId: session ? session.sessionId : 'undefined' });

      if (!session) {
        logger.error('SessionManager.create() returned undefined/null unexpectedly.');
        // Explicitly throw to go to error handler
        throw new Error('SessionManager.create() returned undefined/null.');
      }

      logger.debug('Attempting res.status(201).json(session)');
      res.status(201).json(session);
      logger.debug('res.status(201).json(session) completed');

    } catch (err) {
      // Temporary direct console log for immediate feedback in test output
      console.error("RAW ERROR in createSession handler (explicit catch):", err, err.stack);
      logger.error('RAW ERROR in createSession handler (explicit catch)', {
        error: err,
        message: err.message,
        stack: err.stack,
        isApiError: err instanceof ApiError,
        sessionObject: session // Log the session if available
      });
      next(err); // Pass to the main error handler in mcr.js
    }
  },

  getSession: (req, res, next) => {
    try {
      const session = SessionManager.get(req.params.sessionId);
      res.json(session);
    } catch (err) {
      next(err);
    }
  },

  deleteSession: (req, res, next) => {
    try {
      const { sessionId } = req.params;
      SessionManager.delete(sessionId);
      res.json({
        message: `Session ${sessionId} terminated.`,
        sessionId,
      });
    } catch (err) {
      next(err);
    }
  },

  assertAsync: async (req, res, next) => {
    try {
      const { sessionId } = req.params;
      const { text } = req.body;
      logger.debug(`Attempting to assert facts for session ${sessionId}`, {
        sessionId,
        textLength: text?.length,
      });
      validateNonEmptyString(text, 'text', 'ASSERT');
      const currentSession = SessionManager.get(sessionId); // Ensures session exists
      const currentFacts = currentSession.facts.join('\n');
      const ontologyContext =
        SessionManager.getNonSessionOntologyFacts(sessionId).join('\n');

      const newFacts = await LlmService.nlToRulesAsync(
        text,
        currentFacts,
        ontologyContext
      );
      SessionManager.addFacts(sessionId, newFacts);
      const updatedSession = SessionManager.get(sessionId);
      res.json({
        addedFacts: newFacts,
        totalFactsInSession: updatedSession.factCount,
        metadata: { success: true },
      });
    } catch (err) {
      next(err);
    }
  },

  queryAsync: async (req, res, next) => {
    try {
      const { sessionId } = req.params;
      const { query, options = {}, ontology: requestOntology } = req.body;

      logger.debug(`Attempting to query session ${sessionId}`, {
        sessionId,
        queryLength: query?.length,
        options,
        requestOntologyProvided: !!requestOntology,
      });

      validateNonEmptyString(query, 'query', 'QUERY');
      if (options.style) {
        validateStyle(options.style, 'options.style', 'QUERY');
      }
      if (requestOntology) {
        validateOptionalString(requestOntology, 'ontology', 'QUERY');
      }
      if (options && typeof options !== 'object') {
        throw new ApiError(
          400,
          "Invalid 'options' field. Must be an object.",
          'QUERY_INVALID_OPTIONS_TYPE'
        );
      }

      const prologQuery = await LlmService.queryToPrologAsync(query);
      logger.info(
        `Session ${sessionId}: Translated NL query to Prolog: "${prologQuery}"`,
        { sessionId, prologQuery }
      );

      SessionManager.get(sessionId); // Ensures session exists before proceeding

      const facts = SessionManager.getFactsWithOntology(
        sessionId,
        requestOntology
      );
      let rawResults;
      try {
        rawResults = await ReasonerService.runQuery(facts, prologQuery);
      } catch (reasonerError) {
        logger.error(
          `Error running Prolog query for session ${sessionId}: ${reasonerError.message}`,
          { sessionId, prologQuery, factsUsed: facts }
        );
        if (
          reasonerError.message.includes('Prolog syntax error') ||
          reasonerError.message.includes('error(syntax_error')
        ) {
          throw new ApiError(
            400,
            `The LLM generated an invalid Prolog query. Please try rephrasing your question. Details: ${reasonerError.message}`,
            'QUERY_PROLOG_SYNTAX_ERROR'
          );
        }
        // Ensure it's an ApiError for consistent handling downstream
        throw new ApiError(
          500,
          `Reasoner error: ${reasonerError.message}`,
          'QUERY_REASONER_FAILED'
        );
      }

      const simpleResult = ApiHandlers._simplifyPrologResults(
        rawResults,
        logger
      );

      logger.info(
        `Session ${sessionId}: Prolog query returned: ${JSON.stringify(simpleResult)}`,
        { sessionId }
      );
      const finalAnswer = await LlmService.resultToNlAsync(
        query,
        JSON.stringify(simpleResult),
        options.style // Already validated
      );
      const response = {
        queryProlog: prologQuery,
        result: simpleResult,
        answer: finalAnswer,
        metadata: { success: true, steps: rawResults.length },
      };

      if (options.debug) {
        const currentSessionDebug = SessionManager.get(sessionId);
        response.debug = {
          factsInSession: currentSessionDebug.facts,
          ontologyContextUsed:
            SessionManager.getNonSessionOntologyFacts(sessionId),
          fullKnowledgeBaseSentToReasoner: facts,
          prologQueryGenerated: prologQuery,
          rawReasonerResults: rawResults,
          inputToNlAnswerGeneration: {
            originalQuery: query,
            simplifiedLogicResult: simpleResult,
            style: options.style || 'conversational', // Default if not provided
          },
        };
        logger.info(`Session ${sessionId}: Debug mode enabled for query.`, {
          correlationId: req.correlationId,
          debugData: response.debug,
        });
      }
      res.json(response);
    } catch (err) {
      next(err);
    }
  },

  translateNlToRulesAsync: async (req, res, next) => {
    try {
      const { text, existing_facts, ontology_context } = req.body;
      validateNonEmptyString(text, 'text', 'NL_TO_RULES');
      validateOptionalString(existing_facts, 'existing_facts', 'NL_TO_RULES');
      validateOptionalString(
        ontology_context,
        'ontology_context',
        'NL_TO_RULES'
      );

      const rules = await LlmService.nlToRulesAsync(
        text,
        existing_facts || '', // Default to empty string if undefined/null
        ontology_context || '' // Default to empty string
      );
      res.json({ rules });
    } catch (err) {
      next(err);
    }
  },

  translateRulesToNlAsync: async (req, res, next) => {
    try {
      const { rules, style } = req.body;
      if (
        !rules ||
        !Array.isArray(rules) ||
        !rules.every((r) => typeof r === 'string' && r.trim() !== '')
      ) {
        throw new ApiError(
          400,
          "Missing or invalid 'rules' field; must be an array of non-empty strings.",
          'RULES_TO_NL_INVALID_RULES'
        );
      }
      if (style) {
        validateStyle(style, 'style', 'RULES_TO_NL');
      }
      const text = await LlmService.rulesToNlAsync(rules, style);
      res.json({ text });
    } catch (err) {
      next(err);
    }
  },

  addOntology: (req, res, next) => {
    try {
      const { name, rules } = req.body;
      validateNonEmptyString(name, 'name', 'ONTOLOGY_ADD');
      validateNonEmptyString(rules, 'rules', 'ONTOLOGY_ADD');
      const newOntology = SessionManager.addOntology(name, rules);
      res.status(201).json(newOntology);
    } catch (err) {
      next(err);
    }
  },

  updateOntology: (req, res, next) => {
    try {
      const { name } = req.params;
      const { rules } = req.body;
      validateNonEmptyString(rules, 'rules', 'ONTOLOGY_UPDATE');
      const updatedOntology = SessionManager.updateOntology(name, rules);
      res.json(updatedOntology);
    } catch (err) {
      next(err);
    }
  },

  getOntologies: (req, res, next) => {
    try {
      res.json(SessionManager.getOntologies());
    } catch (err) {
      next(err);
    }
  },

  getOntology: (req, res, next) => {
    try {
      const ontology = SessionManager.getOntology(req.params.name);
      res.json(ontology);
    } catch (err) {
      next(err);
    }
  },

  deleteOntology: (req, res, next) => {
    try {
      const { name } = req.params;
      const result = SessionManager.deleteOntology(name); // Assuming this throws if not found
      res.json({
        message: result.message || `Ontology ${name} deleted.`, // Use message from manager if available
        ontologyName: name,
      });
    } catch (err) {
      next(err);
    }
  },

  explainQueryAsync: async (req, res, next) => {
    try {
      const { sessionId } = req.params;
      const { query } = req.body;
      validateNonEmptyString(query, 'query', 'EXPLAIN_QUERY');

      const currentSession = SessionManager.get(sessionId); // Ensures session exists
      const facts = currentSession.facts;
      const ontologyContext =
        SessionManager.getNonSessionOntologyFacts(sessionId);
      const explanation = await LlmService.explainQueryAsync(
        query,
        facts,
        ontologyContext
      );
      res.json({ query, explanation });
    } catch (err) {
      next(err);
    }
  },

  getPrompts: (req, res) => {
    res.json(LlmService.getPromptTemplates());
  },

  debugFormatPromptAsync: async (req, res, next) => {
    try {
      const { templateName, inputVariables } = req.body;

      validateNonEmptyString(
        templateName,
        'templateName',
        'DEBUG_FORMAT_PROMPT'
      );
      if (
        !inputVariables ||
        typeof inputVariables !== 'object' ||
        Array.isArray(inputVariables)
      ) {
        throw new ApiError(
          400,
          "Missing or invalid required field 'inputVariables'. Must be an object.",
          'DEBUG_FORMAT_PROMPT_INVALID_INPUT_VARIABLES'
        );
      }

      const allTemplates = LlmService.getPromptTemplates();
      const rawTemplate = allTemplates[templateName];

      if (!rawTemplate) {
        throw new ApiError(
          404,
          `Prompt template with name '${templateName}' not found.`,
          'DEBUG_FORMAT_PROMPT_TEMPLATE_NOT_FOUND'
        );
      }

      const { PromptTemplate } = require('@langchain/core/prompts');

      let formattedPrompt;
      try {
        const promptInstance = PromptTemplate.fromTemplate(rawTemplate);
        formattedPrompt = await promptInstance.format(inputVariables);
      } catch (error) {
        logger.warn('Error formatting prompt in debug endpoint.', {
          internalErrorCode: 'DEBUG_FORMAT_PROMPT_FORMATTING_ERROR',
          templateName,
          inputVariables,
          originalError: error.message,
          stack: error.stack,
        });
        throw new ApiError(
          400,
          `Error formatting prompt '${templateName}': ${error.message}. Check input variables.`,
          'DEBUG_FORMAT_PROMPT_FORMATTING_FAILED'
        );
      }

      res.json({
        templateName,
        rawTemplate,
        inputVariables,
        formattedPrompt,
      });

      // Removed temporary debug logging for NL_TO_RULES
      // if (templateName === 'NL_TO_RULES') {
      //   logger.error('DEBUG: Full formattedPrompt for NL_TO_RULES:', { prompt: formattedPrompt });
      // }

    } catch (err) {
      next(err);
    }
  },

  _simplifyPrologResults(rawResults, loggerInstance) {
    if (!rawResults || rawResults.length === 0) {
      // Handle undefined or empty rawResults
      return 'No solution found.';
    }
    if (rawResults.length === 1 && rawResults[0] === 'true.') {
      return 'Yes.';
    }
    if (rawResults.length === 1 && rawResults[0] === 'false.') {
      return 'No.';
    }
    try {
      // Attempt to parse results that look like they might be JSON
      // but keep others (like variable bindings 'X = value') as strings.
      const processedResults = rawResults.map((r) => {
        if (typeof r === 'string' && (r.startsWith('{') || r.startsWith('['))) {
          try {
            return JSON.parse(r);
          } catch (_e) {
            // Prefixed e
            // Not valid JSON, keep as string
            return r;
          }
        }
        // Handle cases where results might already be objects/arrays from reasoner
        if (typeof r === 'object' || Array.isArray(r)) {
          return r;
        }
        // Default to string, includes 'X = value.' cases
        return String(r);
      });

      if (processedResults.length === 1) {
        return processedResults[0];
      }
      return processedResults;
    } catch (_e) {
      // Prefixed e
      loggerInstance.warn(
        `Could not fully process Prolog results: ${JSON.stringify(rawResults)}. Returning as best effort. Error: ${_e.message}`,
        {
          internalErrorCode: 'PROLOG_RESULT_PROCESSING_FAILED',
          rawResults,
          error: _e.toString(),
        }
      );
      // Return raw results as a fallback if any processing error occurs
      return rawResults.map((r) => String(r));
    }
  },
};

module.exports = ApiHandlers;
