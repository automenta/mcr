import { describe, it, expect, vi } from 'vitest';
import MCR from '../src/index.js';

describe('MCR', () => {
  it('should create a new session', async () => {
    const mcr = new MCR({ llm: { provider: () => '' } });
    const sessionId = await mcr.createSession();
    expect(sessionId).toBeTypeOf('string');
  });

  it('should assert a fact', async () => {
    const mcr = new MCR({
        llm: {
            provider: () => Promise.resolve('man(socrates).')
        }
    });
    const sessionId = await mcr.createSession();
    const result = await mcr.assert(sessionId, 'Socrates is a man.');
    expect(result.success).toBe(true);
    expect(result.clauses).toEqual(['man(socrates).']);
  });

  it('should query a fact', async () => {
    const mcr = new MCR({
        llm: {
            provider: (prompt) => {
                if (prompt.includes('Convert')) {
                    if(prompt.includes('mortal')) {
                        return Promise.resolve('mortal(X) :- man(X).');
                    }
                    return Promise.resolve('man(socrates).');
                }
                return Promise.resolve('Socrates is mortal because all men are mortal.');
            }
        }
    });
    const sessionId = await mcr.createSession();
    await mcr.assert(sessionId, 'Socrates is a man.');
    await mcr.assert(sessionId, 'All men are mortal.');

    const session = mcr.sessions.get(sessionId);
    session.prolog.answers = async function*() {
        yield { 'X': 'socrates' };
    };

    const result = await mcr.query(sessionId, 'Is Socrates mortal?');
    expect(result.answer).toBe('Socrates is mortal because all men are mortal.');
  });

  it('should use hybrid query when no results are found', async () => {
    const mcr = new MCR({
        llm: {
            provider: (prompt) => {
                if (prompt.includes('Convert')) {
                    return Promise.resolve('mortal(plato).');
                }
                return Promise.resolve('This is a direct answer from the LLM.');
            }
        }
    });
    const sessionId = await mcr.createSession('man(socrates).');

    const session = mcr.sessions.get(sessionId);
    session.prolog.answers = async function*() {
        // Yield nothing to simulate no results
    };

    const result = await mcr.query(sessionId, 'Is Plato mortal?', { hybrid: true });
    expect(result.answer).toBe('This is a direct answer from the LLM.');
    });

  it('should handle session not found errors', async () => {
    const mcr = new MCR({ llm: { provider: () => '' } });
    await expect(mcr.query('invalid-session-id', 'test')).rejects.toThrow('Session not found');
  });
});
