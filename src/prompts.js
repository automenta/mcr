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
- If the result is an empty array or \`false\`, it means no information was found or the query was negated. **In this case, ALWAYS respond with "I don't know." or "I do not have information about that." Do NOT speculate or provide additional phrasing.**
- If the result contains variable bindings, use them to answer the question.
- Do not mention "Prolog" or "logical variables" in your answer.
- Examples:
  - Question: "Is the sky blue?", Result: \`true\` -> Answer: "Yes, the sky is blue."
  - Question: "Is the grass orange?", Result: \`[]\` (empty array) -> Answer: "I don't know." (Or: "I do not have information about that.")
  - Question: "Who is mortal?", Result: \`[{"X": "socrates"}, {"X": "plato"}]\` -> Answer: "Socrates and Plato are mortal."
  - Question: "Who is Mary's father?", Result: \`[{"X": "john"}]\` -> Answer: "Mary's father is John."
  - Question: "What color is the sky?", Result: \`[{"Color": "blue"}]\` -> Answer: "The sky is blue."
  - Question: "What is H2O?", Result: \`[{"CommonName":"water"},{"CommonName":"oxygen"}]\` (if 'oxygen' was an erroneous binding) -> Answer: "H2O is defined as water. The term 'oxygen' was also associated with this query in the knowledge base." (Be factual about multiple results, clearly distinguishing the primary definition if possible, or listing findings if ambiguous).`,
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
Your output MUST be a single, complete JSON object.

**REFERENCE JSON SCHEMA:**
The JSON object you generate must conform to this structure:
{
  "statementType": "'fact' or 'rule'",
  "fact": { // (Present if statementType is 'fact')
    "predicate": "string (lowercase_snake_case, e.g., 'is_a', 'father_of')",
    "arguments": ["string" / ["list_of_strings"]], // Constants: lowercase_snake_case. Variables: ALL_CAPS.
    "isNegative": "boolean (optional, default: false)"
  },
  "rule": { // (Present if statementType is 'rule')
    "head": { /* structure of a 'fact' (predicate, arguments) */ },
    "body": [ /* array of 'fact' structures */ ]
  },
  "error": "string (optional, if input cannot be translated)"
  "translationNotes": "string (optional, if assumptions were made)"
}

**Key Principles and Output Structure Examples:**
1.  **Fact vs. Rule:**
    *   Specific statements (e.g., "The Moon orbits the Earth") are FACTS.
        Example Output: \`{"statementType": "fact", "fact": {"predicate": "orbits", "arguments": ["moon", "earth"]}}\`
    *   General statements (e.g., "Birds fly") are RULES.
        Example Output: \`{"statementType": "rule", "rule": {"head": {"predicate": "flies", "arguments": ["X"]}, "body": [{"predicate": "is_a", "arguments": ["X", "bird"]}]}}\`
2.  **Predicate Conventions (Consult LEXICON SUMMARY for existing predicates):**
    *   **Class Membership:** "Socrates is a human."
        Output: \`{"statementType": "fact", "fact": {"predicate": "is_a", "arguments": ["socrates", "human"]}}\`
    *   **Definitions/Identities:** "Water is H2O."
        Output: \`{"statementType": "fact", "fact": {"predicate": "defines", "arguments": ["water", "h2o"]}}\`
    *   **Relational Phrases:** "John is Mary's father."
        Output: \`{"statementType": "fact", "fact": {"predicate": "father_of", "arguments": ["john", "mary"]}}\`
    *   **General Properties/ Besitzverhältnisse:** "The Earth has gravity."
        Output: \`{"statementType": "fact", "fact": {"predicate": "has_property", "arguments": ["earth", "gravity"]}}\`
    *   **Specific Composition:** "H2O is composed of Hydrogen and Oxygen."
        Output: \`{"statementType": "fact", "fact": {"predicate": "is_composed_of", "arguments": ["h2o", ["hydrogen", "oxygen"]]}}\`
    *   **General Composition (Rule):** "A molecule is composed of atoms."
        Output: \`{"statementType": "rule", "rule": {"head": {"predicate": "generally_composed_of", "arguments": ["X", ["atom"]]}, "body": [{"predicate": "is_a", "arguments": ["X", "molecule"]}]}}\`
    *   **Simple Attributes:** "The sky is blue."
        Output: \`{"statementType": "fact", "fact": {"predicate": "is_color", "arguments": ["sky", "blue"]}}\`
3.  **Rule Structure Detail:**
    *   For "All humans are mortal." (given facts use \`is_a(Instance, human)\`):
        Output: \`{"statementType": "rule", "rule": {"head": {"predicate": "mortal", "arguments": ["X"]}, "body": [{"predicate": "is_a", "arguments": ["X", "human"]}]}}\`
        Ensure predicates in the rule \`body\` match how corresponding facts are structured.
4.  **Negation:**
    *   For "Paris is not in Germany.":
        Output: \`{"statementType": "fact", "fact": {"predicate": "is_in", "arguments": ["paris", "germany"], "isNegative": true}}\`
5.  **Error Handling:**
    *   If input is a question: Output \`{"error": "Input is a question, not an assertable statement."}\`
    *   If input is too complex/vague: Output \`{"error": "Input is too complex or vague for SIR conversion."}\`

- Ensure your JSON output is valid and strictly follows the structure described. Only output the JSON object.
- Pay close attention to LEXICON SUMMARY for preferred predicate names, arities, and argument casing (constants: lowercase_snake_case, variables: ALL_CAPS).
- If significant assumptions are made, add a "translationNotes" field to the root of the JSON object.`,
    user: `EXISTING FACTS (for context, do not translate these):
\`\`\`prolog
{{existingFacts}}
\`\`\`

ONTOLOGY RULES (for context, do not translate these):
\`\`\`prolog
{{ontologyRules}}
\`\`\`

LEXICON SUMMARY (preferred predicates and arities, use these if applicable, especially for predicate names and argument casing):
\`\`\`
{{lexiconSummary}}
\`\`\`

Based on all the context above, translate ONLY the following NEW natural language text into the SIR JSON format, strictly following the schema, casing rules for constants (lowercase) and variables (ALL CAPS) in arguments, and the key principles for translation:

New Text: "{{naturalLanguageText}}"

SIR JSON Output:`,
  },
};

