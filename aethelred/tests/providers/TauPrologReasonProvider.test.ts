import { describe, it, expect, beforeEach } from '@jest/globals';
import { TauPrologReasonProvider } from '../../src/providers/TauPrologReasonProvider';
import type { QueryResult, ValidationResult } from '../../src/types';

// Helper to check if an array (Jest doesn't have .toBeArrayOfSize directly)
expect.extend({
  toBeArrayOfSize(received, size) {
    const pass = Array.isArray(received) && received.length === size;
    if (pass) {
      return {
        message: () => `expected ${received} not to be an array of size ${size}`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be an array of size ${size}, but it has ${received?.length} elements.`,
        pass: false,
      };
    }
  },
});

// Extend Jest's expect interface for custom matcher if using TypeScript
declare module "expect" {
  interface AsymmetricMatchers {
    toBeArrayOfSize(size: number): void;
  }
  interface Matchers<R> {
    toBeArrayOfSize(size: number): R;
  }
}


describe('TauPrologReasonProvider', () => {
  let reasoner: TauPrologReasonProvider;

  beforeEach(() => {
    reasoner = new TauPrologReasonProvider();
  });

  describe('validate', () => {
    it('should validate a correct KB', async () => {
      const kb = 'father(john, pete).\nmother(mary, pete).';
      const result: ValidationResult = await reasoner.validate(kb);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should invalidate a KB with syntax errors', async () => {
      const kb = 'father(john, pete.\nmother(mary, pete).'; // Missing parenthesis
      const result: ValidationResult = await reasoner.validate(kb);
      expect(result.valid).toBe(false);
      expect(typeof result.error).toBe('string');
    });

    it('should validate an empty KB', async () => {
      const kb = '';
      const result: ValidationResult = await reasoner.validate(kb);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });
  });

  describe('query', () => {
    const kb = `
      father(john, pete).
      father(john, anne).
      mother(mary, pete).
      mother(mary, anne).
      parent(X, Y) :- father(X, Y).
      parent(X, Y) :- mother(X, Y).
      sibling(X, Y) :- parent(Z, X), parent(Z, Y), X \\= Y.
      grandparent(X, Y) :- parent(X, Z), parent(Z, Y).
      human(socrates).
      mortal(X) :- human(X).
    `;

    it('should return bindings for a query with variables', async () => {
      const query = 'father(john, Who).';
      const result: QueryResult = await reasoner.query(kb, query);
      expect(result.success).toBe(true);
      expect(result.bindings).toBeArrayOfSize(2);
      expect(result.bindings).toContainEqual({ Who: 'pete' });
      expect(result.bindings).toContainEqual({ Who: 'anne' });
    });

    it('should return success and empty bindings for a true fact query', async () => {
      const query = 'father(john, pete).';
      const result: QueryResult = await reasoner.query(kb, query);
      expect(result.success).toBe(true);
      // TauProlog wrapper returns array with one empty object for true ground queries
      expect(result.bindings).toBeArrayOfSize(1);
      expect(result.bindings?.[0]).toEqual({});
    });

    it('should return success and undefined bindings for a false fact query', async () => {
      const query = 'father(mary, pete).'; // This is false based on KB
      const result: QueryResult = await reasoner.query(kb, query);
      expect(result.success).toBe(true); // Query itself is valid
      expect(result.bindings).toBeUndefined(); // But it yields no solutions (false)
    });

    it('should handle queries with rules', async () => {
      const query = 'parent(Who, pete).';
      const result: QueryResult = await reasoner.query(kb, query);
      expect(result.success).toBe(true);
      expect(result.bindings).toBeArrayOfSize(2);
      expect(result.bindings).toContainEqual({ Who: 'john' });
      expect(result.bindings).toContainEqual({ Who: 'mary' });
    });

    it('should handle queries with multiple results from rules', async () => {
        const query = 'sibling(pete, Who).';
        const result: QueryResult = await reasoner.query(kb, query);
        expect(result.success).toBe(true);
        expect(result.bindings).toBeArrayOfSize(1); // anne is sibling of pete (via john and mary)
        expect(result.bindings).toContainEqual({ Who: 'anne' });
    });


    it('should return success and undefined bindings for a query that yields no results (false)', async () => {
      const query = 'grandparent(socrates, X).';
      const result: QueryResult = await reasoner.query(kb, query);
      expect(result.success).toBe(true);
      expect(result.bindings).toBeUndefined();
    });

    it('should return success and specific binding for a ground query that is true', async () => {
        const query = 'mortal(socrates).';
        const result: QueryResult = await reasoner.query(kb, query);
        expect(result.success).toBe(true);
        expect(result.bindings).toBeArrayOfSize(1);
        expect(result.bindings?.[0]).toEqual({}); // True, no variables
    });

    it('should return error for a syntactically incorrect query', async () => {
      const query = 'father(john, Who'; // Missing period and parenthesis
      const result: QueryResult = await reasoner.query(kb, query);
      expect(result.success).toBe(false);
      expect(typeof result.error).toBe('string');
    });

    it('should handle queries against an empty KB', async () => {
      const query = 'test(X).';
      const result: QueryResult = await reasoner.query('', query);
      expect(result.success).toBe(true);
      expect(result.bindings).toBeUndefined();
    });
  });

  it('getName() should return "tau-prolog"', () => {
    expect(reasoner.getName()).toBe("tau-prolog");
  });
});
