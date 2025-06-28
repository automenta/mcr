

const SessionManager = require('./sessionManager');
const LlmService = require('./llmService');
const ReasonerService = require('./reasonerService');
const ApiError = require('./errors');
const logger = require('./logger');

const ApiHandlers = {
    getRoot: (req, res) => res.json({ status: "ok", name: "Model Context Reasoner", version: "2.0.0", description: "MCR API" }),

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
            const currentSession = SessionManager.get(sessionId); // Ensures session exists
            const currentFacts = currentSession.facts.join('\n');
            const ontologyContext = SessionManager.getFactsWithOntology(sessionId).filter(f => !currentSession.facts.includes(f)).join('\n');
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
            const { query, options = {} } = req.body;
            if (!query || typeof query !== 'string' || query.trim() === '') {
                 throw new ApiError(400, "Missing or invalid required field 'query'. Must be a non-empty string.");
            }
            const prologQuery = await LlmService.queryToProlog(query);
            logger.info(`Session ${sessionId}: Translated NL query to Prolog: "${prologQuery}"`);
            const facts = SessionManager.getFactsWithOntology(sessionId);
            const rawResults = await ReasonerService.runQuery(facts, prologQuery);
            let simpleResult;
            if (rawResults.length === 0) {
                simpleResult = "No solution found.";
            } else if (rawResults.length === 1 && rawResults[0] === "true.") {
                simpleResult = "Yes.";
            } else if (rawResults.length === 1 && rawResults[0] === "false.") {
                simpleResult = "No.";
            } else {
                try {
                    simpleResult = rawResults.map(r => r.includes("=") ? r : JSON.parse(r));
                    if (simpleResult.length === 1) simpleResult = simpleResult[0];
                } catch (e) {
                    logger.warn(`Could not parse all Prolog results as JSON: ${rawResults}. Returning raw.`);
                    simpleResult = rawResults;
                }
            }
            logger.info(`Session ${sessionId}: Prolog query returned: ${JSON.stringify(simpleResult)}`);
            const finalAnswer = await LlmService.resultToNl(query, JSON.stringify(simpleResult), options.style);
            const response = {
                queryProlog: prologQuery, result: simpleResult, answer: finalAnswer,
                metadata: { success: true, steps: rawResults.length }
            };
            if (options.debug) {
                 const currentSessionDebug = SessionManager.get(sessionId);
                 response.debug = {
                    factsInSession: currentSessionDebug.facts,
                    ontologyApplied: SessionManager.getFactsWithOntology(sessionId).filter(f => !currentSessionDebug.facts.includes(f))
                 };
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
            const ontologyContext = SessionManager.getFactsWithOntology(sessionId).filter(f => !currentSession.facts.includes(f));
            const explanation = await LlmService.explainQuery(query, facts, ontologyContext);
            res.json({ query, explanation });
        } catch (err) { next(err); }
    }
};

module.exports = ApiHandlers;