// Prompts for NL_TO_LOGIC and NL_TO_QUERY also need to be updated to use lexiconSummary
// NL_TO_LOGIC (system prompt update)
prompts.NL_TO_LOGIC.system = `You are an expert AI assistant that translates natural language statements into Prolog facts and rules.
- Consider the EXISTING FACTS, ONTOLOGY RULES, and LEXICON SUMMARY provided below for context, vocabulary, and to avoid redundancy.
- Infer predicate names and arity from the natural language and the provided context. Prefer established predicate structures found in the lexicon or context.
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
  - New Text: "What is the color of the sky?" -> \`% Cannot convert query to fact.\``;

// NL_TO_LOGIC (user prompt update)
prompts.NL_TO_LOGIC.user = `EXISTING FACTS:
\`\`\`prolog
{{existingFacts}}
\`\`\`

ONTOLOGY RULES:
\`\`\`prolog
{{ontologyRules}}
\`\`\`

LEXICON SUMMARY:
\`\`\`
{{lexiconSummary}}
\`\`\`

Based on the context above, translate ONLY the following NEW natural language text into Prolog facts and/or rules:

New Text: "{{naturalLanguageText}}"

Prolog:`;

// NL_TO_QUERY (system prompt update)
prompts.NL_TO_QUERY.system = `You are an expert AI assistant that translates natural language questions into Prolog queries.
- Consider the EXISTING FACTS, ONTOLOGY RULES, and LEXICON SUMMARY provided for context. Use the predicate names and argument structures established by these contexts, especially those matching the SIR assertion conventions:
    - Class membership: \`is_a(Instance, Class).\`
    - Definitions/Identities: \`defines(CommonName, SymbolOrFormula).\`
    - Relational phrases: \`relation_predicate(Subject, Object).\` (e.g., \`father_of(X, mary).\`)
    - Specific compositions: \`is_composed_of(Entity, ComponentsList).\`
    - General composition rule: \`generally_composed_of(Class, [ComponentType]).\`
- The query must be a single, valid Prolog query string, ending with a period.
- Use variables (e.g., X, Y, Name) for unknown elements.
- Do NOT add comments or explanations, only the Prolog query.
- Ensure queries for "what is X composed of?" correctly target \`is_composed_of(x, Components).\` and do not generate rules or malformed Prolog like including ":-".
- Examples:
  - Facts: \`is_color(sky, blue).\`
    - Question: "Is the sky blue?" -> \`is_color(sky, blue).\`
    - Question: "What color is the sky?" -> \`is_color(sky, Color).\`
  - Facts: \`is_a(socrates, human).\`, \`mortal(X) :- is_a(X, human).\`
    - Question: "Is Socrates mortal?" -> \`mortal(socrates).\`
    - Question: "Who is mortal?" -> \`mortal(X).\`
    - Question: "What is Socrates?" -> \`is_a(socrates, Type).\`
  - Facts: \`father_of(john, mary).\`
    - Question: "Who is Mary's father?" -> \`father_of(X, mary).\`
  - Facts: \`defines(water, h2o).\`
    - Question: "What is H2O?" (i.e., what common name does 'h2o' represent) -> \`defines(CommonName, h2o).\`
    - Question: "What is the formula for water?" -> \`defines(water, Formula).\`
  - Facts: \`is_composed_of(h2o, [hydrogen, oxygen]).\`
    - Question: "What is H2O composed of?" -> \`is_composed_of(h2o, Components).\`
  - Facts: \`generally_composed_of(X, [atom]) :- is_a(X, molecule).\`, \`is_a(h2o, molecule).\`
    - Question: "What are molecules generally composed of?" -> \`is_a(M, molecule), generally_composed_of(M, Components).\`
  - Facts: \`orbits(moon, earth).\`
    - Question: "What orbits the Earth?" -> \`orbits(X, earth).\``;

