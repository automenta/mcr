import * as pl from 'tau-prolog';
import { v4 as uuidv4 } from 'uuid';
import { getLLMProvider } from './llmProviders.js';

/**
 * @class MCR
 * @classdesc The main class for the Model Context Reasoner library.
 */
class MCR {
  /**
   * @constructor
   * @param {object} config - The configuration object for the MCR instance.
   */
  constructor(config) {
    this.config = config;
    this.sessions = new Map();
    this.llmProvider = null;
    this.storageProvider = null;
  }

  /**
   * Creates and initializes an MCR instance.
   * @param {object} config - The configuration object for the MCR instance.
   * @returns {Promise<MCR>} A promise that resolves to a new MCR instance.
   */
  static async create(config = {}) {
    console.log('MCR.create: start');
    const mcr = new MCR({
      llm: {
        provider: 'openai',
        model: 'gpt-4o-mini',
        ...config.llm,
      },
      storage: 'memory',
      maxRetries: 3,
      debug: false,
      ...config,
    });

    mcr.llmProvider = await getLLMProvider(mcr.config.llm);
    console.log('MCR.create: llmProvider initialized');

    if (typeof mcr.config.storage === 'object' && mcr.config.storage !== null) {
      mcr.storageProvider = mcr.config.storage;
    }

    console.log('MCR.create: end');
    return mcr;
  }

  /**
   * Creates a new session.
   * @param {string} [initialKb=''] - An initial knowledge base to load into the session.
   * @returns {Promise<string>} The ID of the new session.
   */
  async createSession(initialKb = '') {
    const sessionId = uuidv4();
    const session = {
      prolog: pl.create(),
      kb: initialKb,
      lexicon: '',
    };
    this.sessions.set(sessionId, session);
    if (initialKb) {
      await this.loadOntology(sessionId, initialKb);
    }
    return sessionId;
  }

  /**
   * Deletes a session.
   * @param {string} id - The ID of the session to delete.
   * @returns {Promise<void>}
   */
  async deleteSession(id) {
    this.sessions.delete(id);
  }

  /**
   * Asserts a new fact or rule into the knowledge base.
   * @param {string} id - The ID of the session.
   * @param {string} nlText - The natural language text of the fact or rule to assert.
   * @returns {Promise<{success: boolean, clauses: string[]}>} An object indicating whether the assertion was successful and the Prolog clauses that were asserted.
   */
  async assert(id, nlText) {
    const session = this.sessions.get(id);
    if (!session) throw new Error('Session not found');

    const lexicon = await this.getLexicon(id);
    const prompt = `Convert the following natural language text into a valid Prolog clause. Use the following lexicon for context:\n\n${lexicon}\n\nText: "${nlText}"`;
    const prologClause = await this.llmProvider.generate(prompt);

    try {
      await session.prolog.consult(prologClause);
      session.kb += `\n${prologClause}`;
      await this.updateLexicon(id);
      if (this.storageProvider) {
        await this.storageProvider.save(id, session.kb);
      }
      return { success: true, clauses: [prologClause] };
    } catch (error) {
      if (this.config.debug) console.error('Prolog consultation error:', error);
      return { success: false, clauses: [] };
    }
  }

  /**
   * Retracts a fact or rule from the knowledge base.
   * @param {string} id - The ID of the session.
   * @param {string} nlPattern - The natural language text of the fact or rule to retract.
   * @returns {Promise<{success: boolean, removed: number}>} An object indicating whether the retraction was successful and the number of clauses that were removed.
   */
  async retract(id, nlPattern) {
    const session = this.sessions.get(id);
    if (!session) throw new Error('Session not found');

    const lexicon = await this.getLexicon(id);
    const prompt = `Convert the following natural language text into a Prolog pattern for retraction. Use the following lexicon for context:\n\n${lexicon}\n\nText: "${nlPattern}"`;
    const prologPattern = await this.llmProvider.generate(prompt);

    // This is a simplified implementation. Retraction in tau-prolog is more complex.
    // For now, we'll just remove the clause from the KB string and re-consult.
    const initialKb = session.kb;
    const newKb = initialKb.replace(new RegExp(`^${prologPattern}.*\\.$`, 'm'), '');

    if (initialKb.length === newKb.length) {
      return { success: false, removed: 0 };
    }

    session.kb = newKb;
    session.prolog = pl.create();
    await session.prolog.consult(session.kb);
    await this.updateLexicon(id);

    if (this.storageProvider) {
      await this.storageProvider.save(id, session.kb);
    }

    return { success: true, removed: 1 };
  }

