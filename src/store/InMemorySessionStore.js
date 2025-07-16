// src/InMemorySessionStore.js
const { v4: uuidv4 } = require('uuid');
const logger = require('../util/logger');
const ISessionStore = require('../interfaces/ISessionStore');
const KnowledgeGraph = require('../bridges/kgBridge');
const config = require('../config');

// In-memory store for sessions.
// Structure: { sessionId: { id: string, createdAt: Date, facts: string[], lexicon: Set<string> }, ... }
const sessions = {};

class InMemorySessionStore extends ISessionStore {
	constructor() {
		super();
		logger.info('[InMemorySessionStore] Initialized.');
	}

	/**
	 * Initializes the session store. No-op for in-memory.
	 * @returns {Promise<void>}
	 */
	async initialize() {
		// No-op for in-memory store
		logger.debug('[InMemorySessionStore] Initialize called (no-op).');
		return Promise.resolve();
	}

	/**
	 * Creates a new session.
	 * @param {string} [sessionIdInput] - Optional. The ID for the session.
	 * @returns {Promise<{id: string, createdAt: Date, facts: string[], lexicon: Set<string>}>} The created session object.
	 */
	async createSession(sessionIdInput) {
		const sessionId = sessionIdInput || uuidv4();
		if (sessions[sessionId]) {
			// This case should ideally be handled by the caller or based on specific requirements
			// For now, let's log a warning and return the existing session.
			// Or throw an error: throw new Error(`Session with ID ${sessionId} already exists.`);
			logger.warn(
				`[InMemorySessionStore] createSession called with an existing ID: ${sessionId}. Returning existing session.`
			);
			// Ensure the returned object matches the expected structure, including a Set for lexicon
			const existingSession = sessions[sessionId];
			return Promise.resolve({
				id: existingSession.id,
				createdAt: existingSession.createdAt,
				facts: [...existingSession.facts],
				lexicon: new Set(existingSession.lexicon), // Return a copy
				embeddings: existingSession.embeddings,
				kbGraph: existingSession.kbGraph,
			});
		}
		const session = {
			id: sessionId,
			createdAt: new Date(),
			facts: [], // Stores Prolog facts as strings
			lexicon: new Set(), // Stores predicate/arity strings e.g., "is_color/2"
			embeddings: new Map(),
			kbGraph: config.kgEnabled ? new KnowledgeGraph() : null,
		};
		sessions[sessionId] = session;
		logger.info(`[InMemorySessionStore] Session created: ${sessionId}`);
		// Return a copy, ensuring lexicon is also copied
		return Promise.resolve({
			id: session.id,
			createdAt: session.createdAt,
			facts: [...session.facts],
			lexicon: new Set(session.lexicon),
			embeddings: session.embeddings,
			kbGraph: session.kbGraph,
		});
	}

	/**
	 * Retrieves a session by its ID.
	 * @param {string} sessionId - The ID of the session.
	 * @returns {Promise<{id: string, createdAt: Date, facts: string[], lexicon: Set<string>}|null>} The session object or null if not found.
	 */
	async getSession(sessionId) {
		if (!sessions[sessionId]) {
			logger.warn(`[InMemorySessionStore] Session not found: ${sessionId}`);
			return Promise.resolve(null);
		}
		const session = sessions[sessionId];
		// Return a copy
		return Promise.resolve({
			id: session.id,
			createdAt: session.createdAt,
			facts: [...session.facts],
			lexicon: new Set(session.lexicon), // Return a copy of the Set
			embeddings: session.embeddings,
			kbGraph: session.kbGraph,
		});
	}

	/**
	 * Adds facts to a session.
	 * @param {string} sessionId - The ID of the session.
	 * @param {string[]} newFacts - An array of Prolog fact strings to add.
	 * @returns {Promise<boolean>} True if facts were added, false if session not found or facts invalid.
	 */
	async addFacts(sessionId, newFacts) {
		if (!sessions[sessionId]) {
			logger.warn(
				`[InMemorySessionStore] Cannot add facts: Session not found: ${sessionId}`
			);
			return Promise.resolve(false);
		}
		if (
			!Array.isArray(newFacts) ||
			!newFacts.every(f => typeof f === 'string')
		) {
			logger.warn(
				`[InMemorySessionStore] Cannot add facts: newFacts must be an array of strings. Session: ${sessionId}`
			);
			return Promise.resolve(false);
		}

		const validatedFacts = newFacts
			.map(f => String(f).trim())
			.filter(f => f.length > 0 && f.endsWith('.'));

		if (validatedFacts.length !== newFacts.length) {
			logger.warn(
				`[InMemorySessionStore] Some facts were invalid (empty or not ending with '.') and were not added to session ${sessionId}.`
			);
		}

		this._updateLexiconWithFacts(sessionId, validatedFacts);

		sessions[sessionId].facts.push(...validatedFacts);
		logger.info(
			`[InMemorySessionStore] ${validatedFacts.length} facts added to session: ${sessionId}. Total facts: ${sessions[sessionId].facts.length}. Lexicon size: ${sessions[sessionId].lexicon.size}`
		);
		return Promise.resolve(true);
	}