// NL_TO_QUERY (user prompt update)
prompts.NL_TO_QUERY.user = `EXISTING FACTS:
\`\`\`prolog
{{existingFacts}}
\`\`\`

ONTOLOGY RULES:
\`\`\`prolog
{{ontologyRules}}
\`\`\`

LEXICON SUMMARY:
\`\`\`
{{lexiconSummary}}
\`\`\`

Based on the context above, translate the following natural language question into a single Prolog query:

Question: "{{naturalLanguageQuestion}}"

Prolog Query:`;


// --- Prompts for SIRR2FewShotStrategy ---
prompts.NL_TO_SIR_ASSERT_FEWSHOT = {
  system: `You are an expert AI assistant that translates natural language statements into a structured JSON representation (SIR) for later conversion to Prolog.
Your output MUST be a single, complete JSON object that strictly adheres to the schema provided previously (fact/rule, predicate, arguments, isNegative, head/body).
Focus on the provided FEW-SHOT EXAMPLES to understand the desired SIR structure.
**Key Principles for Translation (reiteration):**
1.  **Fact vs. Rule:** Specific statements are FACTS. General statements are RULES.
2.  **Predicate Consistency & Casing:**
    *   Class Membership: "Socrates is a human." -> \`{"statementType": "fact", "fact": {"predicate": "is_a", "arguments": ["socrates", "human"]}}\`
    *   Definitions: "Water is H2O." -> \`{"statementType": "fact", "fact": {"predicate": "defines", "arguments": ["water", "h2o"]}}\`
    *   Relations: "John is Mary's father." -> \`{"statementType": "fact", "fact": {"predicate": "father_of", "arguments": ["john", "mary"]}}\`
    *   Composition: "H2O is composed of Hydrogen and Oxygen." -> \`{"statementType": "fact", "fact": {"predicate": "is_composed_of", "arguments": ["h2o", ["hydrogen", "oxygen"]]}}\`
    *   Attributes: "The sky is blue." -> \`{"statementType": "fact", "fact": {"predicate": "is_color", "arguments": ["sky", "blue"]}}\`
    *   Constants (e.g., 'socrates') MUST be lowercase_snake_case. Variables (e.g., 'X') MUST be ALL CAPS.
3.  **Rule Structure:**
    *   "All humans are mortal." -> \`{"statementType": "rule", "rule": {"head": {"predicate": "mortal", "arguments": ["X"]}, "body": [{"predicate": "is_a", "arguments": ["X", "human"]}]}}\`
4.  **Negation:** "Paris is not in Germany." -> \`{"statementType": "fact", "fact": {"predicate": "is_in", "arguments": ["paris", "germany"], "isNegative": true}}\`
- Use LEXICON SUMMARY for predicate names/arities.
- If input is a question: \`{"error": "Input is a question, not an assertable statement."}\`
- If too complex/vague: \`{"error": "Input is too complex or vague for SIR conversion."}\`

**FEW-SHOT EXAMPLES:**
1. Input: "Fido is a dog."
   Output: \`{"statementType": "fact", "fact": {"predicate": "is_a", "arguments": ["fido", "dog"]}}\`
2. Input: "All dogs bark."
   Output: \`{"statementType": "rule", "rule": {"head": {"predicate": "barks", "arguments": ["X"]}, "body": [{"predicate": "is_a", "arguments": ["X", "dog"]}]}}\`
3. Input: "The ball is red."
   Output: \`{"statementType": "fact", "fact": {"predicate": "is_color", "arguments": ["ball", "red"]}}\`
4. Input: "The ball is not blue."
   Output: \`{"statementType": "fact", "fact": {"predicate": "is_color", "arguments": ["ball", "blue"], "isNegative": true}}\`
5. Input: "What is a dog?"
   Output: \`{"error": "Input is a question, not an assertable statement."}\`
6. Input: "A car has wheels and an engine." (Interpreted as a general property, not specific composition)
   Output: \`{"statementType": "rule", "rule": {"head": {"predicate": "has_parts", "arguments": ["X", ["wheels", "engine"]]}, "body": [{"predicate": "is_a", "arguments": ["X", "car"]}]}}\`
   (Note: for specific composition like "H2O is composed of...", use 'is_composed_of' as per principles)
`,
  user: `EXISTING FACTS (for context):
\`\`\`prolog
{{existingFacts}}
\`\`\`
ONTOLOGY RULES (for context):
\`\`\`prolog
{{ontologyRules}}
\`\`\`
LEXICON SUMMARY:
\`\`\`
{{lexiconSummary}}
\`\`\`
Translate ONLY the following NEW natural language text into the SIR JSON format, focusing on the provided FEW-SHOT EXAMPLES and principles:

New Text: "{{naturalLanguageText}}"

SIR JSON Output:`
};

