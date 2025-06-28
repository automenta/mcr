const SessionManager = require('./sessionManager');
const LlmService = require('./llmService');
const ReasonerService = require('./reasonerService');
const ApiError = require('./errors');
const logger = require('./logger').logger; // Ensure we get the logger object
const { version: appVersion, name: appName, description: appDescription } = require('../../package.json'); // Get app info

const ApiHandlers = {
    getRoot: (req, res) => res.json({
        status: "ok",
        name: appName || "Model Context Reasoner", // Fallback if not in package.json
        version: appVersion || "unknown",        // Fallback
        description: appDescription || "MCR API" // Fallback
    }),

    createSession: (req, res) => res.status(201).json(SessionManager.create()),

    getSession: (req, res, next) => {
        try {
            res.json(SessionManager.get(req.params.sessionId));
        } catch(err) { next(err); }
    },

    deleteSession: (req, res, next) => {
        try {
            SessionManager.delete(req.params.sessionId);
            res.json({ message: `Session ${req.params.sessionId} terminated.` });
        } catch(err) { next(err); }
    },

    assert: async (req, res, next) => {
        try {
            const { sessionId } = req.params;
            const { text } = req.body;
            if (!text || typeof text !== 'string' || text.trim() === '') {
                throw new ApiError(400, "Missing or invalid required field 'text'. Must be a non-empty string.");
            }
            const currentSession = SessionManager.get(sessionId);
            const currentFacts = currentSession.facts.join('\n');
            const ontologyContext = SessionManager.getNonSessionOntologyFacts(sessionId).join('\n');
            const newFacts = await LlmService.nlToRules(text, currentFacts, ontologyContext);
            SessionManager.addFacts(sessionId, newFacts);
            res.json({
                addedFacts: newFacts,
                totalFactsInSession: SessionManager.get(sessionId).factCount,
                metadata: { success: true }
            });
        } catch (err) { next(err); }
    },

    query: async (req, res, next) => {
        try {
            const { sessionId } = req.params;
            const { query, options = {}, ontology: requestOntology } = req.body;
            if (!query || typeof query !== 'string' || query.trim() === '') {
                 throw new ApiError(400, "Missing or invalid required field 'query'. Must be a non-empty string.");
            }
            const prologQuery = await LlmService.queryToProlog(query);
            logger.info(`Session ${sessionId}: Translated NL query to Prolog: "${prologQuery}"`);
            const facts = SessionManager.getFactsWithOntology(sessionId, requestOntology);
            let rawResults;
            try {
                rawResults = await ReasonerService.runQuery(facts, prologQuery);
            } catch (reasonerError) {
                logger.error(`Error running Prolog query: ${reasonerError.message}`);
                if (reasonerError.message.includes('Prolog syntax error') || reasonerError.message.includes('error(syntax_error')) {
                    throw new ApiError(400, `The LLM generated an invalid Prolog query. Please try rephrasing your question. Details: ${reasonerError.message}`);
                }
                throw reasonerError;
            }

            const simpleResult = ApiHandlers._simplifyPrologResults(rawResults, logger);

            logger.info(`Session ${sessionId}: Prolog query returned: ${JSON.stringify(simpleResult)}`);
            const finalAnswer = await LlmService.resultToNl(query, JSON.stringify(simpleResult), options.style);
            const response = {
                queryProlog: prologQuery, result: simpleResult, answer: finalAnswer,
                metadata: { success: true, steps: rawResults.length }
            };
            if (options.debug) {
                 const currentSessionDebug = SessionManager.get(sessionId);
                 // Get the prompt used for queryToProlog - this needs to be captured or reconstructed.
                 // For now, we'll just indicate the template name.
                 // Ideally, LlmService.queryToProlog would return { prologQuery, promptUsed }
                 // Or, we reconstruct the prompt here if PROMPT_TEMPLATES is accessible and input known.
                 // For simplicity, let's assume LlmService might be enhanced later or we log it there.
                 // The actual formatted prompt for queryToProlog is logged in LlmService if an error occurs.
                 // If no error, it's not directly available here without modification to LlmService.

                 // The prompt for resultToNl is also internal to LlmService.
                 // We can add the input to resultToNl here.
                response.debug = {
                    factsInSession: currentSessionDebug.facts,
                    ontologyContextUsed: SessionManager.getNonSessionOntologyFacts(sessionId), // Assuming this is what was implicitly used if no requestOntology
                    fullKnowledgeBaseSentToReasoner: facts, // This is what was actually sent
                    prologQueryGenerated: prologQuery,
                    rawReasonerResults: rawResults,
                    inputToNlAnswerGeneration: {
                        originalQuery: query,
                        simplifiedLogicResult: simpleResult,
                        style: options.style || 'conversational'
                    }
                };
                 logger.info(`Session ${sessionId}: Debug mode enabled for query.`, { correlationId: req.correlationId, debugData: response.debug });
            }
            res.json(response);
        } catch (err) { next(err); }
    },

    translateNlToRules: async (req, res, next) => {
        try {
            const { text, existing_facts = '', ontology_context = '' } = req.body;
            if (!text || typeof text !== 'string' || text.trim() === '') {
                throw new ApiError(400, "Missing or invalid required field 'text'. Must be a non-empty string.");
            }
            const rules = await LlmService.nlToRules(text, existing_facts, ontology_context);
            res.json({ rules });
        } catch (err) { next(err); }
    },

    translateRulesToNl: async (req, res, next) => {
        try {
            const { rules, style } = req.body;
            if (!rules || !Array.isArray(rules) || !rules.every(r => typeof r === 'string')) {
                throw new ApiError(400, "Missing or invalid 'rules' field; must be an array of strings.");
            }
            const text = await LlmService.rulesToNl(rules, style);
            res.json({ text });
        } catch (err) { next(err); }
    },

    addOntology: (req, res, next) => {
        try {
            const { name, rules } = req.body;
            if (!name || typeof name !== 'string' || name.trim() === '') {
                throw new ApiError(400, "Missing or invalid required field 'name'. Must be a non-empty string.");
            }
            if (!rules || typeof rules !== 'string' || rules.trim() === '') {
                throw new ApiError(400, "Missing or invalid required field 'rules'. Must be a non-empty string.");
            }
            const newOntology = SessionManager.addOntology(name, rules);
            res.status(201).json(newOntology);
        } catch (err) { next(err); }
    },

    updateOntology: (req, res, next) => {
        try {
            const { name } = req.params;
            const { rules } = req.body;
            if (!rules || typeof rules !== 'string' || rules.trim() === '') {
                throw new ApiError(400, "Missing or invalid required field 'rules'. Must be a non-empty string.");
            }
            const updatedOntology = SessionManager.updateOntology(name, rules);
            res.json(updatedOntology);
        } catch (err) { next(err); }
    },

    getOntologies: (req, res, next) => {
        try {
            res.json(SessionManager.getOntologies());
        } catch (err) { next(err); }
    },

    getOntology: (req, res, next) => {
        try {
            res.json(SessionManager.getOntology(req.params.name));
        } catch (err) { next(err); }
    },

    deleteOntology: (req, res, next) => {
        try {
            res.json(SessionManager.deleteOntology(req.params.name));
        } catch (err) { next(err); }
    },

    explainQuery: async (req, res, next) => {
        try {
            const { sessionId } = req.params;
            const { query } = req.body;
            if (!query || typeof query !== 'string' || query.trim() === '') {
                throw new ApiError(400, "Missing or invalid required field 'query'. Must be a non-empty string.");
            }
            const currentSession = SessionManager.get(sessionId);
            const facts = currentSession.facts;
            const ontologyContext = SessionManager.getNonSessionOntologyFacts(sessionId);
            const explanation = await LlmService.explainQuery(query, facts, ontologyContext);
            res.json({ query, explanation });
        } catch (err) { next(err); }
    },

    getPrompts: (req, res) => {
        res.json(LlmService.getPromptTemplates());
    },

    debugFormatPrompt: async (req, res, next) => {
        try {
            const { templateName, inputVariables } = req.body;

            if (!templateName || typeof templateName !== 'string' || templateName.trim() === '') {
                throw new ApiError(400, "Missing or invalid required field 'templateName'. Must be a non-empty string.", 'DEBUG_FORMAT_PROMPT_NO_TEMPLATE_NAME');
            }
            if (!inputVariables || typeof inputVariables !== 'object' || Array.isArray(inputVariables)) {
                throw new ApiError(400, "Missing or invalid required field 'inputVariables'. Must be an object.", 'DEBUG_FORMAT_PROMPT_NO_INPUT_VARIABLES');
            }

            const allTemplates = LlmService.getPromptTemplates(); // Get all raw templates
            const rawTemplate = allTemplates[templateName];

            if (!rawTemplate) {
                throw new ApiError(404, `Prompt template with name '${templateName}' not found.`, 'DEBUG_FORMAT_PROMPT_TEMPLATE_NOT_FOUND');
            }

            // Use Langchain's PromptTemplate for formatting, same as LlmService._invokeChain
            // This requires PromptTemplate to be available here.
            const { PromptTemplate } = require("@langchain/core/prompts");

            let formattedPrompt;
            try {
                const promptInstance = PromptTemplate.fromTemplate(rawTemplate);
                formattedPrompt = await promptInstance.format(inputVariables);
            } catch (error) {
                logger.warn("Error formatting prompt in debug endpoint.", {
                    internalErrorCode: 'DEBUG_FORMAT_PROMPT_FORMATTING_ERROR',
                    templateName,
                    inputVariables,
                    originalError: error.message,
                    stack: error.stack
                });
                // Provide a more specific error to the user if formatting fails due to missing keys, etc.
                throw new ApiError(400, `Error formatting prompt '${templateName}': ${error.message}. Check input variables.`, 'DEBUG_FORMAT_PROMPT_FORMATTING_FAILED');
            }

            res.json({
                templateName,
                rawTemplate,
                inputVariables,
                formattedPrompt
            });

        } catch (err) {
            next(err);
        }
    },

    // Helper function to simplify Prolog results
    _simplifyPrologResults(rawResults, loggerInstance) {
        if (rawResults.length === 0) {
            return "No solution found.";
        }
        if (rawResults.length === 1 && rawResults[0] === "true.") {
            return "Yes.";
        }
        if (rawResults.length === 1 && rawResults[0] === "false.") {
            return "No.";
        }
        try {
            // Attempt to parse results if they are not simple true/false and not assignments
            // Assignments (e.g., "X = john") are kept as strings.
            // Other results are assumed to be JSON-parseable (e.g., from findall/3).
            let processedResults = rawResults.map(r => (r.includes("=") || typeof r !== 'string') ? r : JSON.parse(r));

            // If after processing, it's a single-element array, return the element itself
            if (processedResults.length === 1) {
                return processedResults[0];
            }
            return processedResults;
        } catch (e) {
            loggerInstance.warn(`Could not parse all Prolog results as JSON: ${rawResults}. Returning raw. Error: ${e.message}`, {
                internalErrorCode: 'PROLOG_RESULT_JSON_PARSE_FAILED',
                rawResults
            });
            return rawResults; // Return raw if parsing fails
        }
    }
};

module.exports = ApiHandlers;