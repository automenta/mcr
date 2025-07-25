import MCREngine from './src/mcrEngine.js';

class MCR {
  constructor(config) {
    this.engine = new MCREngine(config);
  }

  static async create(config = {}) {
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
    await mcr.engine.init();
    return mcr;
  }

  async createSession(initialKb = '') {
    return this.engine.createSession(initialKb);
  }

  async assert(id, nlText) {
    const session = this.engine.getSession(id);
    if (!session) throw new Error('Session not found');

    const strategy = this.engine.strategies[this.engine.activeStrategy];
    const { clauses, intermediateModel } = await strategy(nlText, id, this);

    session.contextGraph.models.push(intermediateModel);

    for (const clause of clauses) {
      try {
        await this.engine.assert(id, clause);
      } catch (error) {
        if (this.engine.config.debug) console.error('Prolog consultation error:', error);
        return { success: false, clauses: [] };
      }
    }

    await this.updateLexicon(id);
    return { success: true, clauses };
  }

  async retract(id, nlPattern) {
    const session = this.engine.getSession(id);
    if (!session) throw new Error('Session not found');

    const lexicon = await this.getLexicon(id);
    const prompt = `Convert the following natural language text into a Prolog pattern for retraction. Use the following lexicon for context:\n\n${lexicon}\n\nText: "${nlPattern}"`;
    const prologPattern = await this.engine.callLLM(prompt);

    const removed = await this.engine.retract(id, prologPattern);

    if (removed > 0) {
      await this.updateLexicon(id);
    }

    return { success: removed > 0, removed };
  }

  async query(id, nlQuery, options = {}) {
    const session = this.engine.getSession(id);
    if (!session) throw new Error('Session not found');

    const lexicon = await this.getLexicon(id);
    const prompt = `Convert the following natural language question into a Prolog query. Use the following lexicon for context:\n\n${lexicon}\n\nQuestion: "${nlQuery}"`;
    const prologQuery = await this.engine.callLLM(prompt);

    const results = await this.engine.query(id, prologQuery);

    if (results.length > 0) {
      const explanationPrompt = `Explain the following Prolog query results in natural language:\n\nQuery: ${prologQuery}\n\nResults:\n${results.join('\n')}`;
      const answer = await this.engine.callLLM(explanationPrompt);
      return { answer, bindings: results, explanation: this.engine.config.debug ? 'Prolog query successful' : undefined };
    }

    if (options.hybrid) {
      const directAnswer = await this.engine.callLLM(nlQuery);
      return { answer: directAnswer, bindings: [], explanation: this.engine.config.debug ? 'Hybrid fallback to LLM' : undefined };
    }

    return { answer: 'No results found.', bindings: [], explanation: this.engine.config.debug ? 'Prolog query returned no results' : undefined };
  }

  async loadOntology(id, pathOrContent) {
    await this.engine.assert(id, pathOrContent);
    await this.updateLexicon(id);
  }

  async getLexicon(id) {
    const session = this.engine.getSession(id);
    if (!session) throw new Error('Session not found');
    if (session.lexicon) return session.lexicon;

    await this.updateLexicon(id);
    return session.lexicon;
  }

  async updateLexicon(id) {
    const session = this.engine.getSession(id);
    if (!session) throw new Error("Session not found");

    const allClauses = session.kb;
    const prompt = `Summarize the following Prolog knowledge base into a natural language lexicon that can be used for context in future queries:\n\n${allClauses}`;
    session.lexicon = await this.engine.callLLM(prompt);
  }

  async exportKb(id) {
    const session = this.engine.getSession(id);
    if (!session) throw new Error('Session not found');
    return session.kb;
  }

  pipe(id, ...fns) {
    return (initialValue) => fns.reduce((acc, fn) => acc.then(val => fn(val, { mcr: this, sessionId: id })), Promise.resolve(initialValue));
  }
}

export default MCR;
