

const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const logger = require('./logger');
const ApiError = require('./errors');
const ConfigManager = require('./config');

const config = ConfigManager.load();
const sessionStoragePath = path.resolve(config.session.storagePath);

// Ensure session storage directory exists
if (!fs.existsSync(sessionStoragePath)) {
    fs.mkdirSync(sessionStoragePath, { recursive: true });
    logger.info(`Created session storage directory: ${sessionStoragePath}`);
}

const SessionManager = {
    _sessions: {},
    _ontologies: {
        "common-sense": `
            has(Person, Object) :- picked_up(Person, Object).
            not(on_table(Object)) :- has(_, Object).
            not(in_room(Person)) :- left_room(Person).
        `
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
            logger.error(`Failed to save session ${session.sessionId}: ${error.message}`);
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
                logger.error(`Failed to load session ${sessionId} from ${filePath}: ${error.message}`);
                delete this._sessions[sessionId]; // Remove corrupted session from memory
            }
        }
        return null;
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
            throw new ApiError(404, `Session with ID '${sessionId}' not found.`);
        }
        return session;
    },

    delete(sessionId) {
        this.get(sessionId); // Ensures it exists and loads if not in memory
        delete this._sessions[sessionId];
        const filePath = this._getSessionFilePath(sessionId);
        if (fs.existsSync(filePath)) {
            try {
                fs.unlinkSync(filePath);
                logger.debug(`Session file ${filePath} deleted.`);
            } catch (error) {
                logger.error(`Failed to delete session file ${filePath}: ${error.message}`);
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

    getFactsWithOntology(sessionId) {
        const session = this.get(sessionId);
        const ontologyFacts = Object.values(this._ontologies)
            .flatMap(o => o.split('\n'))
            .map(line => line.trim())
            .filter(line => line && !line.startsWith('%'));
        return [...session.facts, ...ontologyFacts];
    },

    addOntology(name, rules) {
        if (this._ontologies[name]) {
            throw new ApiError(409, `Ontology with name '${name}' already exists.`);
        }
        this._ontologies[name] = rules;
        logger.info(`Added new ontology: ${name}`);
        return { name, rules };
    },

    getOntologies() {
        return Object.keys(this._ontologies).map(name => ({ name, rules: this._ontologies[name] }));
    },

    getOntology(name) {
        const ontology = this._ontologies[name];
        if (!ontology) {
            throw new ApiError(404, `Ontology with name '${name}' not found.`);
        }
        return { name, rules: ontology };
    },

    deleteOntology(name) {
        if (!this._ontologies[name]) {
            throw new ApiError(404, `Ontology with name '${name}' not found.`);
        }
        delete this._ontologies[name];
        logger.info(`Deleted ontology: ${name}`);
        return { message: `Ontology ${name} deleted.` };
    }
};

module.exports = SessionManager;

