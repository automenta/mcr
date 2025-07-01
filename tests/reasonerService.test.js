// new/tests/reasonerService.test.js
const reasonerService = require('../src/reasonerService');
const config = require('../src/config');

// Ensure we're testing with the prolog provider for these unit tests
config.reasoner.provider = 'prolog';

describe('ReasonerService (Prolog Provider)', () => {
  describe('executeQuery', () => {
    test('should return true for a simple fact query that is true', async () => {
      const kb = 'human(socrates).';
      const query = 'human(socrates).';
      const results = await reasonerService.executeQuery(kb, query);
      expect(results).toEqual([true]);
    });

    test('should return an empty array for a simple fact query that is false', async () => {
      const kb = 'human(socrates).';
      const query = 'human(plato).';
      const results = await reasonerService.executeQuery(kb, query);
      expect(results).toEqual([]);
    });

    test('should return variable bindings for a query with one variable', async () => {
      const kb = 'father(john, mary).';
      const query = 'father(X, mary).';
      const results = await reasonerService.executeQuery(kb, query);
      expect(results).toEqual([{ X: 'john' }]);
    });

    test('should return multiple variable bindings for a query with multiple solutions', async () => {
      const kb = 'parent(john, mary).\nparent(jane, mary).';
      const query = 'parent(X, mary).';
      const results = await reasonerService.executeQuery(kb, query, 5); // Limit to 5
      // Order might not be guaranteed by all Prolog systems, so check for presence
      expect(results).toContainEqual({ X: 'john' });
      expect(results).toContainEqual({ X: 'jane' });
      expect(results.length).toBe(2);
    });

    test('should handle rules in the knowledge base', async () => {
      const kb = 'human(socrates).\nmortal(X) :- human(X).';
      const query = 'mortal(socrates).';
      const results = await reasonerService.executeQuery(kb, query);
      expect(results).toEqual([true]);
    });

    test('should return variable bindings from rules', async () => {
      const kb = 'human(socrates).\nhuman(plato).\nmortal(X) :- human(X).';
      const query = 'mortal(Y).';
      const results = await reasonerService.executeQuery(kb, query);
      expect(results).toContainEqual({ Y: 'socrates' });
      expect(results).toContainEqual({ Y: 'plato' });
      expect(results.length).toBe(2);
    });

    test('should handle queries with multiple variables', async () => {
      const kb = 'likes(john, pizza).\nlikes(jane, sushi).';
      const query = 'likes(Person, Food).';
      const results = await reasonerService.executeQuery(kb, query);
      expect(results).toContainEqual({ Person: 'john', Food: 'pizza' });
      expect(results).toContainEqual({ Person: 'jane', Food: 'sushi' });
      expect(results.length).toBe(2);
    });

    test('should return an empty array if no solutions are found with rules', async () => {
      const kb = 'human(socrates).\nmortal(X) :- human(X).';
      const query = 'mortal(zeus).';
      const results = await reasonerService.executeQuery(kb, query);
      expect(results).toEqual([]);
    });

    test('should reject with an error for invalid Prolog syntax in knowledgeBase', async () => {
      const kb = 'this is not prolog.';
      const query = 'test(X).';
      await expect(reasonerService.executeQuery(kb, query)).rejects.toThrow(/Prolog knowledge base error/);
    });

    test('should reject with an error for invalid Prolog syntax in query', async () => {
      const kb = 'valid(fact).';
      const query = 'this is not a valid query';
      await expect(reasonerService.executeQuery(kb, query)).rejects.toThrow(/Prolog query error/);
    });

    test('should handle queries resulting in boolean true from assertz', async () => {
        const kb = ''; // Start with an empty knowledge base for this test
        const query = 'assertz(city(london)).'; // An action query
        const results = await reasonerService.executeQuery(kb, query);
        // Tau-Prolog's assertz, when successful without binding query variables, might return { Goal : true }
        // which our formatter turns into `true`.
        expect(results).toEqual([true]);
    });
  });
});
