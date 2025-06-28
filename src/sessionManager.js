const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const { logger } = require('./logger'); // Corrected import
const ApiError = require('./errors');
const ConfigManager = require('./config');

/**
 * @typedef {object} Session
 * @property {string} sessionId - Unique identifier for the session.
 * @property {string} createdAt - ISO string timestamp of when the session was created.
 * @property {string[]} facts - Array of Prolog facts asserted in the session.
 * @property {number} factCount - Number of facts in the session.
 */

/**
 * @typedef {object} Ontology
 * @property {string} name - The name of the ontology.
 * @property {string} rules - The Prolog rules defining the ontology.
 */

const config = ConfigManager.load();
const sessionStoragePath = path.resolve(config.session.storagePath);
const ontologyStoragePath = path.resolve(
  config.ontology.storagePath || './ontologies'
);

if (!fs.existsSync(sessionStoragePath)) {
  fs.mkdirSync(sessionStoragePath, { recursive: true });
  logger.info(`Created session storage directory: ${sessionStoragePath}`);
}

if (!fs.existsSync(ontologyStoragePath)) {
  fs.mkdirSync(ontologyStoragePath, { recursive: true });
  logger.info(`Created ontology storage directory: ${ontologyStoragePath}`);
}

const SessionManager = {
  _sessions: {},
  _ontologies: {},

  _parseOntologyRules(rulesString) {
    if (!rulesString || typeof rulesString !== 'string') return [];
    return rulesString
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('%'));
  },

  _getSessionFilePath(sessionId) {
    return path.join(sessionStoragePath, `${sessionId}.json`);
  },

  _saveSession(session) {
    const filePath = this._getSessionFilePath(session.sessionId);
    try {
      fs.writeFileSync(filePath, JSON.stringify(session, null, 2));
      logger.debug(`Session ${session.sessionId} saved to ${filePath}`);
    } catch (error) {
      logger.error(`Failed to save session ${session.sessionId}.`, {
        internalErrorCode: 'SESSION_SAVE_FAILED',
        sessionId: session.sessionId,
        filePath,
        originalError: error.message,
        stack: error.stack,
      });
      // Propagate error for consistent handling
      throw new ApiError(500, `Failed to save session ${session.sessionId}: ${error.message}`, 'SESSION_SAVE_OPERATION_FAILED');
    }
  },

  _loadSession(sessionId) {
    const filePath = this._getSessionFilePath(sessionId);
    if (fs.existsSync(filePath)) {
      try {
        const sessionData = fs.readFileSync(filePath, 'utf8');
        const session = JSON.parse(sessionData);
        this._sessions[sessionId] = session;
        logger.debug(`Session ${sessionId} loaded from ${filePath}`);
        return session;
      } catch (error) {
        logger.error(`Failed to load session ${sessionId} from ${filePath}.`, {
          internalErrorCode: 'SESSION_LOAD_FAILED',
          sessionId,
          filePath,
          originalError: error.message,
          stack: error.stack,
        });
        delete this._sessions[sessionId];
      }
    }
    return null;
  },

  _getOntologyFilePath(name) {
    return path.join(ontologyStoragePath, `${name}.pl`);
  },

  _saveOntology(name, rules) {
    const filePath = this._getOntologyFilePath(name);
    try {
      fs.writeFileSync(filePath, rules);
      logger.debug(`Ontology ${name} saved to ${filePath}`);
    } catch (error) {
      logger.error(`Failed to save ontology ${name}: ${error.message}`);
      throw new ApiError(
        500,
        `Failed to save ontology ${name}: ${error.message}`
      );
    }
  },

  _loadOntology(name) {
    const filePath = this._getOntologyFilePath(name);
    if (fs.existsSync(filePath)) {
      try {
        const rules = fs.readFileSync(filePath, 'utf8');
        this._ontologies[name] = rules;
        logger.debug(`Ontology ${name} loaded from ${filePath}`);
        return rules;
      } catch (error) {
        logger.error(
          `Failed to load ontology ${name} from ${filePath}: ${error.message}`
        );
        delete this._ontologies[name];
      }
    }
    return null;
  },

  /**
   * Loads all ontologies from the ontology storage path into memory.
   * This is typically called once at startup.
   * @private
   */
  _loadAllOntologies() {
    try {
      const files = fs.readdirSync(ontologyStoragePath);
      files.forEach((file) => {
        if (file.endsWith('.pl')) {
          const name = path.basename(file, '.pl');
          this._loadOntology(name);
        }
      });
      logger.info(
        `Loaded ${Object.keys(this._ontologies).length} ontologies from ${ontologyStoragePath}`
      );
    } catch (error) {
      logger.error(
        `Failed to load ontologies from ${ontologyStoragePath}: ${error.message}`
      );
    }
  },

  /**
   * Creates a new session.
   * @returns {Session} The newly created session object.
   */
  create() {
    const sessionId = uuidv4();
    const now = new Date().toISOString();
    const newSession = { sessionId, createdAt: now, facts: [], factCount: 0 };
    this._sessions[sessionId] = newSession;
    this._saveSession(newSession);
    logger.info(`Created new session: ${sessionId}`);
    return newSession;
  },

  /**
   * Retrieves a session by its ID.
   * Loads from disk if not already in memory.
   * @param {string} sessionId - The ID of the session to retrieve.
   * @returns {Session} The session object.
   * @throws {ApiError} If the session is not found.
   */
  get(sessionId) {
    let session = this._sessions[sessionId];
    if (!session) {
      session = this._loadSession(sessionId);
    }
    if (!session) {
      throw new ApiError(404, `Session with ID '${sessionId}' not found.`);
    }
    return session;
  },

  /**
   * Deletes a session by its ID.
   * Removes from memory and deletes the corresponding session file.
   * @param {string} sessionId - The ID of the session to delete.
   * @throws {ApiError} If the session is not found (implicitly via this.get).
   */
  delete(sessionId) {
    this.get(sessionId); // Ensures session exists before attempting deletion
    delete this._sessions[sessionId];
    const filePath = this._getSessionFilePath(sessionId);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
        logger.debug(`Session file ${filePath} deleted.`);
      } catch (error) {
        logger.error(
          `Failed to delete session file ${filePath}: ${error.message}`
        );
      }
    }
    logger.info(`Terminated session: ${sessionId}`);
  },

  /**
   * Adds new facts to an existing session.
   * @param {string} sessionId - The ID of the session.
   * @param {string[]} newFacts - An array of new Prolog facts to add.
   * @throws {ApiError} If the session is not found.
   */
  addFacts(sessionId, newFacts) {
    const session = this.get(sessionId);
    session.facts.push(...newFacts);
    session.factCount = session.facts.length;
    this._saveSession(session);
    logger.info(`Session ${sessionId}: Asserted ${newFacts.length} new facts.`);
  },

  /**
   * Combines facts from a session with global ontologies or a provided additional ontology.
   * If additionalOntology is provided, global ontologies are ignored for this call.
   * @param {string} sessionId - The ID of the session.
   * @param {string} [additionalOntology=null] - Optional string containing Prolog rules to use instead of global ontologies.
   * @returns {string[]} An array of combined Prolog facts and rules.
   * @throws {ApiError} If the session is not found.
   */
  getFactsWithOntology(sessionId, additionalOntology = null) {
    const session = this.get(sessionId);
    let ontologyFacts = [];

    if (additionalOntology) {
      ontologyFacts = this._parseOntologyRules(additionalOntology);
    } else {
      ontologyFacts = Object.values(this._ontologies).flatMap((rulesString) =>
        this._parseOntologyRules(rulesString)
      );
    }

    return [...session.facts, ...ontologyFacts];
  },

  /**
   * Retrieves global ontology facts that are not already present in the specified session's facts.
   * @param {string} sessionId - The ID of the session to compare against.
   * @returns {string[]} An array of ontology rules not present in the session.
   * @throws {ApiError} If the session is not found.
   */
  getNonSessionOntologyFacts(sessionId) {
    const session = this.get(sessionId);
    return Object.values(this._ontologies)
      .flatMap((rulesString) => this._parseOntologyRules(rulesString))
      .filter((rule) => !session.facts.includes(rule));
  },

  /**
   * Adds a new global ontology.
   * @param {string} name - The name of the ontology.
   * @param {string} rules - The Prolog rules for the ontology.
   * @returns {Ontology} The added ontology object.
   * @throws {ApiError} If an ontology with the same name already exists or if saving fails.
   */
  addOntology(name, rules) {
    if (this._ontologies[name]) {
      throw new ApiError(409, `Ontology with name '${name}' already exists.`);
    }
    this._ontologies[name] = rules;
    this._saveOntology(name, rules);
    logger.info(`Added new ontology: ${name}`);
    return { name, rules };
  },

  /**
   * Updates an existing global ontology.
   * @param {string} name - The name of the ontology to update.
   * @param {string} rules - The new Prolog rules for the ontology.
   * @returns {Ontology} The updated ontology object.
   * @throws {ApiError} If the ontology is not found or if saving fails.
   */
  updateOntology(name, rules) {
    if (!this._ontologies[name]) {
      throw new ApiError(404, `Ontology with name '${name}' not found.`);
    }
    this._ontologies[name] = rules;
    this._saveOntology(name, rules);
    logger.info(`Updated ontology: ${name}`);
    return { name, rules };
  },

  /**
   * Retrieves a list of all global ontologies.
   * @returns {Ontology[]} An array of ontology objects.
   */
  getOntologies() {
    return Object.keys(this._ontologies).map((name) => ({
      name,
      rules: this._ontologies[name],
    }));
  },

  /**
   * Retrieves a specific global ontology by its name.
   * @param {string} name - The name of the ontology to retrieve.
   * @returns {Ontology} The ontology object.
   * @throws {ApiError} If the ontology is not found.
   */
  getOntology(name) {
    const ontology = this._ontologies[name];
    if (!ontology) {
      throw new ApiError(404, `Ontology with name '${name}' not found.`);
    }
    return { name, rules: ontology };
  },

  /**
   * Deletes a global ontology by its name.
   * @param {string} name - The name of the ontology to delete.
   * @returns {{message: string}} A confirmation message.
   * @throws {ApiError} If the ontology is not found.
   */
  deleteOntology(name) {
    if (!this._ontologies[name]) {
      throw new ApiError(404, `Ontology with name '${name}' not found.`);
    }
    delete this._ontologies[name];
    const filePath = this._getOntologyFilePath(name);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
        logger.debug(`Ontology file ${filePath} deleted.`);
      } catch (error) {
        logger.error(
          `Failed to delete ontology file ${filePath}: ${error.message}`
        );
      }
    }
    logger.info(`Deleted ontology: ${name}`);
    return { message: `Ontology ${name} deleted.` };
  },
};

SessionManager._loadAllOntologies();

module.exports = SessionManager;
