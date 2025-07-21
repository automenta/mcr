const { v4: uuidv4 } = require('uuid');
const KnowledgeGraph = require('../bridges/kgBridge');
const { MCRError, ErrorCodes } = require('../errors');

class SessionManager {
  constructor(config) {
    this.config = config;
    this.sessions = {};
  }

  async createSession(sessionIdInput) {
    const sessionId = sessionIdInput || uuidv4();
    if (this.sessions[sessionId]) {
      return this.sessions[sessionId];
    }
    const session = {
      id: sessionId,
      createdAt: new Date(),
      facts: [],
      lexicon: new Set(),
      embeddings: new Map(),
      kbGraph: this.config.kg.enabled ? new KnowledgeGraph() : null,
    };
    this.sessions[sessionId] = session;
    return session;
  }

  async getSession(sessionId) {
    return this.sessions[sessionId] || null;
  }

  async getKnowledgeBase(sessionId) {
    const session = await this.getSession(sessionId);
    return session ? session.facts.join('\n') : null;
  }

  async addFacts(sessionId, newFacts) {
    const session = await this.getSession(sessionId);
    if (!session) return false;
    session.facts.push(...newFacts);
    this._updateLexiconWithFacts(session, newFacts);
    return true;
  }

  _updateLexiconWithFacts(session, facts) {
    facts.forEach(fact => {
      const match = fact.match(/^([a-z_][a-zA-Z0-9_]*)\(/);
      if (match) {
        const predicate = match[1];
        const arity = (fact.match(/,/g) || []).length + 1;
        session.lexicon.add(`${predicate}/${arity}`);
      } else {
        const atomMatch = fact.match(/^([a-z_][a-zA-Z0-9_]*)\./);
        if (atomMatch) {
          session.lexicon.add(`${atomMatch[1]}/0`);
        }
      }
    });
  }

  async getLexiconSummary(sessionId) {
    const session = await this.getSession(sessionId);
    if (!session || session.lexicon.size === 0) {
      return 'No predicates identified.';
    }
    return `Known Predicates: ${Array.from(session.lexicon).sort().join(', ')}`;
  }

  async setKnowledgeBase(sessionId, kbContent) {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new MCRError(ErrorCodes.SESSION_NOT_FOUND, 'Session not found.');
    }
    session.facts = kbContent.split('\n').filter(line => line.trim() !== '');
    this._updateLexiconWithFacts(session, session.facts);
    const fullKnowledgeBase = await this.getKnowledgeBase(sessionId);
    return {
      success: true,
      message: 'Knowledge base updated successfully.',
      fullKnowledgeBase,
    };
  }
}

module.exports = SessionManager;
