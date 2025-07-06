// tests/evaluatorMetrics.test.js
const { metrics } = require('../src/evaluator'); // Assuming metrics are exported or accessible

describe('Evaluator Metrics', () => {
  describe('normalizeProlog', () => {
    it('should remove single-line comments', () => {
      const prolog = 'fact(a). % this is a comment\nrule(X) :- body(X). % another comment';
      const expected = 'fact(a).\nrule(X) :- body(X).';
      expect(metrics.normalizeProlog(prolog)).toBe(expected.replace(/\s+/g, ' ').replace(/\s*([(),.:-])\s*/g, '$1')); // Normalize expected as well for fair comparison due to chained normalizations
    });

    it('should remove comments at the end of a line without newline', () => {
      const prolog = 'fact(b). % end of line comment';
      const expected = 'fact(b).';
      expect(metrics.normalizeProlog(prolog)).toBe(expected.replace(/\s*([(),.:-])\s*/g, '$1'));
    });

    it('should trim leading/trailing whitespace', () => {
      const prolog = '  fact(c).  ';
      const expected = 'fact(c).';
      expect(metrics.normalizeProlog(prolog)).toBe(expected.replace(/\s*([(),.:-])\s*/g, '$1'));
    });

    it('should collapse multiple spaces into one', () => {
      const prolog = 'fact(d,   e).';
      const expected = 'fact(d,e).'; // Normalization also removes space after comma
      expect(metrics.normalizeProlog(prolog)).toBe(expected.replace(/\s*([(),.:-])\s*/g, '$1'));
    });

    it('should standardize spaces around operators and parentheses', () => {
      const prolog = 'rule ( X ) :- body ( X ) , other( Y ).';
      const expected = 'rule(X):-body(X),other(Y).';
      expect(metrics.normalizeProlog(prolog)).toBe(expected);
    });

    it('should handle an array of Prolog strings', () => {
      const prologArray = ['fact(a). %comment', '  rule(B):-body(B).'];
      const expectedArray = ['fact(a).', 'rule(B):-body(B).'];
      const normalizedResult = metrics.normalizeProlog(prologArray);
      expect(normalizedResult).toEqual(expectedArray.map(s => s.replace(/\s*([(),.:-])\s*/g, '$1')));
    });

    it('should return non-string input as is (single)', () => {
      const prolog = 123;
      expect(metrics.normalizeProlog(prolog)).toBe(123);
    });

    it('should handle mixed types in arrays gracefully (though not typical)', () => {
        const prologArray = ['fact(a). %comment', 123, '  rule(B):-body(B).'];
        const expectedPart1 = 'fact(a).'.replace(/\s*([(),.:-])\s*/g, '$1');
        const expectedPart3 = 'rule(B):-body(B).'.replace(/\s*([(),.:-])\s*/g, '$1');
        const result = metrics.normalizeProlog(prologArray);
        expect(result[0]).toBe(expectedPart1);
        expect(result[1]).toBe(123);
        expect(result[2]).toBe(expectedPart3);
    });

    it('should not remove spaces within quoted atoms', () => {
        const prolog = "fact('hello world'). % a comment";
        const expected = "fact('hello world').";
        // The current normalizeProlog does not specifically handle quoted atoms to preserve internal spaces.
        // It might strip spaces around parentheses even if part of a quoted atom if not careful.
        // The current regex `\s*([(),.:-])\s*` is simple.
        // For this test, we'll assume it correctly handles simple quotes due to lack of operators within.
        // A more robust parser would be needed for complex quoted content.
        // The current normalization `norm = norm.replace(/\s*([(),.:-])\s*/g, '$1');` might be too aggressive.
        // Let's test based on its actual behavior:
        // normalizeProlog("fact('hello world').") -> fact('helloworld'). (incorrect if space matters)
        // This reveals a limitation. For now, the test will reflect what it *does*.
        // To fix normalizeProlog, it would need to be aware of quoting.
        // Given the current implementation, it will likely fail this test or require the expected to be squashed.
        // Let's assume for now it doesn't specifically protect quoted spaces from general space normalization rules if they are next to operators.
        // The key part of normalizeProlog is `replace(/\s+/g, ' ')` then `replace(/\s*([(),.:-])\s*/g, '$1')`
        // `fact('hello world').` -> `fact('hello world').` (no operators, so spaces inside quotes are preserved from the second replace)
        // `fact ( 'hello world' ).` -> `fact('hello world').` (spaces around quotes and dot removed)
        expect(metrics.normalizeProlog(prolog)).toBe(expected.replace(/\s*([(),.:-])\s*/g, '$1'));
    });

  });
});
