// src/interfaces/ISessionStore.js

/**
 * @interface ISessionStore
 * Defines the contract for session storage implementations.
 * All methods should be asynchronous if they involve I/O, returning Promises.
 */
class ISessionStore {
	/**
	 * Initializes the session store. This can be used for setup tasks like
	 * connecting to a database or ensuring a directory exists for file-based storage.
	 * @returns {Promise<void>}
	 */
	async initialize() {
		throw new Error('Method "initialize()" must be implemented.');
	}

	/**
	 * Creates a new session, optionally with a predefined session ID.
	 * If no sessionId is provided, a new unique ID should be generated.
	 * @param {string} [_sessionId] - Optional. The ID for the session.
	 * @returns {Promise<{id: string, createdAt: Date, facts: string[], lexicon: Set<string>}>} The created session object.
	 * Note: The returned 'facts' and 'lexicon' might be empty initially.
	 * The lexicon should be a Set of strings in "predicate/arity" format.
	 */
	async createSession(_sessionId) {
		throw new Error('Method "createSession(_sessionId)" must be implemented.');
	}

	/**
	 * Retrieves a session by its ID.
	 * @param {string} _sessionId - The ID of the session.
	 * @returns {Promise<{id: string, createdAt: Date, facts: string[], lexicon: Set<string>}|null>} The session object or null if not found.
	 * The lexicon should be a Set of strings in "predicate/arity" format.
	 */
	async getSession(_sessionId) {
		throw new Error('Method "getSession(_sessionId)" must be implemented.');
	}

	/**
	 * Adds facts to a session. Facts are expected to be an array of strings.
	 * Each string is a Prolog fact/rule ending with a period.
	 * This method should also handle updating the session's lexicon based on the added facts.
	 * @param {string} _sessionId - The ID of the session.
	 * @param {string[]} _newFacts - An array of Prolog fact strings to add.
	 * @returns {Promise<boolean>} True if facts were added, false if session not found or facts invalid.
	 */
	async addFacts(_sessionId, _newFacts) {
		throw new Error(
			'Method "addFacts(_sessionId, _newFacts)" must be implemented.'
		);
	}

	/**
	 * Retrieves all facts for a given session as a single string, with facts separated by newlines.
	 * @param {string} _sessionId - The ID of the session.
	 * @returns {Promise<string|null>} A string containing all Prolog facts or null if session not found.
	 */
	async getKnowledgeBase(_sessionId) {
		throw new Error(
			'Method "getKnowledgeBase(_sessionId)" must be implemented.'
		);
	}

	/**
	 * Deletes a session.
	 * @param {string} _sessionId - The ID of the session to delete.
	 * @returns {Promise<boolean>} True if the session was deleted, false if not found.
	 */
	async deleteSession(_sessionId) {
		throw new Error('Method "deleteSession(_sessionId)" must be implemented.');
	}

	/**
	 * Retrieves a summary of the lexicon for a given session.
	 * @param {string} _sessionId - The ID of the session.
	 * @returns {Promise<string|null>} A string representing the lexicon summary (e.g., "Known Predicates (name/arity):\n- is_a/2\n- mortal/1") or null if session not found.
	 */
	async getLexiconSummary(_sessionId) {
		throw new Error(
			'Method "getLexiconSummary(sessionId)" must be implemented.'
		);
	}

	/**
	 * Cleans up resources used by the session store, if any.
	 * This could be closing database connections, etc.
	 * @returns {Promise<void>}
	 */
	async close() {
		throw new Error('Method "close()" must be implemented.');
	}
}

module.exports = ISessionStore;