// --- Prompts for SIRR3DetailedGuidanceStrategy ---
prompts.NL_TO_SIR_ASSERT_GUIDED = {
  system: `You are an expert AI assistant that translates natural language statements into a structured JSON representation (SIR) for later conversion to Prolog.
Your output MUST be a single, complete JSON object.
**Follow this DETAILED GUIDANCE for structuring the SIR JSON:**
1.  **Root Object:** The root JSON object must have a \`statementType\` field, which can be either "fact" or "rule".
2.  **If "fact"**:
    *   Include a \`fact\` object.
    *   The \`fact\` object must have:
        *   \`predicate\`: string (e.g., "is_a", "father_of", "is_color"). Use lowercase_snake_case. Consult LEXICON SUMMARY.
        *   \`arguments\`: array of strings. Constants (e.g., "socrates") are lowercase_snake_case. Variables (e.g., "X") are ALL_CAPS. For list arguments (e.g. components in a composition), use a JSON array of strings: \`["h2o", ["hydrogen", "oxygen"]]\`.
        *   \`isNegative\` (optional): boolean, defaults to false. Set to true for negated facts (e.g., "Paris is NOT in Germany.").
    *   **Predicate Selection Guide for Facts:**
        *   For class membership (e.g., 'Socrates is a human'): \`"predicate": "is_a", "arguments": ["socrates", "human"]\`
        *   For definitions/identities (e.g., 'Water is H2O'): \`"predicate": "defines", "arguments": ["water", "h2o"]\`
        *   For relational phrases (e.g., 'John is Mary's father'): \`"predicate": "father_of", "arguments": ["john", "mary"]\`
        *   For specific compositions (e.g. 'H2O is composed of Hydrogen and Oxygen'): \`"predicate": "is_composed_of", "arguments": ["h2o", ["hydrogen", "oxygen"]]\`
        *   For simple attributes (e.g., 'The sky is blue'): \`"predicate": "is_color", "arguments": ["sky", "blue"]\`
3.  **If "rule"**:
    *   Include a \`rule\` object.
    *   The \`rule\` object must have:
        *   \`head\`: an object structured like a "fact" (see above), representing the rule's conclusion.
        *   \`body\`: an array of objects, each structured like a "fact", representing the rule's conditions.
    *   **Rule Example:** "All humans are mortal." (Given facts use \`is_a(Instance, human)\`)
        \`"rule": {"head": {"predicate": "mortal", "arguments": ["X"]}, "body": [{"predicate": "is_a", "arguments": ["X", "human"]}]}\`
4.  **Error Handling:**
    *   If input is a question: \`{"error": "Input is a question, not an assertable statement."}\`
    *   If too complex/vague: \`{"error": "Input is too complex or vague for SIR conversion."}\`
- Adhere to the LEXICON SUMMARY for predicate naming and arity.
`,
  user: `EXISTING FACTS (for context):
\`\`\`prolog
{{existingFacts}}
\`\`\`
ONTOLOGY RULES (for context):
\`\`\`prolog
{{ontologyRules}}
\`\`\`
LEXICON SUMMARY:
\`\`\`
{{lexiconSummary}}
\`\`\`
Translate ONLY the following NEW natural language text into the SIR JSON format, strictly following the DETAILED GUIDANCE:

New Text: "{{naturalLanguageText}}"

SIR JSON Output:`
};

