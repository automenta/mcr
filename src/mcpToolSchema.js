// src/mcpToolSchema.js
const toolSchema = {
  tools: [
    {
      name: "create_reasoning_session",
      description: "Creates a new reasoning session to store facts and make queries. Returns the session details including its ID.",
      parameters: [],
      output: {
        type: "object",
        properties: {
          sessionId: { type: "string", description: "The unique identifier for the created session." },
          facts: { type: "array", items: { type: "string" }, description: "List of initial facts (usually empty)." },
          factCount: { type: "number", description: "Count of initial facts (usually 0)." },
          createdAt: { type: "string", format: "date-time", description: "Timestamp of when the session was created." }
        }
      }
    },
    {
      name: "assert_facts",
      description: "Asserts (adds) natural language facts to a specific reasoning session. The facts will be translated into logical rules.",
      parameters: [
        {
          name: "sessionId",
          type: "string",
          description: "The ID of the session to add facts to.",
          required: true
        },
        {
          name: "text",
          type: "string",
          description: "The natural language text representing the facts to be asserted.",
          required: true
        }
      ],
      output: {
        type: "object",
        properties: {
          addedFacts: { type: "array", items: { type: "string" }, description: "The list of logical rules derived from the input text and added to the session." },
          totalFactsInSession: { type: "number", description: "The total number of facts/rules now in the session." },
          metadata: { type: "object", properties: { success: { type: "boolean" } } }
        }
      }
    },
    {
      name: "query_reasoning_session",
      description: "Queries a reasoning session with a natural language question. The question is translated to a logical query, executed against the session's facts, and the result is returned in natural language.",
      parameters: [
        {
          name: "sessionId",
          type: "string",
          description: "The ID of the session to query.",
          required: true
        },
        {
          name: "query",
          type: "string",
          description: "The natural language query.",
          required: true
        },
        {
          name: "options",
          type: "object",
          description: "Optional settings for the query.",
          required: false,
          properties: {
            style: {
              name: "style",
              type: "string",
              description: "Style for the natural language answer (e.g., 'conversational', 'formal', 'bullet').",
              required: false
            },
            debug: {
              name: "debug",
              type: "boolean",
              description: "Whether to include detailed debug information in the response.",
              required: false
            }
          }
        },
        {
          name: "ontology",
          type: "string",
          description: "Optional. Name of a specific ontology to use for this query, overriding session or default ontologies.",
          required: false
        }
      ],
      output: {
        type: "object",
        properties: {
          queryProlog: { type: "string", description: "The translated Prolog query that was executed." },
          result: { type: "any", description: "The simplified result from the Prolog reasoner (can be string, boolean, object, or array)." },
          answer: { type: "string", description: "The final natural language answer generated from the reasoner's result." },
          zeroShotLmAnswer: { type: "string", description: "A comparative answer from the LLM queried directly with the original question (zero-shot)." },
          metadata: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              steps: { type: "number", description: "Number of steps or solutions found by the reasoner." }
            }
          },
          debug: { type: "object", description: "Optional. Detailed debug information if requested via options.", required: false }
        }
      }
    },
    {
      name: "translate_nl_to_rules",
      description: "Translates a piece of natural language text into logical rules, optionally considering existing facts and ontology context.",
      parameters: [
        {
          name: "text",
          type: "string",
          description: "The natural language text to translate into logical rules.",
          required: true
        },
        {
          name: "existing_facts",
          type: "string",
          description: "Optional. A string containing existing facts (as rules) to provide context for the translation.",
          required: false
        },
        {
          name: "ontology_context",
          type: "string",
          description: "Optional. A string containing ontology rules/context for the translation.",
          required: false
        }
      ],
      output: {
        type: "object",
        properties: {
          rules: { type: "array", items: { type: "string" }, description: "An array of logical rules (as strings) translated from the input text." }
        }
      }
    },
    {
      name: "translate_rules_to_nl",
      description: "Translates a list of logical rules into a natural language sentence or paragraph.",
      parameters: [
        {
          name: "rules",
          type: "array",
          items: { type: "string" },
          description: "An array of logical rules (as strings) to be translated into natural language.",
          required: true
        },
        {
          name: "style",
          type: "string",
          description: "Optional. Style for the natural language output (e.g., 'conversational', 'formal').",
          required: false
        }
      ],
      output: {
        type: "object",
        properties: {
          text: { type: "string", description: "The natural language representation of the input rules." }
        }
      }
    }
  ]
};

module.exports = toolSchema;