  /**
   * Queries the knowledge base.
   * @param {string} id - The ID of the session.
   * @param {string} nlQuery - The natural language query.
   * @param {object} [options] - Query options.
   * @param {boolean} [options.hybrid=false] - Whether to use a hybrid query approach (fallback to LLM if no results are found).
   * @returns {Promise<{answer: string, bindings: any[], explanation?: string}>} An object containing the natural language answer, the Prolog bindings, and an optional explanation.
   */
  async query(id, nlQuery, options = {}) {
    const session = this.sessions.get(id);
    if (!session) throw new Error('Session not found');

    const lexicon = await this.getLexicon(id);
    const prompt = `Convert the following natural language question into a Prolog query. Use the following lexicon for context:\n\n${lexicon}\n\nQuestion: "${nlQuery}"`;
    const prologQuery = await this.llmProvider.generate(prompt);

    const results = [];
    await session.prolog.query(prologQuery);
    for await (const answer of session.prolog.answers()) {
      results.push(session.prolog.format_answer(answer));
    }

    if (results.length > 0) {
      const explanationPrompt = `Explain the following Prolog query results in natural language:\n\nQuery: ${prologQuery}\n\nResults:\n${results.join('\n')}`;
      const answer = await this.llmProvider.generate(explanationPrompt);
      return { answer, bindings: results, explanation: this.config.debug ? 'Prolog query successful' : undefined };
    }

    if (options.hybrid) {
      const directAnswer = await this.llmProvider.generate(nlQuery);
      return { answer: directAnswer, bindings: [], explanation: this.config.debug ? 'Hybrid fallback to LLM' : undefined };
    }

    return { answer: 'No results found.', bindings: [], explanation: this.config.debug ? 'Prolog query returned no results' : undefined };
  }

  /**
   * Loads an ontology into the knowledge base.
   * @param {string} id - The ID of the session.
   * @param {string} pathOrContent - The path to the ontology file or the content of the ontology.
   * @returns {Promise<void>}
   */
  async loadOntology(id, pathOrContent) {
    const session = this.sessions.get(id);
    if (!session) throw new Error('Session not found');

    // For simplicity, we assume pathOrContent is the content itself.
    // A more robust implementation would handle file paths.
    session.kb += `\n${pathOrContent}`;
    await session.prolog.consult(pathOrContent);
    await this.updateLexicon(id);

    if (this.storageProvider) {
      await this.storageProvider.save(id, session.kb);
    }
  }

  /**
   * Gets the lexicon for a session.
   * @param {string} id - The ID of the session.
   * @returns {Promise<string>} The lexicon for the session.
   */
  async getLexicon(id) {
    const session = this.sessions.get(id);
    if (!session) throw new Error('Session not found');
    if (session.lexicon) return session.lexicon;

    await this.updateLexicon(id);
    return session.lexicon;
  }

  /**
   * Updates the lexicon for a session.
   * @param {string} id - The ID of the session.
   * @returns {Promise<void>}
   * @private
   */
  async updateLexicon(id) {
      const session = this.sessions.get(id);
      if (!session) throw new Error("Session not found");

      const allClauses = session.kb;
      const prompt = `Summarize the following Prolog knowledge base into a natural language lexicon that can be used for context in future queries:\n\n${allClauses}`;
      session.lexicon = await this.llmProvider.generate(prompt);
  }

  /**
   * Exports the knowledge base for a session.
   * @param {string} id - The ID of the session.
   * @returns {Promise<string>} The knowledge base as a string.
   */
  async exportKb(id) {
    const session = this.sessions.get(id);
    if (!session) throw new Error('Session not found');
    return session.kb;
  }

  /**
   * Creates a pipeline of plugins.
   * @param {string} id - The ID of the session.
   * @param  {...function} fns - The plugins to include in the pipeline.
   * @returns {function} A function that executes the pipeline.
   */
  pipe(id, ...fns) {
    return (initialValue) => fns.reduce((acc, fn) => acc.then(val => fn(val, { mcr: this, sessionId: id })), Promise.resolve(initialValue));
  }
}

export default MCR;

/**
 * Composes single-argument functions from right to left. The rightmost
 * function can take multiple arguments; the remaining functions must be unary.
 *
 * @param {...Function} fns The functions to compose.
 * @returns {Function} A function obtained by composing the argument functions
 * from right to left. For example, compose(f, g, h) is identical to doing
 * (...args) => f(g(h(...args))).
 */
export const compose = (...fns) => (x) => fns.reduceRight((v, f) => f(v), x);
