import { describe, it, expect, vi } from 'vitest';
import MCR from '../index.js';
import { mockLlmProvider } from './mockLlmProvider.js';

describe('MCR', () => {
  it('should create a new session', async () => {
    const mcr = await MCR.create({ llm: { provider: () => mockLlmProvider } });
    const sessionId = await mcr.createSession();
    expect(sessionId).toBeTypeOf('string');
  });

  it('should assert a fact using bi-level adaptive strategy', async () => {
    const mcr = await MCR.create({ llm: { provider: () => mockLlmProvider } });
    const sessionId = await mcr.createSession();
    const result = await mcr.assert(sessionId, 'Socrates is a man.');
    expect(result.success).toBe(true);
    expect(result.clauses).toEqual(['man(socrates).']);
    const session = mcr.engine.getSession(sessionId);
    expect(session.contextGraph.models.length).toBe(1);
  });

  it('should query a fact', async () => {
    const mcr = await MCR.create({ llm: { provider: () => mockLlmProvider } });
    const sessionId = await mcr.createSession();
    await mcr.assert(sessionId, 'Socrates is a man.');
    await mcr.assert(sessionId, 'All men are mortal.');

    const result = await mcr.query(sessionId, 'Is Socrates mortal?');
    expect(result.answer).toBe('Socrates is mortal because all men are mortal.');
  });

  it('should use hybrid query when no results are found', async () => {
    const mcr = await MCR.create({ llm: { provider: () => mockLlmProvider } });
    const sessionId = await mcr.createSession('man(socrates).');

    const result = await mcr.query(sessionId, 'Is Plato mortal?', { hybrid: true });
    expect(result.answer).toBe('Socrates is mortal because all men are mortal.');
  });

  it('should handle session not found errors', async () => {
    const mcr = await MCR.create({ llm: { provider: () => mockLlmProvider } });
    await expect(mcr.query('invalid-session-id', 'test')).rejects.toThrow('Session not found');
  });

  it('should execute a program with the HEE', async () => {
    const mcr = await MCR.create({ llm: { provider: () => mockLlmProvider } });
    const sessionId = await mcr.createSession();
    const program = [
      { op: 'neural', prompt: 'Who is Socrates?', outputVar: 'socrates' },
      { op: 'symbolic', query: 'mortal(socrates).' },
    ];
    const results = [];
    for await (const result of mcr.engine.executeProgram(sessionId, program)) {
      results.push(result);
    }
    expect(results.length).toBe(2);
    expect(results[0].op).toBe('neural');
    expect(results[1].op).toBe('symbolic');
  });
});
