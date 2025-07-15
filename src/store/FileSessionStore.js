// src/FileSessionStore.js
const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const logger = require('../util/logger');
const ISessionStore = require('../interfaces/ISessionStore');
const config = require('../config'); // To get the session file path
const KnowledgeGraph = require('../bridges/kgBridge');

class FileSessionStore extends ISessionStore {
  constructor() {
    super();
    this.sessionsDir = config.sessionStore?.filePath || './.sessions';
    logger.info(
      `[FileSessionStore] Initialized. Sessions directory: ${this.sessionsDir}`
    );
  }

  /**
   * Initializes the session store by ensuring the sessions directory exists.
   * @returns {Promise<void>}
   */
  async initialize() {
    try {
      await fs.mkdir(this.sessionsDir, { recursive: true });
      logger.info(
        `[FileSessionStore] Sessions directory ensured: ${this.sessionsDir}`
      );
    } catch (error) {
      logger.error(
        `[FileSessionStore] Failed to create sessions directory ${this.sessionsDir}:`,
        error
      );
      throw error; // Re-throw to indicate initialization failure
    }
  }

  _getFilePath(sessionId) {
    return path.join(this.sessionsDir, `${sessionId}.json`);
  }

  async _readSessionFile(sessionId) {
    try {
      const filePath = this._getFilePath(sessionId);
      const data = await fs.readFile(filePath, 'utf8');
      const sessionData = JSON.parse(data);
      // Convert lexicon array back to Set
      if (sessionData.lexicon && Array.isArray(sessionData.lexicon)) {
        sessionData.lexicon = new Set(sessionData.lexicon);
      } else {
        sessionData.lexicon = new Set(); // Ensure lexicon is always a Set
      }
      // Convert createdAt string back to Date object
      if (sessionData.createdAt) {
        sessionData.createdAt = new Date(sessionData.createdAt);
      }
      // Deserialize kbGraph
      if (sessionData.kbGraph) {
        const kb = new KnowledgeGraph();
        kb.fromJSON(sessionData.kbGraph);
        sessionData.kbGraph = kb;
      }
      // Deserialize embeddings
      if (sessionData.embeddings && Array.isArray(sessionData.embeddings)) {
        sessionData.embeddings = new Map(sessionData.embeddings);
      } else {
        sessionData.embeddings = new Map();
      }
      return sessionData;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return null; // File not found, so session doesn't exist
      }
      logger.error(
        `[FileSessionStore] Error reading session file for ${sessionId}:`,
        error
      );
      throw error;
    }
  }

  async _writeSessionFile(sessionId, sessionData) {
    try {
      const filePath = this._getFilePath(sessionId);
      // Convert lexicon Set to array for JSON serialization
      const dataToStore = { ...sessionData };
      if (dataToStore.lexicon instanceof Set) {
        dataToStore.lexicon = Array.from(dataToStore.lexicon);
      }
      // Ensure createdAt is stored in ISO string format
      if (dataToStore.createdAt instanceof Date) {
        dataToStore.createdAt = dataToStore.createdAt.toISOString();
      }
      // Serialize kbGraph
      if (dataToStore.kbGraph) {
        dataToStore.kbGraph = dataToStore.kbGraph.toJSON();
      }
      // Serialize embeddings
      if (dataToStore.embeddings instanceof Map) {
        dataToStore.embeddings = Array.from(dataToStore.embeddings.entries());
      }
      await fs.writeFile(
        filePath,
        JSON.stringify(dataToStore, null, 2),
        'utf8'
      );
    } catch (error) {
      logger.error(
        `[FileSessionStore] Error writing session file for ${sessionId}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Creates a new session.
   * @param {string} [sessionIdInput] - Optional. The ID for the session.
   * @returns {Promise<{id: string, createdAt: Date, facts: string[], lexicon: Set<string>}>} The created session object.
   */
  async createSession(sessionIdInput) {
    const sessionId = sessionIdInput || uuidv4();
    const filePath = this._getFilePath(sessionId);

    try {
      // Check if session file already exists to prevent overwriting
      await fs.access(filePath);
      // If access doesn't throw, file exists. This might be an issue if sessionIdInput is reused.
      logger.warn(
        `[FileSessionStore] Session file ${filePath} already exists for ID: ${sessionId}. Reading existing session.`
      );
      const existingSession = await this._readSessionFile(sessionId);
      if (existingSession) return existingSession; // Should always return if file exists
      // This path should ideally not be reached if file exists and is readable
      throw new Error(`Session file ${filePath} exists but could not be read.`);
    } catch (error) {
      // If error is ENOENT, file does not exist, which is good for creation
      if (error.code !== 'ENOENT') {
        logger.error(
          `[FileSessionStore] Error checking existence of session file ${filePath}:`,
          error
        );
        throw error; // Other error during access check
      }
    }

    const session = {
      id: sessionId,
      createdAt: new Date(),
      facts: [],
      lexicon: new Set(),
      embeddings: new Map(),
      kbGraph: config.kgEnabled ? new KnowledgeGraph() : null,
    };
    await this._writeSessionFile(sessionId, session);
    logger.info(
      `[FileSessionStore] Session created and file written: ${filePath}`
    );
    // Return a deep copy with lexicon as a Set for consistency with interface
    return {
      ...session,
      lexicon: new Set(session.lexicon), // Ensure it's a new Set instance
    };
  }

  /**
   * Retrieves a session by its ID.
   * @param {string} sessionId - The ID of the session.
   * @returns {Promise<{id: string, createdAt: Date, facts: string[], lexicon: Set<string>}|null>} The session object or null if not found.
   */
  async getSession(sessionId) {
    const sessionData = await this._readSessionFile(sessionId);
    if (sessionData) {
      logger.debug(`[FileSessionStore] Session retrieved: ${sessionId}`);
      return sessionData;
    }
    logger.warn(`[FileSessionStore] Session not found: ${sessionId}`);
    return null;
  }

  /**
   * Adds facts to a session.
   * @param {string} sessionId - The ID of the session.
   * @param {string[]} newFacts - An array of Prolog fact strings to add.
   * @returns {Promise<boolean>} True if facts were added, false if session not found or facts invalid.
   */
  async addFacts(sessionId, newFacts) {
    const sessionData = await this._readSessionFile(sessionId);
    if (!sessionData) {
      logger.warn(
        `[FileSessionStore] Cannot add facts: Session not found: ${sessionId}`
      );
      return false;
    }
    if (
      !Array.isArray(newFacts) ||
      !newFacts.every(f => typeof f === 'string')
    ) {
      logger.warn(
        `[FileSessionStore] Cannot add facts: newFacts must be an array of strings. Session: ${sessionId}`
      );
      return false;
    }

    const validatedFacts = newFacts
      .map(f => String(f).trim())
      .filter(f => f.length > 0 && f.endsWith('.'));

    if (validatedFacts.length !== newFacts.length) {
      logger.warn(
        `[FileSessionStore] Some facts were invalid and were not added to session ${sessionId}.`
      );
    }

    sessionData.facts.push(...validatedFacts);
    this._updateLexiconWithFacts(sessionData, validatedFacts); // Pass sessionData object to update its lexicon

    await this._writeSessionFile(sessionId, sessionData);
    logger.info(
      `[FileSessionStore] ${validatedFacts.length} facts added to session: ${sessionId}. Total facts: ${sessionData.facts.length}. Lexicon size: ${sessionData.lexicon.size}`
    );
    return true;
  }

  // Lexicon update logic (similar to InMemorySessionStore, but operates on the passed sessionData object)
  _updateLexiconWithFacts(sessionData, facts) {
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
        sessionData.lexicon.add(`${predicate}/${arity}`);
      } else {
        const simpleAtomMatch = termToParse.match(/^([a-z_][a-zA-Z0-9_]*)$/);
        if (simpleAtomMatch) {
          sessionData.lexicon.add(`${simpleAtomMatch[1]}/0`);
        } else {
          logger.debug(
            `[FileSessionStore] Could not parse predicate/arity from term: ${termToParse} in session ${sessionData.id}`
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
    const sessionData = await this._readSessionFile(sessionId);
    if (!sessionData) {
      logger.warn(
        `[FileSessionStore] Cannot get knowledge base: Session not found: ${sessionId}`
      );
      return null;
    }
    return sessionData.facts.join('\n');
  }

  /**
   * Deletes a session file.
   * @param {string} sessionId - The ID of the session to delete.
   * @returns {Promise<boolean>} True if the session file was deleted, false if not found.
   */
  async deleteSession(sessionId) {
    const filePath = this._getFilePath(sessionId);
    try {
      await fs.unlink(filePath);
      logger.info(`[FileSessionStore] Session file deleted: ${filePath}`);
      return true;
    } catch (error) {
      if (error.code === 'ENOENT') {
        logger.warn(
          `[FileSessionStore] Cannot delete session: File not found: ${filePath}`
        );
        return false;
      }
      logger.error(
        `[FileSessionStore] Error deleting session file ${filePath}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Retrieves a summary of the lexicon for a given session.
   * @param {string} sessionId - The ID of the session.
   * @returns {Promise<string|null>} A string representing the lexicon summary or null if session not found.
   */
  async getLexiconSummary(sessionId) {
    const sessionData = await this._readSessionFile(sessionId);
    if (!sessionData) {
      logger.warn(
        `[FileSessionStore] Cannot get lexicon summary: Session not found: ${sessionId}`
      );
      return null;
    }
    if (sessionData.lexicon.size === 0) {
      return "No specific predicates identified in the current session's knowledge base yet.";
    }
    const sortedLexicon = Array.from(sessionData.lexicon).sort();
    return `Known Predicates (name/arity):\n- ${sortedLexicon.join('\n- ')}`;
  }

  /**
   * Closes the session store. No specific action needed for file store unless there are open handles.
   * @returns {Promise<void>}
   */
  async close() {
    logger.debug('[FileSessionStore] Close called (no-op).');
    return Promise.resolve();
  }
}

module.exports = FileSessionStore;
