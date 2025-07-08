// new/src/sessionManager.js
const { v4: uuidv4 } = require('uuid');
const logger = require('./logger');

// In-memory store for sessions.
// Structure: { sessionId: { id: string, createdAt: Date, facts: string[] }, ... }
const sessions = {};

/**
 * Creates a new session.
 * @returns {{id: string, createdAt: Date, facts: string[]}} The created session object.
 */
function createSession() {
  const sessionId = uuidv4();
  const session = {
    id: sessionId,
    createdAt: new Date(),
    facts: [], // Stores Prolog facts as strings
    lexicon: new Set(), // Stores predicate/arity strings e.g., "is_color/2"
  };
  sessions[sessionId] = session;
  logger.info(`Session created: ${sessionId}`);
  // Return a copy, ensuring lexicon is also copied if it's to be exposed directly
  // For now, getSession will not expose lexicon directly, only through getLexiconSummary
  return {
    id: session.id,
    createdAt: session.createdAt,
    facts: [...session.facts],
  };
}

/**
 * Retrieves a session by its ID (excluding lexicon for direct external access).
 * @param {string} sessionId - The ID of the session.
 * @returns {{id: string, createdAt: Date, facts: string[]}|null} The session object or null if not found.
 */
function getSession(sessionId) {
  if (!sessions[sessionId]) {
    logger.warn(`Session not found: ${sessionId}`);
    return null;
  }
  const session = sessions[sessionId];
  // Return a copy, excluding direct lexicon access from this general getter
  return {
    id: session.id,
    createdAt: session.createdAt,
    facts: [...session.facts],
  };
}

/**
 * Adds facts to a session. Facts are expected to be an array of strings.
 * Each string is a Prolog fact/rule ending with a period.
 * @param {string} sessionId - The ID of the session.
 * @param {string[]} newFacts - An array of Prolog fact strings to add.
 * @returns {boolean} True if facts were added, false if session not found or facts invalid.
 */
function addFacts(sessionId, newFacts) {
  if (!sessions[sessionId]) {
    logger.warn(`Cannot add facts: Session not found: ${sessionId}`);
    return false;
  }
  if (
    !Array.isArray(newFacts) ||
    !newFacts.every((f) => typeof f === 'string')
  ) {
    logger.warn(
      `Cannot add facts: newFacts must be an array of strings. Session: ${sessionId}`
    );
    return false;
  }

  // Basic validation: ensure facts end with a period.
  const validatedFacts = newFacts
    .map((f) => String(f).trim())
    .filter((f) => f.length > 0 && f.endsWith('.'));

  if (validatedFacts.length !== newFacts.length) {
    logger.warn(
      `[SessionManager] Some facts were invalid (empty or not ending with '.') and were not added to session ${sessionId}.`
    );
  }

  // Update lexicon before adding facts
  _updateLexiconWithFacts(sessionId, validatedFacts);

  sessions[sessionId].facts.push(...validatedFacts);
  logger.info(
    `${validatedFacts.length} facts added to session: ${sessionId}. Total facts: ${sessions[sessionId].facts.length}. Lexicon size: ${sessions[sessionId].lexicon.size}`
  );
  return true;
}

/**
 * Helper function to parse facts and update the session's lexicon.
 * This is a simplified parser. A robust Prolog parser would be more accurate.
 * @param {string} sessionId - The ID of the session.
 * @param {string[]} facts - An array of Prolog fact strings.
 */
function _updateLexiconWithFacts(sessionId, facts) {
  if (!sessions[sessionId]) return;

  facts.forEach((fact) => {
    // Remove comments and trim
    const cleanFact = fact.replace(/%.*$/, '').trim();
    if (!cleanFact.endsWith('.')) return; // Ensure it's a complete clause

    let termToParse = cleanFact;

    // Check if it's a rule (contains ':-')
    const ruleMatch = cleanFact.match(/^(.*?):-(.*)\.$/);
    if (ruleMatch) {
      termToParse = ruleMatch[1].trim(); // Parse only the head of the rule
      // We could also parse predicates from ruleMatch[2] (the body) if desired in the future
    } else {
      // It's a fact, remove the trailing period for parsing
      termToParse = cleanFact.slice(0, -1).trim();
    }

    // Attempt to match predicate and arguments for terms like predicate(...).
    const structuredTermMatch = termToParse.match(
      /^([a-z_][a-zA-Z0-9_]*)\((.*)\)$/
    );

    if (structuredTermMatch) {
      const predicate = structuredTermMatch[1];
      const argsString = structuredTermMatch[2];

      let arity = 0;
      if (argsString.trim() !== '') {
        // Heuristic for counting arguments: splits by comma, but tries to respect commas within quotes or parentheses.
        // This is not a full parser and will have limitations with deeply nested structures or complex terms.
        const potentialArgs = argsString.match(/(?:[^,(]|\([^)]*\)|'[^']*')+/g);
        arity = potentialArgs ? potentialArgs.length : 0;
      }
      sessions[sessionId].lexicon.add(`${predicate}/${arity}`);
      logger.debug(
        `[LexiconUpdate] Added ${predicate}/${arity} from structured term: ${termToParse}`
      );
    } else {
      // Handle simple atoms (facts or rule heads without parentheses, arity 0)
      // e.g., 'is_raining.' or 'system_initialized :- true.' (head is 'system_initialized')
      const simpleAtomMatch = termToParse.match(/^([a-z_][a-zA-Z0-9_]*)$/);
      if (simpleAtomMatch) {
        const predicate = simpleAtomMatch[1];
        sessions[sessionId].lexicon.add(`${predicate}/0`);
        logger.debug(
          `[LexiconUpdate] Added ${predicate}/0 from simple atom: ${termToParse}`
        );
      } else {
        logger.debug(
          `[LexiconUpdate] Could not parse predicate/arity from term: ${termToParse} (original: ${fact})`
        );
      }
    }
  });
}

/**
 * Retrieves all facts for a given session as a single string.
 * @param {string} sessionId - The ID of the session.
 * @returns {string|null} A string containing all Prolog facts (newline-separated) or null if session not found.
 */
function getKnowledgeBase(sessionId) {
  const session = sessions[sessionId];
  if (!session) {
    logger.warn(`Cannot get knowledge base: Session not found: ${sessionId}`);
    return null;
  }
  return session.facts.join('\n');
}

/**
 * Deletes a session.
 * @param {string} sessionId - The ID of the session to delete.
 * @returns {boolean} True if the session was deleted, false if not found.
 */
function deleteSession(sessionId) {
  if (!sessions[sessionId]) {
    logger.warn(`Cannot delete session: Session not found: ${sessionId}`);
    return false;
  }
  delete sessions[sessionId];
  logger.info(`Session deleted: ${sessionId}`);
  return true;
}

module.exports = {
  createSession,
  getSession,
  addFacts,
  getKnowledgeBase,
  deleteSession,
  getLexiconSummary, // Expose the new function
};

/**
 * Retrieves a summary of the lexicon for a given session.
 * @param {string} sessionId - The ID of the session.
 * @returns {string|null} A string representing the lexicon summary or null if session not found.
 */
function getLexiconSummary(sessionId) {
  const session = sessions[sessionId];
  if (!session) {
    logger.warn(`Cannot get lexicon summary: Session not found: ${sessionId}`);
    return null;
  }
  if (session.lexicon.size === 0) {
    return "No specific predicates identified in the current session's knowledge base yet.";
  }
  // Sort for consistent output, helpful for prompts and testing
  const sortedLexicon = Array.from(session.lexicon).sort();
  return `Known Predicates (name/arity):\n- ${sortedLexicon.join('\n- ')}`;
}