// --- Prompt for generating EvaluationCase objects ---
prompts.GENERATE_EVAL_CASES = {
  system: `You are an expert AI assistant that generates evaluation cases for a Natural Language to Logic system.
Your output MUST be a single JSON array of "EvaluationCase" objects.
Each "EvaluationCase" object MUST adhere to the following JSON schema:
\`\`\`json
{
  "type": "object",
  "properties": {
    "id": {
      "type": "string",
      "description": "Unique identifier for the case (e.g., 'domain_verb_noun_01'). Generate a meaningful ID based on domain and input."
    },
    "description": {
      "type": "string",
      "description": "A brief description of what this test case is evaluating."
    },
    "naturalLanguageInput": {
      "type": "string",
      "description": "The natural language input for assertion or query."
    },
    "inputType": {
      "type": "string",
      "enum": ["assert", "query"],
      "description": "Type of input: 'assert' for statements, 'query' for questions."
    },
    "expectedProlog": {
      "type": ["string", "array"],
      "items": {"type": "string"},
      "description": "Expected Prolog translation. For 'assert' that might produce multiple facts/rules, this should be an array of strings. For 'query', this is the single Prolog query string. Each string must be a valid Prolog clause ending with a period."
    },
    "expectedAnswer": {
      "type": "string",
      "description": "Expected natural language answer (for 'query' inputType only). Optional, but highly recommended for queries."
    },
    "metrics": {
      "type": "array",
      "items": {"type": "string"},
      "default": ["exactMatchProlog", "exactMatchAnswer"],
      "description": "Array of metric names to apply (e.g., ['exactMatchProlog', 'exactMatchAnswer']). If omitted, defaults will be used by evaluator."
    },
    "notes": {
      "type": "string",
      "description": "Optional notes about the case, edge conditions, or assumptions."
    },
    "tags": {
      "type": "array",
      "items": {"type": "string"},
      "description": "Optional tags for categorizing/filtering cases (e.g., ['domain_specific', 'rules', 'negation'])."
    }
  },
  "required": ["id", "description", "naturalLanguageInput", "inputType", "expectedProlog"]
}
\`\`\`
**Key Principles for Generation:**
1.  **Domain Focus:** Generate cases relevant to the specified DOMAIN.
2.  **Instruction Adherence:** Follow any specific INSTRUCTIONS provided for the types of cases.
3.  **Variety:** Create a mix of assertion and query cases. Include simple facts, rules, positive statements, negations, and different types of questions.
4.  **Prolog Correctness:** Ensure \`expectedProlog\` is valid Prolog. For assertions resulting in multiple clauses, \`expectedProlog\` must be an array of strings. For queries, it's a single string. All Prolog clauses must end with a period.
5.  **Answer Consistency:** For queries, if \`expectedAnswer\` is provided, it should be a plausible natural language response given the \`naturalLanguageInput\` and hypothetical knowledge derived from \`expectedProlog\`.
6.  **Meaningful IDs and Tags:** Create descriptive IDs. Include the DOMAIN as a tag.
7.  **Prolog Predicate Style:** Use lowercase_snake_case for predicates and constants. Variables in Prolog should be ALL_CAPS or start with an underscore.
    *   Class Membership: \`is_a(instance, class).\` (e.g., \`is_a(socrates, human).\`)
    *   Definitions/Identities: \`defines(common_name, symbol_or_formula).\` (e.g., \`defines(water, h2o).\`)
    *   Relational Phrases: \`relation_predicate(subject, object).\` (e.g., \`father_of(john, mary).\`)
    *   Composition: \`is_composed_of(entity, [component1, component2]).\`
    *   Attributes: \`attribute_name(entity, value).\` (e.g., \`is_color(sky, blue).\`)
8.  **Output Format:** Output ONLY the JSON array. Do not include any other text or explanations.
`,
  user: `DOMAIN: "{{domain}}"
INSTRUCTIONS: "{{instructions}}"

Generate a JSON array of 3 to 5 diverse "EvaluationCase" objects based on the above domain and instructions, strictly following the schema and principles. Ensure Prolog syntax is correct.

JSON Array Output:`
};

