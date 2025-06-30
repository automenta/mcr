const { v4: uuidv4 } = require('uuid');
const path = require('path');
const { logger } = require('./logger');
const ApiError = require('./errors');
const ConfigManager = require('./config');
const storage = require('./storageUtils');

const SessionManager = {
  _sessions: {},
  _ontologies: {},

  _getSessionStoragePath() {
    const currentConfig = ConfigManager.get();
    return path.resolve(currentConfig.session.storagePath);
  },

  _getOntologyStoragePath() {
    const currentConfig = ConfigManager.get();
    return path.resolve(
      currentConfig.ontology.storagePath || './ontologies_data'
    );
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
    const sessionStoragePath = this._getSessionStoragePath();
    storage.ensurePathExists(sessionStoragePath, 'session');
    const filePath = this._getSessionFilePath(session.sessionId);
    storage.saveJsonFile(filePath, session, 'session', session.sessionId);
  },

  _loadSession(sessionId) {
    const filePath = this._getSessionFilePath(sessionId);
    const session = storage.loadJsonFile(filePath, 'session', sessionId);
    if (session) {
      this._sessions[sessionId] = session;
    }
    return session;
  },

  _getOntologyFilePath(name) {
    return path.join(this._getOntologyStoragePath(), `${name}.pl`);
  },

  _saveOntology(name, rules) {
    const ontologyStoragePath = this._getOntologyStoragePath();
    storage.ensurePathExists(ontologyStoragePath, 'ontology');
    const filePath = this._getOntologyFilePath(name);
    storage.saveRawFile(filePath, rules, 'ontology', name);
  },

  _loadOntology(name) {
    const filePath = this._getOntologyFilePath(name);
    const rules = storage.loadRawFile(filePath, 'ontology', name);
    if (rules) {
      this._ontologies[name] = rules;
    }
    return rules;
  },

  _loadAllOntologies() {
    const ontologyStoragePath = this._getOntologyStoragePath();
    storage.ensurePathExists(ontologyStoragePath, 'ontology');
    try {
      const files = storage.readDir(ontologyStoragePath, 'ontology');
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
      // Error already logged by storage.readDir if it throws an ApiError
      // If it's another type of error, or if we want specific handling here:
      logger.error(
        `Failed to process files for loading ontologies from ${ontologyStoragePath}: ${error.message}`,
        { internalErrorCode: 'ONTOLOGY_LOAD_ALL_PROCESSING_ERROR' }
      );
      // Depending on desired behavior, might re-throw or handle to allow partial loading
    }
  },

  create() {
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
    storage.deleteFile(filePath, 'session', sessionId);
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
    storage.deleteFile(filePath, 'ontology', name);
    logger.info(`Deleted ontology: ${name}`);
    return { message: `Ontology ${name} deleted.` };
  },
};

SessionManager._loadAllOntologies();

module.exports = SessionManager;
