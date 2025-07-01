// new/src/mcpHandler.js
const mcrService = require('./mcrService');
const { ApiError } = require('./errors'); // For consistent error structure if needed
const logger = require('./logger');
const { v4: uuidv4 } = require('uuid'); // For generating invocation IDs

// Define the tools MCR will offer via MCP
const mcrTools = [
  {
    name: 'create_reasoning_session',
    description: 'Creates a new reasoning session for asserting facts and making queries.',
    input_schema: { type: 'object', properties: {} }, // No input needed
    output_schema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'The ID of the created session.' },
        createdAt: { type: 'string', format: 'date-time', description: 'Timestamp of session creation.' },
      },
      required: ['sessionId', 'createdAt'],
    },
  },
  {
    name: 'assert_facts_to_session',
    description: 'Asserts natural language facts into a specified reasoning session.',
    input_schema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'The ID of the session to assert facts into.' },
        naturalLanguageText: { type: 'string', description: 'The natural language text containing facts to assert.' },
      },
      required: ['sessionId', 'naturalLanguageText'],
    },
    output_schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', description: 'Whether the assertion was successful.' },
        message: { type: 'string', description: 'A message indicating the result.' },
        addedFacts: { type: 'array', items: { type: 'string' }, description: 'The Prolog facts that were added.', nullable: true },
      },
      required: ['success', 'message'],
    },
  },
  {
    name: 'query_session',
    description: 'Queries a specified reasoning session using a natural language question.',
    input_schema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'The ID of the session to query.' },
        naturalLanguageQuestion: { type: 'string', description: 'The natural language question to ask.' },
      },
      required: ['sessionId', 'naturalLanguageQuestion'],
    },
    output_schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', description: 'Whether the query processing was successful.' },
        answer: { type: 'string', description: 'The natural language answer from MCR.', nullable: true },
        // debugInfo could be added here if useful for the MCP client
      },
      required: ['success'],
    },
  },
];

function sendSseEvent(res, eventName, data) {
  const eventId = uuidv4();
  res.write(`id: ${eventId}\n`);
  res.write(`event: ${eventName}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
  logger.debug(`[MCP SSE] Sent event: ${eventName}`, { eventId, data });
}

async function handleSse(req, res) {
  const clientId = req.headers['x-mcp-client-id'] || `client-${uuidv4()}`;
  logger.info(`[MCP SSE] Client connected: ${clientId}`);

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    // CORS headers might be needed if client is on a different origin
    'Access-Control-Allow-Origin': '*',
  });

  // Send initial tools_updated event
  sendSseEvent(res, 'tools_updated', { tools: mcrTools });

  req.on('data', async (chunk) => {
    const message = chunk.toString();
    logger.debug(`[MCP SSE] Received raw data from client ${clientId}: ${message}`);
    // MCP messages are expected to be newline-separated JSON strings for invoke_tool
    // A robust parser would handle potential partial messages, but for simplicity:
    try {
      const lines = message.trim().split('\n');
      for (const line of lines) {
        if (line.startsWith('data:')) {
          const jsonData = line.substring('data:'.length).trim();
          const mcpMessage = JSON.parse(jsonData);

          if (mcpMessage.type === 'invoke_tool') {
            logger.info(`[MCP SSE] Received invoke_tool from ${clientId}: ${mcpMessage.tool_name}`, { input: mcpMessage.input });
            await handleToolInvocation(res, mcpMessage, clientId);
          } else {
            logger.warn(`[MCP SSE] Received unknown MCP message type from ${clientId}: ${mcpMessage.type}`);
          }
        }
      }
    } catch (error) {
      logger.error(`[MCP SSE] Error processing message from client ${clientId}: ${error.message}`, { rawMessage: message, error });
      // Optionally send an error back to the client if the protocol supports it for malformed requests
    }
  });

  req.on('close', () => {
    logger.info(`[MCP SSE] Client disconnected: ${clientId}`);
    res.end();
  });
}

async function handleToolInvocation(res, invokeMsg, clientId) {
  const { tool_name, input, invocation_id } = invokeMsg;
  let resultData;

  try {
    switch (tool_name) {
      case 'create_reasoning_session':
        const session = mcrService.createSession();
        // Adapt mcrService output to MCP tool output schema
        resultData = { sessionId: session.id, createdAt: session.createdAt.toISOString() };
        break;

      case 'assert_facts_to_session':
        if (!input || !input.sessionId || !input.naturalLanguageText) {
          throw new ApiError(400, 'Missing sessionId or naturalLanguageText for assert_facts_to_session');
        }
        const assertResult = await mcrService.assertNLToSession(input.sessionId, input.naturalLanguageText);
        resultData = {
            success: assertResult.success,
            message: assertResult.message,
            addedFacts: assertResult.addedFacts // Will be undefined if not successful or no facts
        };
        if (!assertResult.success && resultData.message.includes('Session not found')) {
             throw new ApiError(404, resultData.message, 'SESSION_NOT_FOUND_TOOL');
        } else if (!assertResult.success) {
            throw new ApiError(400, resultData.message, 'ASSERT_TOOL_FAILED');
        }
        break;

      case 'query_session':
        if (!input || !input.sessionId || !input.naturalLanguageQuestion) {
          throw new ApiError(400, 'Missing sessionId or naturalLanguageQuestion for query_session');
        }
        const queryResult = await mcrService.querySessionWithNL(input.sessionId, input.naturalLanguageQuestion);
        resultData = {
            success: queryResult.success,
            answer: queryResult.answer // Will be undefined if not successful
        };
         if (!queryResult.success && queryResult.message.includes('Session not found')) {
             throw new ApiError(404, queryResult.message, 'SESSION_NOT_FOUND_TOOL');
        } else if (!queryResult.success) {
            throw new ApiError(500, queryResult.message || 'Query tool failed internally', 'QUERY_TOOL_FAILED');
        }
        break;

      default:
        logger.warn(`[MCP Tool] Unknown tool invoked by ${clientId}: ${tool_name}`);
        throw new ApiError(404, `Tool not found: ${tool_name}`, 'TOOL_NOT_FOUND');
    }

    logger.info(`[MCP Tool] Successfully invoked ${tool_name} for ${clientId}. Output:`, resultData);
    sendSseEvent(res, 'tool_result', { invocation_id, tool_name, output: resultData });

  } catch (error) {
    logger.error(`[MCP Tool] Error invoking tool ${tool_name} for ${clientId}: ${error.message}`, { error });
    const isApiError = error instanceof ApiError;
    sendSseEvent(res, 'tool_error', {
      invocation_id,
      tool_name,
      error: {
        message: error.message,
        code: isApiError ? error.errorCode : 'TOOL_EXECUTION_ERROR',
        details: isApiError ? error.details : undefined,
      },
    });
  }
}

module.exports = {
  handleSse,
  // mcrTools // if needed externally, e.g. for documentation
};
