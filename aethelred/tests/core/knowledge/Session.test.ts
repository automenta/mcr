import { describe, it, expect, beforeEach } from '@jest/globals';
import { Session } from '../../../src/core/knowledge/Session';
import { PrologKnowledgeBase } from '../../../src/core/knowledge/KnowledgeBase';
import type { IKnowledgeBase } from '../../../src/core/knowledge/KnowledgeBase';

describe('Session', () => {
  let session: Session;

  beforeEach(() => {
    session = new Session();
  });

  it('should create a session with a unique ID', () => {
    const session1 = new Session();
    const session2 = new Session();
    expect(typeof session1.id).toBe('string');
    expect(typeof session2.id).toBe('string');
    expect(session1.id).not.toBe(session2.id);
  });

  it('should initialize with a PrologKnowledgeBase by default', () => {
    expect(session.knowledgeBase).toBeInstanceOf(PrologKnowledgeBase);
  });

  it('should allow a custom IKnowledgeBase to be provided', () => {
    const mockKb: IKnowledgeBase = {
      addClause: async () => {},
      addClauses: async () => {},
      getKbString: async () => "mock kb",
      validate: async () => ({ valid: true }),
      clear: async () => {},
      getClauseCount: async () => 0,
    };
    const customSession = new Session('custom-id', mockKb);
    expect(customSession.knowledgeBase).toBe(mockKb);
  });

  it('should set createdAt and lastAccessedAt timestamps on creation', () => {
    const now = Date.now();
    // Allow for a small delay in execution
    expect(session.createdAt.getTime()).toBeGreaterThanOrEqual(now - 100);
    expect(session.createdAt.getTime()).toBeLessThanOrEqual(now + 100);
    expect(session.lastAccessedAt.getTime()).toEqual(session.createdAt.getTime());
  });

  it('touch() method should update lastAccessedAt timestamp', async () => {
    const initialAccessTime = session.lastAccessedAt;

    // Wait a bit to ensure time changes
    await new Promise(resolve => setTimeout(resolve, 10));

    session.touch();
    expect(session.lastAccessedAt.getTime()).toBeGreaterThan(initialAccessTime.getTime());
  });

  it('should allow a custom ID to be provided', () => {
    const customId = "my-custom-session-id";
    const customSession = new Session(customId);
    expect(customSession.id).toBe(customId);
  });
});
