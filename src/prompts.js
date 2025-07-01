const PROMPT_TEMPLATES = {
  NL_TO_RULES: `You are an expert AI that translates natural language into a list of Prolog facts/rules.
Your output MUST be a valid JSON array of strings, where each string is a single, complete Prolog statement ending with a period.

Use the following structures:
- For statements describing a property of an object (e.g., "The sky is blue"), use: \`fact(object, property, value).\`
  Example: "The sky is blue" -> \`fact(sky, color, blue).\`
- For statements asserting a state or boolean property (e.g., "Grass is green"), use: \`is(object, state_or_property).\`
  Example: "Grass is green" -> \`is(grass, green).\`
- If the input is a more complex rule, translate it appropriately.

If the 'TEXT TO TRANSLATE' already appears to be one or more valid Prolog statements, then simply return those statements, each as a separate string in the JSON array, ensuring they conform to the specified structures if possible.
If the 'TEXT TO TRANSLATE' contains multiple distinct natural language statements that should convert to multiple Prolog facts/rules, ensure each resulting Prolog statement is a separate string in the output JSON array.

        CONTEXTUAL KNOWLEDGE BASE (existing facts):
        \`\`\`prolog
        {existing_facts}
        \`\`\`
        PRE-DEFINED ONTOLOGY (for context):
        \`\`\`prolog
        {ontology_context}
        \`\`\`
        Based on ALL the context above, translate ONLY the following new text. Do not repeat facts from the knowledge base.
        TEXT TO TRANSLATE: "{text_to_translate}"
        JSON OUTPUT:`,

  QUERY_TO_PROLOG: `Translate the natural language question into a single, valid Prolog query string. The query must end with a period.
Use the following structures for queries:
- For questions about a property of an object (e.g., "What color is the sky?"), use: \`fact(object, property, Variable).\` (Ensure 'Variable' starts with an uppercase letter).
  Example: "What color is the sky?" -> \`fact(sky, color, What).\`
- For questions asking if a state or boolean property is true (e.g., "Is grass green?"), use: \`is(object, state_or_property).\`
  Example: "Is grass green?" -> \`is(grass, green).\`
- If the question implies a more complex query, translate it appropriately using these structures as a base.

        Question: "{question}"
        Prolog Query:`,

  RESULT_TO_NL: `You are a helpful AI assistant. Given an original question and a result from a logic engine, provide a simple, conversational answer.
        Style: {style}
        Original Question: "{original_question}"
        Logic Engine Result: {logic_result}
        Conversational Answer:`,

  RULES_TO_NL: `Translate the following list of Prolog rules into a single, cohesive natural language explanation.
        Style: {style}
        RULES:
        \`\`\`prolog
        {prolog_rules}
        \`\`\`
        Natural Language Explanation:`,

  EXPLAIN_QUERY: `You are an expert AI that explains Prolog queries in natural language. Given a Prolog query, existing facts, and ontology context, provide a detailed, step-by-step explanation of how the query would be resolved. Describe what the query is asking, how it interacts with the provided facts and rules, and what kind of result to expect.

        EXISTING FACTS:
        \`\`\`prolog
        {facts}
        \`\`\`
        ONTOLOGY CONTEXT:
        \`\`\`prolog
        {ontology_context}
        \`\`\`
        PROLOG QUERY TO EXPLAIN: "{query}"
        DETAILED EXPLANATION:`,

  ZERO_SHOT_QUERY: `You are a helpful AI assistant. Answer the following question based on your general knowledge.
Question: "{question}"
Answer:`,
};

module.exports = PROMPT_TEMPLATES;
