// src/mcpHandler.js
const { logger } = require('./logger');

// Actual tool schema based on explored API endpoints
const toolSchema = {
  tools: [
    {
      name: "create_reasoning_session",
      description: "Creates a new reasoning session to store facts and make queries. Returns the session details including its ID.",
      parameters: [], // No parameters needed for creation
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

const mcpHandler = {
  handleSse: (req, res) => {
    logger.info(`MCP SSE connection established from ${req.ip}`, { correlationId: req.correlationId });

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders(); // Flush the headers to establish the connection

    // Send the initial tool schema
    const toolSchemaEvent = `data: ${JSON.stringify({ type: 'tools', data: toolSchema })}\n\n`;
    res.write(toolSchemaEvent);
    logger.debug('Sent tool schema to MCP client', { correlationId: req.correlationId, event: toolSchemaEvent });

    // Keep the connection alive with periodic pings
    const pingInterval = setInterval(() => {
      const pingEvent = `data: ${JSON.stringify({ type: 'ping' })}\n\n`;
      if (!res.writableEnded) {
        res.write(pingEvent);
        logger.silly('Sent MCP ping', { correlationId: req.correlationId });
      } else {
        // Connection closed by client, clear interval
        clearInterval(pingInterval);
      }
    }, 10000); // Every 10 seconds

    // Handle client disconnect
    req.on('close', () => {
      clearInterval(pingInterval);
      logger.info(`MCP SSE connection closed by client ${req.ip}`, { correlationId: req.correlationId });
      res.end();
    });

// src/mcpHandler.js
const { logger } = require('./logger');
const axios = require('axios'); // For making internal HTTP requests
const ConfigManager = require('../config'); // To get server port/host

// Actual tool schema (defined in previous step)
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
        { name: "sessionId", type: "string", description: "The ID of the session to add facts to.", required: true },
        { name: "text", type: "string", description: "The natural language text representing the facts to be asserted.", required: true }
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
        { name: "sessionId", type: "string", description: "The ID of the session to query.", required: true },
        { name: "query", type: "string", description: "The natural language query.", required: true },
        {
          name: "options", type: "object", description: "Optional settings for the query.", required: false,
          properties: {
            style: { name: "style", type: "string", description: "Style for the natural language answer (e.g., 'conversational', 'formal', 'bullet').", required: false },
            debug: { name: "debug", type: "boolean", description: "Whether to include detailed debug information in the response.", required: false }
          }
        },
        { name: "ontology", type: "string", description: "Optional. Name of a specific ontology to use for this query, overriding session or default ontologies.", required: false }
      ],
      output: {
        type: "object",
        properties: {
          queryProlog: { type: "string", description: "The translated Prolog query that was executed." },
          result: { type: "any", description: "The simplified result from the Prolog reasoner (can be string, boolean, object, or array)." },
          answer: { type: "string", description: "The final natural language answer generated from the reasoner's result." },
          zeroShotLmAnswer: { type: "string", description: "A comparative answer from the LLM queried directly with the original question (zero-shot)." },
          metadata: { type: "object", properties: { success: { type: "boolean" }, steps: { type: "number", description: "Number of steps or solutions found by the reasoner." } } },
          debug: { type: "object", description: "Optional. Detailed debug information if requested via options.", required: false }
        }
      }
    },
    {
      name: "translate_nl_to_rules",
      description: "Translates a piece of natural language text into logical rules, optionally considering existing facts and ontology context.",
      parameters: [
        { name: "text", type: "string", description: "The natural language text to translate into logical rules.", required: true },
        { name: "existing_facts", type: "string", description: "Optional. A string containing existing facts (as rules) to provide context for the translation.", required: false },
        { name: "ontology_context", type: "string", description: "Optional. A string containing ontology rules/context for the translation.", required: false }
      ],
      output: { type: "object", properties: { rules: { type: "array", items: { type: "string" }, description: "An array of logical rules (as strings) translated from the input text." } } }
    },
    {
      name: "translate_rules_to_nl",
      description: "Translates a list of logical rules into a natural language sentence or paragraph.",
      parameters: [
        { name: "rules", type: "array", items: { type: "string" }, description: "An array of logical rules (as strings) to be translated into natural language.", required: true },
        { name: "style", type: "string", description: "Optional. Style for the natural language output (e.g., 'conversational', 'formal').", required: false }
      ],
      output: { type: "object", properties: { text: { type: "string", description: "The natural language representation of the input rules." } } }
    }
  ]
};

const config = ConfigManager.get();
const API_BASE_URL = `http://${config.server.host === '0.0.0.0' ? '127.0.0.1' : config.server.host}:${config.server.port}`;


async function invokeTool(toolName, parameters, correlationId) {
  logger.info(`Attempting to invoke tool: ${toolName}`, { correlationId, toolName, parameters });
  let response;
  let url;
  let requestBody;

  try {
    switch (toolName) {
      case "create_reasoning_session":
        url = `${API_BASE_URL}/sessions`;
        response = await axios.post(url, {}, { headers: { 'X-Correlation-ID': correlationId } });
        return response.data;

      case "assert_facts":
        if (!parameters.sessionId || !parameters.text) {
          throw new Error("Missing required parameters for assert_facts: sessionId and text");
        }
        url = `${API_BASE_URL}/sessions/${parameters.sessionId}/assert`;
        requestBody = { text: parameters.text };
        response = await axios.post(url, requestBody, { headers: { 'X-Correlation-ID': correlationId } });
        return response.data;

      case "query_reasoning_session":
        if (!parameters.sessionId || !parameters.query) {
          throw new Error("Missing required parameters for query_reasoning_session: sessionId and query");
        }
        url = `${API_BASE_URL}/sessions/${parameters.sessionId}/query`;
        requestBody = {
          query: parameters.query,
          options: parameters.options || {}, // Ensure options is an object
          ontology: parameters.ontology
        };
        response = await axios.post(url, requestBody, { headers: { 'X-Correlation-ID': correlationId } });
        return response.data;

      case "translate_nl_to_rules":
        if (!parameters.text) {
          throw new Error("Missing required parameter for translate_nl_to_rules: text");
        }
        url = `${API_BASE_URL}/translate/nl-to-rules`;
        requestBody = {
          text: parameters.text,
          existing_facts: parameters.existing_facts,
          ontology_context: parameters.ontology_context
        };
        response = await axios.post(url, requestBody, { headers: { 'X-Correlation-ID': correlationId } });
        return response.data;

      case "translate_rules_to_nl":
        if (!parameters.rules || !Array.isArray(parameters.rules)) {
          throw new Error("Missing or invalid required parameter for translate_rules_to_nl: rules (must be an array)");
        }
        url = `${API_BASE_URL}/translate/rules-to-nl`;
        requestBody = {
          rules: parameters.rules,
          style: parameters.style
        };
        response = await axios.post(url, requestBody, { headers: { 'X-Correlation-ID': correlationId } });
        return response.data;

      default:
        logger.warn(`Unknown tool requested: ${toolName}`, { correlationId });
        throw new Error(`Unknown tool: ${toolName}`);
    }
  } catch (error) {
    logger.error(`Error invoking tool ${toolName}: ${error.message}`, {
      correlationId,
      toolName,
      error: error.response ? error.response.data : error.message,
      stack: error.stack,
      url,
      requestBodySent: requestBody, // Be careful logging sensitive data in requestBody
    });
    // Re-throw a structured error or the original error to be caught by the caller
    throw error; // Or craft a more specific error object
  }
}

const mcpHandler = {
  handleSse: (req, res) => {
    const { correlationId } = req; // Get correlationId from request (added by middleware)
    logger.info(`MCP SSE connection established from ${req.ip}`, { correlationId });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const toolSchemaEvent = `data: ${JSON.stringify({ type: 'tools', data: toolSchema })}\n\n`;
    res.write(toolSchemaEvent);
    logger.debug('Sent tool schema to MCP client', { correlationId, eventLength: toolSchemaEvent.length });

    const pingInterval = setInterval(() => {
      const pingEvent = `data: ${JSON.stringify({ type: 'ping' })}\n\n`;
      if (!res.writableEnded) {
        res.write(pingEvent);
        logger.silly('Sent MCP ping', { correlationId });
      } else {
        clearInterval(pingInterval);
      }
    }, 10000);

    let messageBuffer = '';
    req.on('data', async (chunk) => {
      messageBuffer += chunk.toString();
      // Assuming messages are newline-separated JSON strings from Claude Desktop.
      // This is a simple way to buffer; a more robust solution might handle partial JSON.
      // For MCP, it's more likely one complete JSON message per "data event" from client.
      // Let's assume each 'data' event is a complete JSON payload for now.
      // The prompt gives no specific format for how client sends data on SSE.

      // A more robust way would be to delimit messages, e.g. by newlines if client sends line-by-line JSON
      // For now, let's assume a full JSON object per 'data' event from the client.
      // This part is speculative based on how MCP might send data back on an SSE connection.
      try {
        const message = JSON.parse(messageBuffer.trim()); // Trim whitespace
        messageBuffer = ''; // Clear buffer after successful parse

        logger.debug('Received message from MCP client via SSE data channel', { correlationId, message });

        if (message.type === 'invoke_tool' && message.toolName && message.parameters && message.requestId) {
          try {
            const result = await invokeTool(message.toolName, message.parameters, correlationId);
            const toolResultEvent = `data: ${JSON.stringify({ type: 'tool_result', requestId: message.requestId, data: result })}\n\n`;
            if (!res.writableEnded) {
              res.write(toolResultEvent);
              logger.info(`Sent tool_result for ${message.toolName} (requestId: ${message.requestId})`, { correlationId });
            }
          } catch (error) {
            const toolErrorEvent = `data: ${JSON.stringify({ type: 'tool_error', requestId: message.requestId, error: { message: error.message, name: error.name, details: error.response?.data } })}\n\n`;
            if (!res.writableEnded) {
              res.write(toolErrorEvent);
              logger.error(`Sent tool_error for ${message.toolName} (requestId: ${message.requestId}): ${error.message}`, { correlationId });
            }
          }
        } else {
          logger.warn('Received unknown message type or malformed invoke_tool request from MCP client', { correlationId, receivedMessage: message });
        }
      } catch (parseError) {
        // If JSON.parse fails, it means the chunk was not a complete JSON object.
        // Or, the messageBuffer contains incomplete data.
        // This simple buffering strategy might need improvement for fragmented client messages.
        logger.warn('Failed to parse incoming message from MCP client or buffer incomplete', { correlationId, buffer: messageBuffer, error: parseError.message });
        // If messageBuffer becomes too large without parsing, clear it to prevent memory issues.
        if (messageBuffer.length > 1024 * 1024) { // 1MB limit for buffer
            logger.error("MCP message buffer exceeded 1MB, clearing.", { correlationId });
            messageBuffer = '';
        }
      }
    });

    req.on('close', () => {
      clearInterval(pingInterval);
      logger.info(`MCP SSE connection closed by client ${req.ip}`, { correlationId });
      res.end();
    });
  }
};

module.exports = mcpHandler;
