// new/src/prompts.js

// Helper function to fill templates (simple version)
function fillTemplate(template, variables) {
  let filled = template;
  for (const key in variables) {
    // eslint-disable-next-line no-prototype-builtins
    if (variables.hasOwnProperty(key)) {
      const placeholder = `{{${key}}}`;
      if (template.includes(placeholder)) {
        // Fixed: removed unnecessary escape for / in the character class
        const regex = new RegExp(
          placeholder.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&'),
          'g'
        );
        filled = filled.replace(regex, variables[key]);
      }
    }
  }

  // After all replacements, check for any remaining {{...}} placeholders
  const remainingPlaceholders = filled.match(/\{\{.*?\}\}/g);
  if (remainingPlaceholders) {
    // More specific error: find first placeholder that was in original template but not replaced
    const originalPlaceholders = template.match(/\{\{([^{}]+)\}\}/g) || [];
    for (const origPlaceholder of originalPlaceholders) {
      const keyName = origPlaceholder.substring(2, origPlaceholder.length - 2);
      // eslint-disable-next-line no-prototype-builtins
      if (!variables.hasOwnProperty(keyName)) {
        throw new Error(
          `Placeholder '{{${keyName}}}' not found in input variables.`
        );
      }
    }
    // Fallback if the above doesn't pinpoint (e.g. if a variable replacement introduced a new placeholder)
    throw new Error(
      `Unresolved placeholders remain: ${remainingPlaceholders.join(', ')}`
    );
  }

  return filled;
}

