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

function validateNonEmptyString(field, fieldName, errorCode) {
  if (!field || typeof field !== 'string' || field.trim() === '') {
    throw new ApiError(
      400,
      `Missing or invalid required field '${fieldName}'. Must be a non-empty string.`,
      errorCode
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

  createSession: (req, res) => res.status(201).json(SessionManager.create()),

  getSession: (req, res, next) => {
    try {
      res.json(SessionManager.get(req.params.sessionId));
    } catch (err) {
      next(err);
    }
  },

  deleteSession: (req, res, next) => {
    try {
      SessionManager.delete(req.params.sessionId);
      res.json({ message: `Session ${req.params.sessionId} terminated.` });
    } catch (err) {
      next(err);
    }
  },

  assertAsync: async (req, res, next) => {
    try {
      const { sessionId } = req.params;
      const { text } = req.body;
      validateNonEmptyString(text, 'text');
      const currentSession = SessionManager.get(sessionId);
      const currentFacts = currentSession.facts.join('\n');
      const ontologyContext =
        SessionManager.getNonSessionOntologyFacts(sessionId).join('\n');
      const newFacts = await LlmService.nlToRulesAsync(
        text,
        currentFacts,
        ontologyContext
      );
      SessionManager.addFacts(sessionId, newFacts);
      res.json({
        addedFacts: newFacts,
        totalFactsInSession: SessionManager.get(sessionId).factCount,
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
      validateNonEmptyString(query, 'query');
      const prologQuery = await LlmService.queryToPrologAsync(query);
      logger.info(
        `Session ${sessionId}: Translated NL query to Prolog: "${prologQuery}"`
      );
      const facts = SessionManager.getFactsWithOntology(
        sessionId,
        requestOntology
      );
      let rawResults;
      try {
        rawResults = await ReasonerService.runQuery(facts, prologQuery);
      } catch (reasonerError) {
        logger.error(`Error running Prolog query: ${reasonerError.message}`);
        if (
          reasonerError.message.includes('Prolog syntax error') ||
          reasonerError.message.includes('error(syntax_error')
        ) {
          throw new ApiError(
            400,
            `The LLM generated an invalid Prolog query. Please try rephrasing your question. Details: ${reasonerError.message}`
          );
        }
        throw reasonerError;
      }

      const simpleResult = ApiHandlers._simplifyPrologResults(
        rawResults,
        logger
      );

      logger.info(
        `Session ${sessionId}: Prolog query returned: ${JSON.stringify(simpleResult)}`
      );
      const finalAnswer = await LlmService.resultToNlAsync(
        query,
        JSON.stringify(simpleResult),
        options.style
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
            style: options.style || 'conversational',
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
      const { text, existing_facts = '', ontology_context = '' } = req.body;
      validateNonEmptyString(text, 'text');
      const rules = await LlmService.nlToRulesAsync(
        text,
        existing_facts,
        ontology_context
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
        !rules.every((r) => typeof r === 'string')
      ) {
        throw new ApiError(
          400,
          "Missing or invalid 'rules' field; must be an array of strings."
        );
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
      validateNonEmptyString(name, 'name');
      validateNonEmptyString(rules, 'rules');
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
      validateNonEmptyString(rules, 'rules');
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
      res.json(SessionManager.getOntology(req.params.name));
    } catch (err) {
      next(err);
    }
  },

  deleteOntology: (req, res, next) => {
    try {
      res.json(SessionManager.deleteOntology(req.params.name));
    } catch (err) {
      next(err);
    }
  },

  explainQueryAsync: async (req, res, next) => {
    try {
      const { sessionId } = req.params;
      const { query } = req.body;
      validateNonEmptyString(query, 'query');
      const currentSession = SessionManager.get(sessionId);
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
        'DEBUG_FORMAT_PROMPT_NO_TEMPLATE_NAME'
      );
      if (
        !inputVariables ||
        typeof inputVariables !== 'object' ||
        Array.isArray(inputVariables)
      ) {
        throw new ApiError(
          400,
          "Missing or invalid required field 'inputVariables'. Must be an object.",
          'DEBUG_FORMAT_PROMPT_NO_INPUT_VARIABLES'
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
    } catch (err) {
      next(err);
    }
  },

  _simplifyPrologResults(rawResults, loggerInstance) {
    if (rawResults.length === 0) {
      return 'No solution found.';
    }
    if (rawResults.length === 1 && rawResults[0] === 'true.') {
      return 'Yes.';
    }
    if (rawResults.length === 1 && rawResults[0] === 'false.') {
      return 'No.';
    }
    try {
      const processedResults = rawResults.map((r) =>
        r.includes('=') || typeof r !== 'string' ? r : JSON.parse(r)
      );

      if (processedResults.length === 1) {
        return processedResults[0];
      }
      return processedResults;
    } catch (e) {
      loggerInstance.warn(
        `Could not parse all Prolog results as JSON: ${rawResults}. Returning raw. Error: ${e.message}`,
        {
          internalErrorCode: 'PROLOG_RESULT_JSON_PARSE_FAILED',
          rawResults,
        }
      );
      return rawResults;
    }
  },
};

module.exports = ApiHandlers;
