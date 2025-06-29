const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const { logger } = require('./logger');
const ApiError = require('./errors');
const ConfigManager = require('./config');

// Eager path resolution and directory creation removed.
// These will be handled lazily by new helper methods.

const SessionManager = {
  _sessions: {},
  _ontologies: {},

  _getSessionStoragePath() {
    const currentConfig = ConfigManager.get();
    return path.resolve(currentConfig.session.storagePath);
  },

  _getOntologyStoragePath() {
    const currentConfig = ConfigManager.get();
    // Ensure default matches what's in config.js if process.env is not set
    return path.resolve(currentConfig.ontology.storagePath || './ontologies_data');
  },

  _ensurePathExists(pathToEnsure, type) {
    if (!fs.existsSync(pathToEnsure)) {
      fs.mkdirSync(pathToEnsure, { recursive: true });
      logger.info(`Created ${type} storage directory: ${pathToEnsure}`);
    }
  },

  _parseOntologyRules(rulesString) {
    if (!rulesString || typeof rulesString !== 'string') return [];
    return rulesString
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('%'));
  },

  _getSessionFilePath(sessionId) {
    return path.join(this._getSessionStoragePath(), `${sessionId}.json`);
  },

  _saveSession(session) {
    this._ensurePathExists(this._getSessionStoragePath(), 'session');
    const filePath = this._getSessionFilePath(session.sessionId);
    try {
      fs.writeFileSync(filePath, JSON.stringify(session, null, 2));
      logger.debug(`Session ${session.sessionId} saved to ${filePath}`);
    } catch (error) {
      logger.error(`Failed to save session ${session.sessionId}. Error: ${error.message} (Code: ${error.code}, Errno: ${error.errno})`, {
        internalErrorCode: 'SESSION_SAVE_FAILED',
        sessionId: session.sessionId,
        filePath,
        originalError: error.message,
        errorCode: error.code,
        errno: error.errno,
        stack: error.stack,
      });
      throw new ApiError(
        500,
        `Failed to save session ${session.sessionId}: ${error.message} (FS Code: ${error.code})`,
        'SESSION_SAVE_OPERATION_FAILED'
      );
    }
  },

  _loadSession(sessionId) {
    // No need to ensure path for read, if it doesn't exist, fs.existsSync will be false.
    // However, _getSessionFilePath will use _getSessionStoragePath which gets config.
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
        throw new ApiError(
          500,
          `Failed to read or parse session file ${sessionId}: ${error.message}`,
          'SESSION_DATA_CORRUPT_OR_UNREADABLE'
        );
      }
    }
    return null;
  },

  _getOntologyFilePath(name) {
    return path.join(this._getOntologyStoragePath(), `${name}.pl`);
  },

  _saveOntology(name, rules) {
    this._ensurePathExists(this._getOntologyStoragePath(), 'ontology');
    const filePath = this._getOntologyFilePath(name);
    try {
      fs.writeFileSync(filePath, rules);
      logger.debug(`Ontology ${name} saved to ${filePath}`);
    } catch (error) {
      logger.error(`Failed to save ontology ${name}: ${error.message}`);
      throw new ApiError(
        500,
        `Failed to save ontology ${name}: ${error.message}`,
        'ONTOLOGY_SAVE_FAILED'
      );
    }
  },

  _loadOntology(name) {
    // No need to ensure path for read.
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
        throw new ApiError(
          500,
          `Failed to read or parse ontology file ${name}: ${error.message}`,
          'ONTOLOGY_DATA_CORRUPT_OR_UNREADABLE'
        );
      }
    }
    return null;
  },

  _loadAllOntologies() {
    this._ensurePathExists(this._getOntologyStoragePath(), 'ontology');
    try {
      const currentOntologyPath = this._getOntologyStoragePath();
      const files = fs.readdirSync(currentOntologyPath);
      files.forEach((file) => {
        if (file.endsWith('.pl')) {
          const name = path.basename(file, '.pl');
          this._loadOntology(name); // _loadOntology uses _getOntologyFilePath which is fine
        }
      });
      logger.info(
        `Loaded ${Object.keys(this._ontologies).length} ontologies from ${currentOntologyPath}`
      );
    } catch (error) {
      logger.error(
        `Failed to load ontologies from ${this._getOntologyStoragePath()}: ${error.message}`
      );
    }
  },

  create() {
    // this._ensurePathExists(this._getSessionStoragePath(), 'session'); // Removed: _saveSession will handle it.
    const sessionId = uuidv4();
    const now = new Date().toISOString();
    const newSession = { sessionId, createdAt: now, facts: [], factCount: 0 };
    this._sessions[sessionId] = newSession;
    this._saveSession(newSession);
    logger.info(`Created new session: ${sessionId}`);
    return newSession;
  },

  get(sessionId) {
    let session = this._sessions[sessionId];
    if (!session) {
      session = this._loadSession(sessionId);
    }
    if (!session) {
      throw new ApiError(
        404,
        `Session with ID '${sessionId}' not found.`,
        'SESSION_NOT_FOUND'
      );
    }
    return session;
  },

  delete(sessionId) {
    this.get(sessionId);
    delete this._sessions[sessionId];
    const filePath = this._getSessionFilePath(sessionId);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
        logger.debug(`Session file ${filePath} deleted.`);
      } catch (error) {
        logger.error(
          `Failed to delete session file ${filePath}: ${error.message}`,
          {
            internalErrorCode: 'SESSION_FILE_DELETE_ERROR',
            sessionId,
            filePath,
            originalError: error.message,
          }
        );
        throw new ApiError(
          500,
          `Failed to delete session file ${filePath}: ${error.message}`,
          'SESSION_FILE_DELETE_FAILED'
        );
      }
    }
    logger.info(`Terminated session: ${sessionId}`);
  },

  addFacts(sessionId, newFacts) {
    const session = this.get(sessionId);
    session.facts.push(...newFacts);
    session.factCount = session.facts.length;
    this._saveSession(session);
    logger.info(`Session ${sessionId}: Asserted ${newFacts.length} new facts.`);
  },

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

  getNonSessionOntologyFacts(sessionId) {
    const session = this.get(sessionId);
    return Object.values(this._ontologies)
      .flatMap((rulesString) => this._parseOntologyRules(rulesString))
      .filter((rule) => !session.facts.includes(rule));
  },

  addOntology(name, rules) {
    if (this._ontologies[name]) {
      throw new ApiError(
        409,
        `Ontology with name '${name}' already exists.`,
        'ONTOLOGY_ALREADY_EXISTS'
      );
    }
    this._ontologies[name] = rules;
    this._saveOntology(name, rules);
    logger.info(`Added new ontology: ${name}`);
    return { name, rules };
  },

  updateOntology(name, rules) {
    if (!this._ontologies[name] && !this._loadOntology(name)) {
      throw new ApiError(
        404,
        `Ontology with name '${name}' not found.`,
        'ONTOLOGY_NOT_FOUND'
      );
    }
    this._ontologies[name] = rules;
    this._saveOntology(name, rules);
    logger.info(`Updated ontology: ${name}`);
    return { name, rules };
  },

  getOntologies() {
    return Object.keys(this._ontologies).map((name) => ({
      name,
      rules: this._ontologies[name],
    }));
  },

  getOntology(name) {
    let ontology = this._ontologies[name];
    if (!ontology) {
      ontology = this._loadOntology(name);
    }
    if (!ontology) {
      throw new ApiError(
        404,
        `Ontology with name '${name}' not found.`,
        'ONTOLOGY_NOT_FOUND'
      );
    }
    return { name, rules: ontology };
  },

  deleteOntology(name) {
    if (!this._ontologies[name] && !this._loadOntology(name)) {
      throw new ApiError(
        404,
        `Ontology with name '${name}' not found.`,
        'ONTOLOGY_NOT_FOUND'
      );
    }
    delete this._ontologies[name];
    const filePath = this._getOntologyFilePath(name);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
        logger.debug(`Ontology file ${filePath} deleted.`);
      } catch (error) {
        logger.error(
          `Failed to delete ontology file ${filePath}: ${error.message}`,
          {
            internalErrorCode: 'ONTOLOGY_FILE_DELETE_ERROR',
            ontologyName: name,
            filePath,
            originalError: error.message,
          }
        );
        throw new ApiError(
          500,
          `Failed to delete ontology file ${filePath}: ${error.message}`,
          'ONTOLOGY_FILE_DELETE_FAILED'
        );
      }
    }
    logger.info(`Deleted ontology: ${name}`);
    return { message: `Ontology ${name} deleted.` };
  },
};

SessionManager._loadAllOntologies();

module.exports = SessionManager;