	/**
	 * Helper function to parse facts and update the session's lexicon.
	 * @param {string} sessionId - The ID of the session.
	 * @param {string[]} facts - An array of Prolog fact strings.
	 */
	_updateLexiconWithFacts(sessionId, facts) {
		// Made this a private-like method
		if (!sessions[sessionId]) return;

		facts.forEach(fact => {
			const cleanFact = fact.replace(/%.*$/, '').trim();
			if (!cleanFact.endsWith('.')) return;

			let termToParse = cleanFact;
			const ruleMatch = cleanFact.match(/^(.*?):-(.*)\.$/);
			if (ruleMatch) {
				termToParse = ruleMatch[1].trim();
			} else {
				termToParse = cleanFact.slice(0, -1).trim();
			}

			const structuredTermMatch = termToParse.match(
				/^([a-z_][a-zA-Z0-9_]*)\((.*)\)$/
			);

			if (structuredTermMatch) {
				const predicate = structuredTermMatch[1];
				const argsString = structuredTermMatch[2];
				let arity = 0;
				if (argsString.trim() !== '') {
					const potentialArgs = argsString.match(
						/(?:[^,(]|\([^)]*\)|'[^']*')+/g
					);
					arity = potentialArgs ? potentialArgs.length : 0;
				}
				sessions[sessionId].lexicon.add(`${predicate}/${arity}`);
			} else {
				const simpleAtomMatch = termToParse.match(/^([a-z_][a-zA-Z0-9_]*)$/);
				if (simpleAtomMatch) {
					const predicate = simpleAtomMatch[1];
					sessions[sessionId].lexicon.add(`${predicate}/0`);
				} else {
					logger.debug(
						// Keep this log less verbose for general use
						`[InMemorySessionStore] Could not parse predicate/arity from term: ${termToParse} in session ${sessionId}`
					);
				}
			}
		});
	}

	/**
	 * Retrieves all facts for a given session as a single string.
	 * @param {string} sessionId - The ID of the session.
	 * @returns {Promise<string|null>} A string containing all Prolog facts or null if session not found.
	 */
	async getKnowledgeBase(sessionId) {
		const session = sessions[sessionId];
		if (!session) {
			logger.warn(
				`[InMemorySessionStore] Cannot get knowledge base: Session not found: ${sessionId}`
			);
			return Promise.resolve(null);
		}
		return Promise.resolve(session.facts.join('\n'));
	}

	/**
	 * Deletes a session.
	 * @param {string} sessionId - The ID of the session to delete.
	 * @returns {Promise<boolean>} True if the session was deleted, false if not found.
	 */
	async deleteSession(sessionId) {
		if (!sessions[sessionId]) {
			logger.warn(
				`[InMemorySessionStore] Cannot delete session: Session not found: ${sessionId}`
			);
			return Promise.resolve(false);
		}
		delete sessions[sessionId];
		logger.info(`[InMemorySessionStore] Session deleted: ${sessionId}`);
		return Promise.resolve(true);
	}

	/**
	 * Retrieves a summary of the lexicon for a given session.
	 * @param {string} sessionId - The ID of the session.
	 * @returns {Promise<string|null>} A string representing the lexicon summary or null if session not found.
	 */
	async getLexiconSummary(sessionId) {
		const session = sessions[sessionId];
		if (!session) {
			logger.warn(
				`[InMemorySessionStore] Cannot get lexicon summary: Session not found: ${sessionId}`
			);
			return Promise.resolve(null);
		}
		if (session.lexicon.size === 0) {
			return Promise.resolve(
				"No specific predicates identified in the current session's knowledge base yet."
			);
		}
		const sortedLexicon = Array.from(session.lexicon).sort();
		return Promise.resolve(
			`Known Predicates (name/arity):\n- ${sortedLexicon.join('\n- ')}`
		);
	}

	/**
	 * Cleans up resources. No-op for in-memory.
	 * @returns {Promise<void>}
	 */
	async close() {
		// No-op for in-memory store
		logger.debug('[InMemorySessionStore] Close called (no-op).');
		return Promise.resolve();
	}

	/**
	 * Lists all available sessions.
	 * @returns {Promise<Array<{id: string, createdAt: Date}>>} An array of simplified session objects.
	 */
	async listSessions() {
		const sessionList = Object.values(sessions).map(session => ({
			id: session.id,
			createdAt: session.createdAt,
		}));
		logger.debug(
			`[InMemorySessionStore] Listed ${sessionList.length} sessions.`
		);
		return Promise.resolve(sessionList);
	}
}

// For direct use if only one store type is configured, or for factory selection.
// We will later modify mcrService to pick a store based on config.
// For now, to keep things simple and allow existing imports of 'sessionManager' to resolve to *something*
// that has a similar API, we can export an instance. This will need to be updated.
// module.exports = new InMemorySessionStore();
// Better: export the class itself so it can be instantiated by a factory/manager
module.exports = InMemorySessionStore;
