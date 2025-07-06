// src/evalCases/baseEvals.js

/**
 * @type {import('../evaluator').EvaluationCase[]}
 */
const baseEvals = [
  {
    id: "BE001_SimpleAssert",
    description: "Simple fact assertion: 'The sky is blue.'",
    naturalLanguageInput: "The sky is blue.",
    inputType: "assert",
    expectedProlog: ["is_color(sky, blue)."],
    metrics: ["exactMatchProlog"],
    tags: ["assertion", "simple-fact", "core", "reduced-set"],
  },
  {
    id: "BE002_SimpleRule",
    description: "Simple rule assertion: 'All humans are mortal.'",
    naturalLanguageInput: "All humans are mortal.",
    inputType: "assert",
    expectedProlog: ["mortal(X) :- is_a(X, human)."],
    metrics: ["exactMatchProlog"],
    tags: ["assertion", "simple-rule", "core", "reduced-set"],
  },
  // {
  //   id: "BE003",
  //   description: "Assertion requiring list in SIR: 'H2O is composed of Hydrogen and Oxygen.'",
  //   naturalLanguageInput: "H2O is composed of Hydrogen and Oxygen.",
  //   inputType: "assert",
  //   expectedProlog: ["is_composed_of(h2o, [hydrogen, oxygen])."],
  //   metrics: ["exactMatchProlog"],
  //   tags: ["assertion", "list-argument", "sir-specific"],
  //   notes: "This case tests if the strategy correctly generates a list for the components."
  // },
  // {
  //   id: "BE004",
  //   description: "Query based on asserted fact: 'Is the sky blue?' after asserting 'The sky is blue.'",
  //   naturalLanguageInput: "Is the sky blue?",
  //   inputType: "query",
  //   expectedProlog: "is_color(sky, blue).",
  //   expectedAnswer: "Yes, the sky is blue.",
  //   metrics: ["exactMatchProlog", "exactMatchAnswer"],
  //   tags: ["query", "simple-query", "core", "dependent-BE001"],
  //   notes: "This case implicitly depends on BE001 being asserted in the same session by the strategy being tested."
  // },
  // {
  //   id: "BE005",
  //   description: "Query for variable based on rule: 'Who is mortal?' after asserting 'All humans are mortal.' and 'Socrates is a human.'",
  //   naturalLanguageInput: "Who is mortal?",
  //   inputType: "query",
  //   expectedProlog: "mortal(X).",
  //   expectedAnswer: "Socrates is mortal.",
  //   metrics: ["exactMatchProlog", "exactMatchAnswer"],
  //   tags: ["query", "rule-query", "core", "dependent-BE002"],
  //   notes: "Depends on BE002 and an assertion like 'is_a(socrates, human).' being present in the session. The NL answer match might be less strict."
  // },
  {
    id: "BE006_NegatedFact",
    description: "Negated fact assertion: 'Paris is not the capital of Germany.'",
    naturalLanguageInput: "Paris is not the capital of Germany.",
    inputType: "assert",
    expectedProlog: ["not(is_capital_of(paris, germany))."],
    metrics: ["exactMatchProlog"],
    tags: ["assertion", "negation", "core", "reduced-set"],
    notes: "Tests handling of negation. Expected Prolog is for SIR-style negation."
  },
  // {
  //   id: "BE007",
  //   description: "Query involving negation: 'Is Paris the capital of Germany?' after asserting it's not.",
  //   naturalLanguageInput: "Is Paris the capital of Germany?",
  //   inputType: "query",
  //   expectedProlog: "is_capital_of(paris, germany).",
  //   expectedAnswer: "No, Paris is not the capital of Germany.",
  //   metrics: ["exactMatchProlog", "exactMatchAnswer"],
  //   tags: ["query", "negation-query", "core", "dependent-BE006"],
  //   notes: "Depends on BE006. Tests querying a fact known to be false."
  // },
];

module.exports = baseEvals;
