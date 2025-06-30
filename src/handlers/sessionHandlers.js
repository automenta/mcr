const SessionManager = require('../sessionManager');
const LlmService = require('../llmService');
const { logger } = require('../logger');
const { validateNonEmptyString } = require('./handlerUtils');

const sessionHandlers = {
  createSession: (req, res, next) => {
    let session;
    try {
      logger.debug(
        'Attempting SessionManager.create() in createSession handler'
      );
      session = SessionManager.create();
      logger.debug('SessionManager.create() successful', {
        sessionId: session ? session.sessionId : 'undefined',
      });

      if (!session) {
        logger.error(
          'SessionManager.create() returned undefined/null unexpectedly.'
        );
        throw new Error('SessionManager.create() returned undefined/null.');
      }

      logger.debug('Attempting res.status(201).json(session)');
      res.status(201).json(session);
      logger.debug('res.status(201).json(session) completed');
    } catch (err) {
      logger.error('Error in createSession handler (explicit catch)', {
        error: err,
        stack: err.stack,
        isApiError: err instanceof require('../errors'),
        sessionObject: session,
      });
      next(err);
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
};

module.exports = sessionHandlers;
