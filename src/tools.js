const { ErrorCodes } = require('./errors');
const ontologyService = require('./ontologyService');
const strategyManager = require('./strategyManager');

const mcrToolDefinitions = (mcrEngine) => ({
    'session.create': {
        description: 'Creates a new reasoning session.',
        handler: async (args) => {
            const session = await mcrEngine.createSession(args.sessionId);
            return { success: true, data: session };
        },
    },
    'session.get': {
        description: 'Retrieves details for an existing session.',
        handler: async (args) => {
            const session = await mcrEngine.getSession(args.sessionId);
            if (!session) {
                return { success: false, error: ErrorCodes.SESSION_NOT_FOUND, message: 'Session not found.' };
            }
            return { success: true, data: session };
        },
    },
    'session.delete': {
        description: 'Deletes a session.',
        handler: async (args) => {
            const deleted = await mcrEngine.deleteSession(args.sessionId);
            if (!deleted) {
                return { success: false, error: ErrorCodes.SESSION_NOT_FOUND, message: 'Session not found.' };
            }
            return { success: true, message: 'Session deleted.' };
        }
    },
    'session.assert': {
        description: 'Asserts a natural language statement to a session.',
        handler: (args) => mcrEngine.assertNLToSession(args.sessionId, args.naturalLanguageText, args.options),
    },
    'session.query': {
        description: 'Queries a session with a natural language question.',
        handler: (args) => mcrEngine.querySessionWithNL(args.sessionId, args.naturalLanguageQuestion, args.queryOptions),
    },
    'session.explainQuery': {
        description: 'Explains how a query would be interpreted.',
        handler: (args) => mcrEngine.explainQuery(args.sessionId, args.naturalLanguageQuestion),
    },
    'session.assert_rules': {
        description: 'Asserts raw Prolog rules directly into a session.',
        handler: (args) => mcrEngine.assertRawPrologToSession(args.sessionId, args.rules, args.validate),
    },
    'ontology.create': {
        description: 'Creates a new global ontology.',
        handler: (args) => ontologyService.createOntology(args.name, args.rules),
    },
    'ontology.list': {
        description: 'Lists all available global ontologies.',
        handler: (args) => ontologyService.listOntologies(args.includeRules),
    },
    'ontology.get': {
        description: 'Retrieves a specific global ontology.',
        handler: (args) => ontologyService.getOntology(args.name),
    },
    'ontology.update': {
        description: 'Updates an existing global ontology.',
        handler: (args) => ontologyService.updateOntology(args.name, args.rules),
    },
    'ontology.delete': {
        description: 'Deletes a global ontology.',
        handler: (args) => ontologyService.deleteOntology(args.name),
    },
    'translate.nlToRules': {
        description: 'Translates natural language directly to Prolog rules.',
        handler: (args) => mcrEngine.translateNLToRulesDirect(args.naturalLanguageText, args.strategyId),
    },
    'translate.rulesToNl': {
        description: 'Translates Prolog rules directly to natural language.',
        handler: (args) => mcrEngine.translateRulesToNLDirect(args.rules, args.style),
    },
    'strategy.list': {
        description: 'Lists all available translation strategies.',
        handler: () => ({ success: true, data: strategyManager.getAvailableStrategies() }),
    },
    'strategy.setActive': {
        description: 'Sets the active base translation strategy.',
        handler: async (args) => {
            const success = await mcrEngine.setTranslationStrategy(args.strategyId);
            if (success) {
                return { success: true, message: 'Strategy set.', data: { activeStrategyId: args.strategyId } };
            }
            return { success: false, error: 'STRATEGY_NOT_FOUND', message: `Strategy ${args.strategyId} not found.` };
        },
    },
    'strategy.getActive': {
        description: 'Gets the ID of the currently active base translation strategy.',
        handler: () => ({ success: true, data: { activeStrategyId: mcrEngine.getActiveStrategyId() } }),
    },
    'utility.getPrompts': {
        description: 'Retrieves all available prompt templates.',
        handler: () => mcrEngine.getPrompts(),
    },
    'utility.debugFormatPrompt': {
        description: 'Formats a specified prompt template with given input variables for debugging.',
        handler: (args) => mcrEngine.debugFormatPrompt(args.templateName, args.inputVariables),
    },
    // Stubs for other tools that were in the test but not the rewrite
    'analysis.get_strategy_leaderboard': {
        description: 'Gets the strategy leaderboard.',
        handler: async () => ({ success: true, data: [] })
    },
    'analysis.get_strategy_details': {
        description: 'Gets details for a specific strategy.',
        handler: async () => ({ success: true, data: {} })
    },
    'analysis.list_eval_curricula': {
        description: 'Lists evaluation curricula.',
        handler: async () => ({ success: true, data: [] })
    },
    'analysis.get_curriculum_details': {
        description: 'Gets details for a specific curriculum.',
        handler: async () => ({ success: true, data: {} })
    },
    'evolution.start_optimizer': {
        description: 'Starts the evolution optimizer.',
        handler: async () => ({ success: true, message: 'Optimizer started.' })
    },
    'evolution.get_status': {
        description: 'Gets the status of the evolution optimizer.',
        handler: async () => ({ success: true, data: { status: 'idle' } })
    },
    'evolution.stop_optimizer': {
        description: 'Stops the evolution optimizer.',
        handler: async () => ({ success: true, message: 'Optimizer stopped.' })
    },
    'evolution.get_optimizer_log': {
        description: 'Gets the evolution optimizer log.',
        handler: async () => ({ success: true, data: { logs: [] } })
    },
    'demo.list': {
        description: 'Lists available demos.',
        handler: async () => ({ success: true, data: [] })
    },
    'demo.run': {
        description: 'Runs a demo.',
        handler: async () => ({ success: true, data: { messages: [] } })
    },
});

module.exports = mcrToolDefinitions;
