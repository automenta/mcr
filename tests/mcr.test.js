import { describe, it, expect } from 'vitest';
import MCR from '../index.js';

describe('MCR', () => {
  it('should create a new session', async () => {
    const mcr = await MCR.create({ llm: { provider: () => '' } });
    const sessionId = await mcr.createSession();
    expect(sessionId).toBeTypeOf('string');
  });

  it('should assert a fact', async () => {
    const mcr = await MCR.create({
        llm: {
            provider: () => ({
                generate: () => Promise.resolve('man(socrates).')
            })
        }
    });
    const sessionId = await mcr.createSession();
    const result = await mcr.assert(sessionId, 'Socrates is a man.');
    expect(result.success).toBe(true);
    expect(result.clauses).toEqual(['man(socrates).']);
  });

  it('should query a fact', async () => {
    const mcr = await MCR.create({
        llm: {
            provider: () => ({
                generate: (prompt) => {
                    if (prompt.includes('Convert')) {
                        if (prompt.includes('Is Socrates mortal?')) {
                            return Promise.resolve('mortal(socrates).');
                        } else if (prompt.includes('All men are mortal.')) {
                            return Promise.resolve('mortal(X) :- man(X).');
                        }
                        return Promise.resolve('man(socrates).');
                    }
                    return Promise.resolve('Socrates is mortal because all men are mortal.');
                }
            })
        }
    });
    const sessionId = await mcr.createSession();
    await mcr.assert(sessionId, 'Socrates is a man.');
    await mcr.assert(sessionId, 'All men are mortal.');

    const result = await mcr.query(sessionId, 'Is Socrates mortal?');
    expect(result.answer).toBe('Socrates is mortal because all men are mortal.');
  });

  it('should use hybrid query when no results are found', async () => {
    const mcr = await MCR.create({
        llm: {
            provider: () => ({
                generate: (prompt) => {
                    if (prompt.includes('Convert')) {
                        return Promise.resolve('mortal(plato).');
                    }
                    return Promise.resolve('This is a direct answer from the LLM.');
                }
            })
        }
    });
    const sessionId = await mcr.createSession('man(socrates).');

    const result = await mcr.query(sessionId, 'Is Plato mortal?', { hybrid: true });
    expect(result.answer).toBe('This is a direct answer from the LLM.');
    });

  it('should handle session not found errors', async () => {
    const mcr = await MCR.create({ llm: { provider: () => '' } });
    await expect(mcr.query('invalid-session-id', 'test')).rejects.toThrow('Session not found');
  });
});