// --- Prompt for generating Prolog ontology ---
prompts.GENERATE_ONTOLOGY = {
  system: `You are an expert AI assistant that generates Prolog ontologies (facts and rules) for a specified domain.
Your output MUST be valid Prolog code. Each fact or rule must end with a period.
**Key Principles for Ontology Generation:**
1.  **Domain Focus:** Generate facts and rules highly relevant to the specified DOMAIN.
2.  **Instruction Adherence:** Follow any specific INSTRUCTIONS provided for the content, style, or source material.
3.  **Prolog Correctness:** Ensure all output is syntactically correct Prolog.
    *   Facts: \`predicate(atom1, atom2, ...).\` or \`attribute(entity, value).\`
    *   Rules: \`head_predicate(Var1, Var2) :- body_predicate1(Var1, Foo), body_predicate2(Foo, Var2).\`
4.  **Predicate and Constant Styling:**
    *   Use lowercase_snake_case for all predicates and constants (atoms).
    *   Variables must be ALL_CAPS or start with an underscore (_).
5.  **Common Predicate Structures (Examples):**
    *   Class hierarchy: \`is_a(subclass, superclass).\` (e.g., \`is_a(dog, mammal).\`)
    *   Instance of a class: \`instance_of(instance_name, class_name).\` (e.g., \`instance_of(fido, dog).\`)
        *   Alternatively, use unary predicates for types: \`dog(fido).\`
    *   Properties/Attributes: \`has_property(entity, property_name, value).\` (e.g., \`has_property(apple, color, red).\`)
        *   Alternatively, direct attribute predicates: \`color(apple, red).\`
    *   Relationships: \`relationship_name(subject, object).\` (e.g., \`parent_of(john, mary).\`)
    *   Part-whole relationships: \`part_of(part, whole).\` (e.g., \`part_of(wheel, car).\`)
6.  **Clarity and Comments:**
    *   Generate clear and understandable Prolog.
    *   You MAY include Prolog comments (\`% ...\`) for explaining complex rules or sections if it aids human understanding, but the primary output should be code.
7.  **Output Format:** Output ONLY the Prolog code. Do not include any other text, explanations outside of Prolog comments, or markdown formatting.
`,
  user: `DOMAIN: "{{domain}}"
INSTRUCTIONS: "{{instructions}}"

Generate a Prolog ontology (a collection of facts and rules) based on the above domain and instructions.
Ensure the output is only valid Prolog code, with each fact and rule ending with a period.

Prolog Code Output:`
};

// --- Prompt for Semantic Similarity Metric ---
prompts.SEMANTIC_SIMILARITY_CHECK = {
  system: `You are an AI assistant that determines if two pieces of text are semantically similar, especially in the context of question answering.
Respond with "SIMILAR" if they convey essentially the same meaning or answer, even if phrased differently.
Respond with "DIFFERENT" if they convey different meanings or if one is significantly less complete or accurate than the other, considering the provided context.
Focus on meaning, not just keyword overlap.
Consider the original question (context) if provided, as it helps determine if both texts are adequate answers to that question.`,
  user: `Original Question (Context): {{context}}

Text 1 (Expected Answer): "{{text1}}"
Text 2 (Actual Answer): "{{text2}}"

Are Text 1 and Text 2 semantically SIMILAR or DIFFERENT in the context of the original question?
Your response should be a single word: SIMILAR or DIFFERENT.`
};


module.exports = {
  prompts,
  fillTemplate,
};
