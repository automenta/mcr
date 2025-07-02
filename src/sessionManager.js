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
  };
  sessions[sessionId] = session;
  logger.info(`Session created: ${sessionId}`);
  return { ...session }; // Return a copy
}

/**
 * Retrieves a session by its ID.
 * @param {string} sessionId - The ID of the session.
 * @returns {{id: string, createdAt: Date, facts: string[]}|null} The session object or null if not found.
 */
function getSession(sessionId) {
  if (!sessions[sessionId]) {
    logger.warn(`Session not found: ${sessionId}`);
    return null;
  }
  return { ...sessions[sessionId] }; // Return a copy
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
    .map((f) => f.trim())
    .filter((f) => f.length > 0);
  const invalidFacts = validatedFacts.filter((f) => !f.endsWith('.'));
  if (invalidFacts.length > 0) {
    logger.warn(
      `Some facts do not end with a period and were not added. Session: ${sessionId}`,
      { invalidFacts }
    );
    // Optionally, filter out invalid facts or reject the whole batch
    // For now, let's be strict and reject if any are malformed for simplicity
    // return false;
  }

  sessions[sessionId].facts.push(...validatedFacts);
  logger.info(
    `${validatedFacts.length} facts added to session: ${sessionId}. Total facts: ${sessions[sessionId].facts.length}`
  );
  return true;
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
  deleteSession, // Added delete functionality as it's standard for session management
};
