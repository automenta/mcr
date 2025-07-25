import * as pl from 'tau-prolog';
import { v4 as uuidv4 } from 'uuid';
import { getLLMProvider } from '../llmProviders.js';
import BiLevelAdaptive from '../../strategies/BiLevelAdaptive.js';
import EvolutionModule from './evolutionModule.js';

class MCREngine {
  constructor(config) {
    this.config = config;
    this.sessions = new Map();
    this.llmProvider = null;
    this.strategies = {
      'bilevel-adaptive': BiLevelAdaptive,
    };
    this.activeStrategy = 'bilevel-adaptive';
    this.evolutionModule = new EvolutionModule(this);
  }

  async init() {
    this.llmProvider = await getLLMProvider(this.config.llm);
  }

  createSession(initialKb = '') {
    const sessionId = uuidv4();
    const session = {
      id: sessionId,
      prolog: pl.create(),
      kb: initialKb,
      lexicon: '',
      contextGraph: { facts: [], rules: [], embeddings: {}, models: {} },
    };
    if (initialKb) {
      session.prolog.consult(initialKb);
    }
    this.sessions.set(sessionId, session);
    return sessionId;
  }

  getSession(sessionId) {
    return this.sessions.get(sessionId);
  }

  async assert(sessionId, prologClause) {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    await session.prolog.consult(prologClause);
    session.kb += `\n${prologClause}`;
  }

  async query(sessionId, prologQuery) {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    return new Promise((resolve, reject) => {
      const results = [];
      session.prolog.query(prologQuery, {
        success: () => {
          session.prolog.answers(x => {
            if (x) {
              results.push(session.prolog.format_answer(x));
            } else {
              resolve(results);
            }
          });
        },
        error: (err) => reject(err),
      });
    });
  }

  async retract(sessionId, prologPattern) {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    const initialKb = session.kb;
    const newKb = initialKb.replace(new RegExp(`^${prologPattern}.*\\.$`, 'm'), '');

    if (initialKb.length === newKb.length) {
      return 0;
    }

    session.kb = newKb;
    session.prolog = pl.create();
    await session.prolog.consult(session.kb);

    return 1;
  }

  async callLLM(prompt) {
    if (!this.llmProvider) {
      await this.init();
    }
    return this.llmProvider.generate(prompt);
  }

  async *executeProgram(sessionId, program) {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    let context = {};

    for (const op of program) {
      let result;
      switch (op.op) {
        case 'neural':
          result = await this.callLLM(op.prompt);
          break;
        case 'symbolic':
          result = await this.query(sessionId, op.query);
          break;
        case 'hybrid':
          result = await this.hybridLoop(sessionId, op.inputVar ? context[op.inputVar] : op.prompt, op.refine);
          break;
        default:
          throw new Error(`Unsupported operation: ${op.op}`);
      }
      if (op.outputVar) {
        context[op.outputVar] = result;
      }
      yield { op: op.op, result };
    }
  }

  async hybridLoop(sessionId, prompt, refine) {
    let lastResult = await this.callLLM(prompt);
    if (!refine) {
      return lastResult;
    }

    for (let i = 0; i < this.config.maxRetries; i++) {
      try {
        await this.assert(sessionId, lastResult);
        return lastResult;
      } catch (error) {
        const refinementPrompt = `The following Prolog code failed: ${lastResult}. Error: ${error.message}. Please fix it.`;
        lastResult = await this.callLLM(refinementPrompt);
      }
    }
    throw new Error(`Hybrid loop failed to converge after ${this.config.maxRetries} retries.`);
  }
}

export default MCREngine;
