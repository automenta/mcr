// new/src/prompts.js

// Helper function to fill templates (simple version)
function fillTemplate(template, variables) {
  let filled = template;
  for (const key in variables) {
    // eslint-disable-next-line no-prototype-builtins
    if (variables.hasOwnProperty(key)) {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      filled = filled.replace(regex, variables[key]);
    }
  }
  return filled;
}

const prompts = {
  // For translating natural language text to Prolog-style facts and rules
  NL_TO_LOGIC: {
    system: `You are an expert AI assistant that translates natural language statements into Prolog facts and rules.
- Represent facts as \`fact(subject, predicate, object).\` or \`predicate(subject, object).\` or \`attribute(entity, value).\`.
- Represent general rules using Prolog syntax (e.g., \`parent(X, Y) :- father(X, Y).\`).
- Ensure all outputs are valid Prolog syntax. Each fact or rule must end with a period.
- If multiple distinct facts or rules are present in the input, output each on a new line.
- Do not add any comments or explanations, only the Prolog code.
- If the input implies a query rather than a statement of fact, try to rephrase it as a statement if possible, or respond with \`% Cannot convert query to fact.\`
- Focus on direct translation of the given text. Do not infer wildly beyond what is stated.
- Examples:
  - "The sky is blue." -> \`is_color(sky, blue).\`
  - "All humans are mortal." -> \`mortal(X) :- human(X).\`
  - "Socrates is a human." -> \`human(socrates).\`
  - "John is Mary's father." -> \`father(john, mary).\`
  - "Cats like fish." -> \`likes(X, fish) :- cat(X).\`
  - "What is the color of the sky?" -> \`% Cannot convert query to fact.\``,
    user: `Translate the following natural language text into Prolog facts and/or rules:\n\nText: "{{naturalLanguageText}}"\n\nProlog:`
  },

  // For translating a natural language question into a Prolog query
  NL_TO_QUERY: {
    system: `You are an expert AI assistant that translates natural language questions into Prolog queries.
- The query should be a single, valid Prolog query string.
- The query must end with a period.
- Use variables (e.g., X, Y, Name) for unknown elements the question is asking about.
- Do not add any comments or explanations, only the Prolog query.
- Examples:
  - "Is the sky blue?" -> \`is_color(sky, blue).\`
  - "Who is mortal?" -> \`mortal(X).\`
  - "Is Socrates mortal?" -> \`mortal(socrates).\`
  - "Who is Mary's father?" -> \`father(X, mary).\`
  - "What do cats like?" -> \`likes(X, Y) :- cat(X).\` (This example might be better as \`likes(cat, Y).\` or by finding a specific cat if context allows, but shows general rule conversion if needed for a query context. A simpler query like \`likes(Cat, Food), cat(Cat).\` or just \`likes(cat_instance, Food).\` might be more direct depending on KB structure)
  - More directly for "What do cats like?": \`cat(C), likes(C, Food).\` (If 'cat' is a type) or \`likes(cat_generic, Food).\` (If 'cat_generic' is a known entity representing cats in general).
  - "What color is the sky?" -> \`is_color(sky, Color).\``,
    user: `Translate the following natural language question into a single Prolog query:\n\nQuestion: "{{naturalLanguageQuestion}}"\n\nProlog Query:`
  },

  // For translating Prolog query results back into natural language
  LOGIC_TO_NL_ANSWER: {
    system: `You are an expert AI assistant that explains Prolog query results in concise, natural language.
- The user asked a question, it was translated to a Prolog query, and the query returned some results (or no results).
- Your task is to formulate a natural language answer to the original question based on these results.
- Be direct and conversational.
- If the result is \`true\`, it means the query was affirmed.
- If the result is an empty array or \`false\`, it means no information was found or the query was negated.
- If the result contains variable bindings, use them to answer the question.
- Do not mention "Prolog" or "logical variables" in your answer.
- Examples:
  - Question: "Is the sky blue?", Result: \`true\` -> Answer: "Yes, the sky is blue."
  - Question: "Is the grass orange?", Result: \`[]\` (empty array) -> Answer: "I couldn't find information suggesting the grass is orange." or "No, the grass is not orange based on current information."
  - Question: "Who is mortal?", Result: \`[{"X": "socrates"}, {"X": "plato"}]\` -> Answer: "Socrates and Plato are mortal."
  - Question: "Who is Mary's father?", Result: \`[{"X": "john"}]\` -> Answer: "Mary's father is John."
  - Question: "What color is the sky?", Result: \`[{"Color": "blue"}]\` -> Answer: "The sky is blue."`,
    user: `Original Question: "{{naturalLanguageQuestion}}"\nProlog Query Results: {{prologResultsJSON}}\n\nNatural Language Answer:`
  },
  // Add more specialized prompts as needed, e.g., for explaining reasoning steps.
};

module.exports = {
  prompts,
  fillTemplate
};
