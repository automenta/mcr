import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { PrologKnowledgeBase } from '../../../src/core/knowledge/KnowledgeBase';
import type { IReasonProvider } from '../../../src/interfaces/IReasonProvider';
import type { ValidationResult } from '../../../src/types';

describe('PrologKnowledgeBase', () => {
  let kb: PrologKnowledgeBase;

  beforeEach(() => {
    kb = new PrologKnowledgeBase();
  });

  it('should initialize with an empty set of clauses', async () => {
    expect(await kb.getClauseCount()).toBe(0);
    expect(await kb.getKbString()).toBe('');
  });

  it('should initialize with provided clauses', async () => {
    const initialClauses = ['fact(a).', 'rule(X) :- fact(X).'];
    const initializedKb = new PrologKnowledgeBase(initialClauses);
    expect(await initializedKb.getClauseCount()).toBe(2);
    // Note: constructor does not auto-add period if missing, addClause does.
    // For constructor, assume clauses are already well-formed.
    expect(await initializedKb.getKbString()).toBe('fact(a).\nrule(X) :- fact(X).\n');
  });

  describe('addClause', () => {
    it('should add a clause to the knowledge base', async () => {
      await kb.addClause('fact(a).');
      expect(await kb.getClauseCount()).toBe(1);
      expect(await kb.getKbString()).toBe('fact(a).\n');
    });

    it('should automatically add a period if missing', async () => {
      await kb.addClause('fact(b)');
      expect(await kb.getKbString()).toBe('fact(b).\n');
    });

    it('should not add a duplicate period if one already exists', async () => {
      await kb.addClause('fact(c).');
      expect(await kb.getKbString()).toBe('fact(c).\n');
    });

    it('should handle clauses with leading/trailing whitespace', async () => {
      await kb.addClause('  fact(d)  ');
      expect(await kb.getKbString()).toBe('fact(d).\n');
    });

    it('should not add empty or whitespace-only clauses', async () => {
      await kb.addClause('');
      await kb.addClause('   ');
      expect(await kb.getClauseCount()).toBe(0);
    });
  });

  describe('addClauses', () => {
    it('should add multiple clauses to the knowledge base', async () => {
      const clausesToAdd = ['fact(a).', 'fact(b)', '  fact(c).  '];
      await kb.addClauses(clausesToAdd);
      expect(await kb.getClauseCount()).toBe(3);
      expect(await kb.getKbString()).toBe('fact(a).\nfact(b).\nfact(c).\n');
    });

    it('should handle an empty array of clauses', async () => {
      await kb.addClauses([]);
      expect(await kb.getClauseCount()).toBe(0);
    });
  });

  describe('getKbString', () => {
    it('should return all clauses concatenated by newlines, with a trailing newline', async () => {
      await kb.addClause('fact(a).');
      await kb.addClause('fact(b).');
      expect(await kb.getKbString()).toBe('fact(a).\nfact(b).\n');
    });

    it('should return an empty string if no clauses', async () => {
      expect(await kb.getKbString()).toBe('');
    });
  });

  describe('clear', () => {
    it('should remove all clauses from the knowledge base', async () => {
      await kb.addClause('fact(a).');
      await kb.clear();
      expect(await kb.getClauseCount()).toBe(0);
      expect(await kb.getKbString()).toBe('');
    });
  });

  describe('validate', () => {
    it('should call the reasoner\'s validate method with the KB string', async () => {
      const mockValidationResult: ValidationResult = { valid: true };
      const mockValidateFn = jest.fn(async (kbString: string) => mockValidationResult);
      const mockQueryFn = jest.fn(async () => ({ success: false }));
      const mockGetNameFn = jest.fn(() => 'mockReasoner');

      const mockReasoner: IReasonProvider = {
        validate: mockValidateFn,
        query: mockQueryFn,
        getName: mockGetNameFn,
      };

      await kb.addClause('fact(a).');
      const result = await kb.validate(mockReasoner);

      expect(result).toBe(mockValidationResult);
      expect(mockReasoner.validate).toHaveBeenCalledWith('fact(a).\n');
    });
  });
});