const prompts = {
  // For translating natural language text to Prolog-style facts and rules
  NL_TO_LOGIC: {
    system: `You are an expert AI assistant that translates natural language statements into Prolog facts and rules.
- Consider the EXISTING FACTS and ONTOLOGY RULES provided below for context, vocabulary, and to avoid redundancy.
- Infer predicate names and arity from the natural language and the provided context. Prefer established predicate structures found in the context.
- Represent general rules using standard Prolog syntax (e.g., \`parent(X, Y) :- father(X, Y).\`).
- Ensure all outputs are valid Prolog syntax. Each fact or rule must end with a period.
- If multiple distinct facts or rules are present in the input, output each on a new line.
- Do not add any comments or explanations, only the Prolog code.
- If the input implies a query rather than a statement of fact, try to rephrase it as a statement if possible, or respond with \`% Cannot convert query to fact.\`
- Focus on direct translation of the NEW TEXT TO TRANSLATE. Do not repeat items from existing facts unless the new text explicitly overrides or restates them.
- Examples:
  - New Text: "The sky is blue." -> \`is_color(sky, blue).\`
  - New Text: "All humans are mortal." -> \`mortal(X) :- human(X).\`
  - New Text: "Socrates is a human." -> \`human(socrates).\`
  - New Text: "John is Mary's father." -> \`father(john, mary).\`
  - New Text: "Cats like fish." -> \`likes(X, fish) :- cat(X).\`
  - New Text: "What is the color of the sky?" -> \`% Cannot convert query to fact.\``,
    user: `EXISTING FACTS:
\`\`\`prolog
{{existingFacts}}
\`\`\`

ONTOLOGY RULES:
\`\`\`prolog
{{ontologyRules}}
\`\`\`

Based on the context above, translate ONLY the following NEW natural language text into Prolog facts and/or rules:

New Text: "{{naturalLanguageText}}"

Prolog:`,
  },

  // For translating a natural language question into a Prolog query
  NL_TO_QUERY: {
    system: `You are an expert AI assistant that translates natural language questions into Prolog queries.
- Consider the EXISTING FACTS and ONTOLOGY RULES provided below for context and vocabulary to formulate an accurate query.
- The query should be a single, valid Prolog query string.
- The query must end with a period.
- Use variables (e.g., X, Y, Name) for unknown elements the question is asking about.
- Do not add any comments or explanations, only the Prolog query.
- Examples:
  - Question: "Is the sky blue?" (Given \`is_color(sky,blue).\` in facts) -> \`is_color(sky, blue).\`
  - Question: "Who is mortal?" (Given \`mortal(X) :- human(X).\` and \`human(socrates).\`) -> \`mortal(X).\`
  - Question: "Is Socrates mortal?" -> \`mortal(socrates).\`
  - Question: "Who is Mary's father?" -> \`father(X, mary).\`
  - Question: "What do cats like?" -> \`cat(C), likes(C, Food).\` (If 'cat' is a type and likes uses instances)
  - Question: "What color is the sky?" -> \`is_color(sky, Color).\``,
    user: `EXISTING FACTS:
\`\`\`prolog
{{existingFacts}}
\`\`\`

ONTOLOGY RULES:
\`\`\`prolog
{{ontologyRules}}
\`\`\`

Based on the context above, translate the following natural language question into a single Prolog query:

Question: "{{naturalLanguageQuestion}}"

Prolog Query:`,
  },

  // For translating Prolog query results back into natural language
  LOGIC_TO_NL_ANSWER: {
    system: `You are an expert AI assistant that explains Prolog query results in concise, natural language.
- The user asked a question, it was translated to a Prolog query, and the query returned some results (or no results).
- Your task is to formulate a natural language answer to the original question based on these results.
- Be direct.
- Adhere to the requested output STYLE.
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
    user: `Original Question: "{{naturalLanguageQuestion}}"\nProlog Query Results: {{prologResultsJSON}}\nRequested Output STYLE: {{style}}\n\nNatural Language Answer:`,
  },
  // For translating natural language text directly to Prolog facts/rules (standalone)
  NL_TO_RULES_DIRECT: {
    // System prompt can be similar to NL_TO_LOGIC, or more focused on "rules" if needed.
    // For now, let's reuse NL_TO_LOGIC's system prompt as it's quite comprehensive for general Prolog generation.
    system: `You are an expert AI assistant that translates natural language statements into Prolog facts and rules.
- Represent facts as \`fact(subject, predicate, object).\` or \`predicate(subject, object).\` or \`attribute(entity, value).\`.
- Represent general rules using Prolog syntax (e.g., \`parent(X, Y) :- father(X, Y).\`).
- Ensure all outputs are valid Prolog syntax. Each fact or rule must end with a period.
- If multiple distinct facts or rules are present in the input, output each on a new line.
- Do not add any comments or explanations, only the Prolog code.
- Focus on direct translation of the given text. Do not infer wildly beyond what is stated.
- Examples:
  - "The sky is blue." -> \`is_color(sky, blue).\`
  - "All humans are mortal." -> \`mortal(X) :- human(X).\`
  - "Socrates is a human." -> \`human(socrates).\`
  - "John is Mary's father." -> \`father(john, mary).\`
  - "Cats like fish." -> \`likes(X, fish) :- cat(X).\``,
    user: `Translate the following natural language text into Prolog facts and/or rules:\n\nText: "{{naturalLanguageText}}"\n\nProlog:`,
  },

  // For translating a string of Prolog rules/facts directly to natural language
  RULES_TO_NL_DIRECT: {
    system: `You are an expert AI assistant that explains Prolog facts and rules in concise, natural language.
- Given a set of Prolog statements, provide a cohesive natural language explanation.
- Describe what the rules and facts mean in an understandable way.
- Do not mention "Prolog" explicitly unless it's necessary for clarity regarding syntax.
- Style: {{style}} (e.g., formal, conversational)
- Examples:
  - Rules: \`mortal(X) :- human(X).\nhuman(socrates).\`, Style: conversational -> Explanation: "This states that all humans are mortal, and Socrates is a human."
  - Rules: \`father(john, mary).\nparent(X,Y) :- father(X,Y).\`, Style: formal -> Explanation: "The system knows that John is the father of Mary. Additionally, it defines that an individual X is a parent of Y if X is the father of Y."`,
    user: `Explain the following Prolog facts and/or rules in natural language (style: {{style}}):\n\nProlog:\n{{prologRules}}\n\nNatural Language Explanation:`,
  },

  // For explaining how a Prolog query would be resolved against a knowledge base
  EXPLAIN_PROLOG_QUERY: {
    system: `You are an expert AI assistant that explains how a Prolog query would be resolved.
Given a natural language question, its translation into a Prolog query, the facts currently in the session, and any relevant global ontology rules, provide a clear, step-by-step explanation.
- Describe what the query is asking for in the context of the provided knowledge.
- Explain how the Prolog engine would attempt to match the query against the facts and rules.
- Mention which specific facts or rules would be relevant to satisfying the query.
- If variables are involved, explain how they would get instantiated.
- Conclude with what kind of result (e.g., true/false, specific values) one might expect.
- Do not actually execute the query; explain the process.
- Be clear and pedagogical.`,
    user: `Natural Language Question: "{{naturalLanguageQuestion}}"
Translated Prolog Query: \`{{prologQuery}}\`

Current Session Facts:
\`\`\`prolog
{{sessionFacts}}
\`\`\`

Active Global Ontology Rules:
\`\`\`prolog
{{ontologyRules}}
\`\`\`

Based on all the above, provide a detailed explanation of how the Prolog query would be processed against the combined knowledge base:`,
  },
  // Add more specialized prompts as needed

  NL_TO_SIR_ASSERT: {
    system: `You are an expert AI assistant that translates natural language statements into a structured JSON representation (SIR) for later conversion to Prolog.
Your output MUST be a single, complete JSON object that strictly adheres to the following schema:
\`\`\`json
{
  "type": "object",
  "properties": {
    "statementType": {
      "type": "string",
      "enum": ["fact", "rule"]
    },
    "fact": {
      "type": "object",
      "properties": {
        "predicate": {"type": "string", "description": "Name of the predicate (e.g., likes, father_of, is_color). Use lowercase snake_case. Infer predicate names from natural language; prefer existing predicate names if suitable ones are found in the provided context (EXISTING FACTS, ONTOLOGY RULES)."},
        "arguments": {"type": "array", "items": {"type": "string"}, "description": "List of arguments. Constants (e.g., 'john', 'book') should be lowercase. Variables (e.g., 'X', 'Person') should be ALL CAPS."},
        "isNegative": {"type": "boolean", "default": false, "description": "Set to true if the fact is negated (e.g., 'John does NOT like apples')."}
      },
      "required": ["predicate", "arguments"]
    },
    "rule": {
      "type": "object",
      "properties": {
        "head": { "$ref": "#/properties/fact", "description": "The conclusion of the rule, structured as a fact." },
        "body": {
          "type": "array",
          "items": { "$ref": "#/properties/fact" },
          "description": "A list of conditions (literals) for the rule, each structured as a fact. An empty list means the head is unconditionally true (like a fact)."
        }
      },
      "required": ["head", "body"]
    }
  },
  "required": ["statementType"],
  "oneOf": [
    { "description": "If statementType is 'fact', this object must be present.", "required": ["fact"] },
    { "description": "If statementType is 'rule', this object must be present.", "required": ["rule"] }
  ]
}
\`\`\`
- Classify the input text as asserting a single 'fact' or a single 'rule'.
- For facts:
  - "The sky is blue." -> \`{"statementType": "fact", "fact": {"predicate": "is_color", "arguments": ["sky", "blue"]}}\`
  - "John likes Mary." -> \`{"statementType": "fact", "fact": {"predicate": "likes", "arguments": ["john", "mary"]}}\`
  - "Fido is a dog." -> \`{"statementType": "fact", "fact": {"predicate": "is_a", "arguments": ["fido", "dog"]}}\`
  - "Paris is not in Germany." -> \`{"statementType": "fact", "fact": {"predicate": "is_in", "arguments": ["paris", "germany"], "isNegative": true}}\`
- For rules:
  - "All humans are mortal." -> \`{"statementType": "rule", "rule": {"head": {"predicate": "mortal", "arguments": ["X"]}, "body": [{"predicate": "human", "arguments": ["X"]}]}}\`
  - "If X is a parent of Y and Y is a parent of Z, then X is a grandparent of Z." ->
    \`{"statementType": "rule", "rule": {"head": {"predicate": "grandparent_of", "arguments": ["X", "Z"]}, "body": [{"predicate": "parent_of", "arguments": ["X", "Y"]}, {"predicate": "parent_of", "arguments": ["Y", "Z"]}]}}\`
  - "Birds fly." (interpreted as a general rule) -> \`{"statementType": "rule", "rule": {"head": {"predicate": "flies", "arguments": ["X"]}, "body": [{"predicate": "bird", "arguments": ["X"]}]}}\`
- Pay close attention to variable names (ALL CAPS) vs. constants (lowercase).
- Ensure the JSON output is syntactically correct and validates against the schema.
- Do NOT add any text before or after the JSON object. Output only the JSON.
- If the input text contains multiple distinct statements, focus on translating only the most prominent one or the first one if prominence is unclear. This tool is designed for single assertions.
- If the input is a question, not an assertion, output: \`{"error": "Input is a question, not an assertable statement."}\``,
    user: `EXISTING FACTS (for context, do not translate these):
\`\`\`prolog
{{existingFacts}}
\`\`\`

ONTOLOGY RULES (for context, do not translate these):
\`\`\`prolog
{{ontologyRules}}
\`\`\`

Based on the context above, translate ONLY the following NEW natural language text into the SIR JSON format:

New Text: "{{naturalLanguageText}}"

SIR JSON Output:`,
  },
};

module.exports = {
  prompts,
  fillTemplate,
};
