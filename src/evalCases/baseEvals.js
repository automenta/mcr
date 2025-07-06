// src/evalCases/baseEvals.js

/**
 * @type {import('../evaluator').EvaluationCase[]}
 */
const baseEvals = [
  {
    id: "BE001",
    description: "Simple fact assertion: 'The sky is blue.'",
    naturalLanguageInput: "The sky is blue.",
    inputType: "assert",
    expectedProlog: ["is_color(sky, blue)."],
    metrics: ["exactMatchProlog"],
    tags: ["assertion", "simple-fact", "core"],
  },
  {
    id: "BE002",
    description: "Simple rule assertion: 'All humans are mortal.'",
    naturalLanguageInput: "All humans are mortal.",
    inputType: "assert",
    // Note: The exact Prolog for a rule can vary based on how 'human' is defined or expected.
    // If 'human(X)' is the way to identify a human:
    // expectedProlog: ["mortal(X) :- human(X)."],
    // If 'is_a(X, human)' is the convention (common with SIR):
    expectedProlog: ["mortal(X) :- is_a(X, human)."],
    metrics: ["exactMatchProlog"],
    tags: ["assertion", "simple-rule", "core"],
  },
  {
    id: "BE003",
    description: "Assertion requiring list in SIR: 'H2O is composed of Hydrogen and Oxygen.'",
    naturalLanguageInput: "H2O is composed of Hydrogen and Oxygen.",
    inputType: "assert",
    // Expected Prolog for SIR-style strategies that handle lists in arguments
    expectedProlog: ["is_composed_of(h2o, [hydrogen, oxygen])."],
    metrics: ["exactMatchProlog"],
    tags: ["assertion", "list-argument", "sir-specific"],
    notes: "This case tests if the strategy correctly generates a list for the components."
  },
  {
    id: "BE004",
    description: "Query based on asserted fact: 'Is the sky blue?' after asserting 'The sky is blue.'",
    naturalLanguageInput: "Is the sky blue?",
    inputType: "query",
    // This session ID will ensure BE001's assertion is available.
    // The evaluator will need to manage sessions based on this.
    // For simplicity in this initial set, we'll assume BE001 is asserted in the same session block.
    // More robust session management in evaluator might be needed for complex dependencies.
    // For now, evaluator creates a new session per strategy, so this query relies on prior assertion within that session.
    // To make it explicit, one might need a "setup" step in the eval case, or ensure evaluator runs dependent cases in order within one session.
    // Let's assume for now the evaluator will handle asserting BE001 before this if they are part of the same "logical test flow" for a strategy.
    // This requires careful ordering or a session grouping mechanism in the evaluator not yet specified.
    // **Simplification for now**: We expect the evaluator to run assertions first.
    // For a self-contained query test, one might include setup assertions.
    expectedProlog: "is_color(sky, blue).", // Expected Prolog query
    expectedAnswer: "Yes, the sky is blue.", // Expected NL answer
    metrics: ["exactMatchProlog", "exactMatchAnswer"],
    tags: ["query", "simple-query", "core", "dependent-BE001"],
    notes: "This case implicitly depends on BE001 being asserted in the same session by the strategy being tested."
  },
  {
    id: "BE005",
    description: "Query for variable based on rule: 'Who is mortal?' after asserting 'All humans are mortal.' and 'Socrates is a human.'",
    naturalLanguageInput: "Who is mortal?",
    inputType: "query",
    expectedProlog: "mortal(X).",
    // expectedAnswer depends on 'Socrates is a human' also being asserted.
    // For SIR-R1, 'Socrates is a human' -> is_a(socrates, human).
    // 'All humans are mortal' (BE002) -> mortal(X) :- is_a(X, human).
    // So, querying mortal(X) should yield X=socrates.
    expectedAnswer: "Socrates is mortal.", // Simplified, LLM might say "Socrates." or "Mortal entities include Socrates."
    metrics: ["exactMatchProlog", "exactMatchAnswer"], // exactMatchAnswer might be flaky here
    tags: ["query", "rule-query", "core", "dependent-BE002"],
    notes: "Depends on BE002 and an assertion like 'is_a(socrates, human).' being present in the session. The NL answer match might be less strict."
  },
  {
    id: "BE006",
    description: "Negated fact assertion: 'Paris is not the capital of Germany.'",
    naturalLanguageInput: "Paris is not the capital of Germany.",
    inputType: "assert",
    // For SIR strategies, this might be: is_capital_of(paris, germany) with isNegative: true
    // Leading to Prolog: not(is_capital_of(paris, germany)).
    // For Direct strategies, it's less predictable.
    expectedProlog: ["not(is_capital_of(paris, germany))."],
    metrics: ["exactMatchProlog"],
    tags: ["assertion", "negation", "core"],
    notes: "Tests handling of negation. Expected Prolog is for SIR-style negation."
  },
  {
    id: "BE007",
    description: "Query involving negation: 'Is Paris the capital of Germany?' after asserting it's not.",
    naturalLanguageInput: "Is Paris the capital of Germany?",
    inputType: "query",
    expectedProlog: "is_capital_of(paris, germany).",
    expectedAnswer: "No, Paris is not the capital of Germany.", // Or similar negative response
    metrics: ["exactMatchProlog", "exactMatchAnswer"],
    tags: ["query", "negation-query", "core", "dependent-BE006"],
    notes: "Depends on BE006. Tests querying a fact known to be false."
  },
];

module.exports = baseEvals;
