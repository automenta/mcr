// new/src/mcpHandler.js
const mcrService = require('./mcrService');
const { ApiError } = require('./errors'); // For consistent error structure if needed
const logger = require('./logger');
const { v4: uuidv4 } = require('uuid'); // For generating invocation IDs

// Define the tools MCR will offer via MCP
const mcrTools = [
  {
    name: 'create_reasoning_session',
    description:
      'Creates a new reasoning session for asserting facts and making queries.',
    input_schema: { type: 'object', properties: {} }, // No input needed
    output_schema: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'The ID of the created session.',
        },
        createdAt: {
          type: 'string',
          format: 'date-time',
          description: 'Timestamp of session creation.',
        },
        // Added from mcrService.createSession output
        facts: {
          type: 'array',
          items: { type: 'string' },
          description: 'Initial facts in the session (usually empty).',
        },
        factCount: {
          type: 'integer',
          description: 'Initial number of facts in the session (usually 0).',
        },
      },
      required: ['sessionId', 'createdAt', 'facts', 'factCount'],
    },
  },
  {
    name: 'assert_facts_to_session',
    description:
      'Asserts natural language facts into a specified reasoning session.',
    input_schema: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'The ID of the session to assert facts into.',
        },
        naturalLanguageText: {
          type: 'string',
          description: 'The natural language text containing facts to assert.',
        },
      },
      required: ['sessionId', 'naturalLanguageText'],
    },
    output_schema: {
      type: 'object',
      properties: {
        success: {
          type: 'boolean',
          description: 'Whether the assertion was successful.',
        },
        message: {
          type: 'string',
          description: 'A message indicating the result.',
        },
        addedFacts: {
          type: 'array',
          items: { type: 'string' },
          description: 'The Prolog facts that were added.',
          nullable: true,
        },
      },
      required: ['success', 'message'],
    },
  },
  {
    name: 'query_session',
    description:
      'Queries a specified reasoning session using a natural language question.',
    input_schema: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'The ID of the session to query.',
        },
        naturalLanguageQuestion: {
          type: 'string',
          description: 'The natural language question to ask.',
        },
      },
      required: ['sessionId', 'naturalLanguageQuestion'],
    },
    output_schema: {
      type: 'object',
      properties: {
        success: {
          type: 'boolean',
          description: 'Whether the query processing was successful.',
        },
        answer: {
          type: 'string',
          description: 'The natural language answer from MCR.',
          nullable: true,
        },
        // debugInfo could be added here if useful for the MCP client
      },
      required: ['success'],
    },
  },
  {
    name: 'translate_nl_to_rules',
    description:
      'Translates a piece of natural language text into logical rules.',
    input_schema: {
      type: 'object',
      properties: {
        naturalLanguageText: {
          type: 'string',
          description: 'The natural language text to translate.',
        },
      },
      required: ['naturalLanguageText'],
    },
    output_schema: {
      type: 'object',
      properties: {
        success: {
          type: 'boolean',
          description: 'Whether the translation was successful.',
        },
        rules: {
          type: 'array',
          items: { type: 'string' },
          description:
            'An array of logical rules translated from the input text.',
          nullable: true,
        },
        rawOutput: {
          type: 'string',
          description:
            'The raw output string from the LLM, which might contain partially formed rules or comments.',
          nullable: true,
        },
        message: {
          type: 'string',
          description: 'A message indicating the result if not successful.',
          nullable: true,
        },
      },
      required: ['success'],
    },
  },
  {
    name: 'translate_rules_to_nl',
    description:
      'Translates a string of Prolog rules/facts into a natural language explanation.',
    input_schema: {
      type: 'object',
      properties: {
        prologRules: {
          type: 'string',
          description:
            'The Prolog rules/facts as a string (newline-separated).',
        },
        style: {
          type: 'string',
          enum: ['formal', 'conversational'],
          description:
            'The desired style of the explanation (defaults to conversational).',
          nullable: true,
        },
      },
      required: ['prologRules'],
    },
    output_schema: {
      type: 'object',
      properties: {
        success: {
          type: 'boolean',
          description: 'Whether the translation was successful.',
        },
        explanation: {
          type: 'string',
          description: 'The natural language explanation of the rules.',
          nullable: true,
        },
        message: {
          type: 'string',
          description: 'A message indicating the result if not successful.',
          nullable: true,
        },
      },
      required: ['success'],
    },
  },
];

function sendSseEvent(
  res,
  eventName,
  data,
  clientId = 'unknown',
  invocation_id = 'N/A'
) {
  const eventId = uuidv4();
  const loggedData = { ...data };
  // Avoid logging potentially very large tool outputs by default in the main log, log them separately if needed.
  if (eventName === 'tool_result' && loggedData.output) {
    loggedData.output =
      typeof loggedData.output === 'string'
        ? `String(length:${loggedData.output.length})`
        : `Object(keys:${Object.keys(loggedData.output)})`;
  }

  res.write(`id: ${eventId}\n`);
  res.write(`event: ${eventName}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
  logger.http(
    `[MCP SSE][${clientId}] Sent SSE event. Name: ${eventName}, EventID: ${eventId}, InvocationID: ${invocation_id}`,
    { eventName, eventId, invocation_id, data: loggedData }
  );
}

async function handleSse(req, res) {
  const correlationId = req.correlationId || `sse-conn-${uuidv4()}`; // Use existing or generate one for the connection
  const clientId =
    req.headers['x-mcp-client-id'] || `client-${uuidv4().substring(0, 8)}`;
  logger.info(
    `[MCP SSE][${clientId}][${correlationId}] Client connected. IP: ${req.ip}`
  );

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    // CORS headers might be needed if client is on a different origin
    'Access-Control-Allow-Origin': '*',
  });

  // Send initial tools_updated event
  logger.info(
    `[MCP SSE][${clientId}][${correlationId}] Sending initial 'tools_updated' event.`
  );
  sendSseEvent(
    res,
    'tools_updated',
    { tools: mcrTools },
    clientId,
    'initial_setup'
  );

  req.on('data', async (chunk) => {
    const message = chunk.toString();
    logger.http(
      `[MCP SSE][${clientId}][${correlationId}] Received raw data chunk. Length: ${message.length}. Data: ${message.substring(0, 200)}${message.length > 200 ? '...' : ''}`
    );
    // MCP messages are expected to be newline-separated JSON strings for invoke_tool
    try {
      const lines = message.trim().split('\n');
      for (const line of lines) {
        if (line.startsWith('data:')) {
          // Assuming messages are always prefixed with 'data:' as per SSE
          const jsonData = line.substring('data:'.length).trim();
          if (!jsonData) {
            logger.debug(
              `[MCP SSE][${clientId}][${correlationId}] Received empty data line, skipping.`
            );
            continue;
          }
          const mcpMessage = JSON.parse(jsonData);
          logger.debug(
            `[MCP SSE][${clientId}][${correlationId}] Parsed MCP message:`,
            {
              type: mcpMessage.type,
              tool_name: mcpMessage.tool_name,
              invocation_id: mcpMessage.invocation_id,
            }
          );

          if (mcpMessage.type === 'invoke_tool') {
            // Input logging is deferred to handleToolInvocation for more context
            await handleToolInvocation(
              res,
              mcpMessage,
              clientId,
              correlationId
            );
          } else {
            logger.warn(
              `[MCP SSE][${clientId}][${correlationId}] Received unknown MCP message type: ${mcpMessage.type}`,
              { mcpMessage }
            );
          }
        } else if (line.trim()) {
          // Non-empty line that doesn't start with 'data:'
          logger.warn(
            `[MCP SSE][${clientId}][${correlationId}] Received non-data SSE line, ignoring: "${line}"`
          );
        }
      }
    } catch (error) {
      logger.error(
        `[MCP SSE][${clientId}][${correlationId}] Error processing message: ${error.message}`,
        { rawMessage: message, error: error.stack }
      );
      // Optionally send an error back to the client if the protocol supports it for malformed requests
      // For example: sendSseEvent(res, 'protocol_error', { message: 'Failed to parse incoming message' }, clientId);
    }
  });

  req.on('close', () => {
    logger.info(
      `[MCP SSE][${clientId}][${correlationId}] Client disconnected.`
    );
    res.end();
  });
}

async function handleToolInvocation(
  res,
  invokeMsg,
  clientId,
  parentCorrelationId
) {
  const { tool_name, input, invocation_id } = invokeMsg;
  const toolCorrelationId = `${parentCorrelationId}-tool-${invocation_id.substring(0, 8)}`;
  logger.info(
    `[MCP Tool][${clientId}][${toolCorrelationId}] Enter handleToolInvocation. Tool: ${tool_name}, InvocationID: ${invocation_id}`,
    { tool_name, input, invocation_id } // Log full input here as it's specific to this invocation
  );
  let resultData;

  try {
    switch (tool_name) {
      case 'create_reasoning_session':
        logger.debug(
          `[MCP Tool][${clientId}][${toolCorrelationId}] Calling mcrService.createSession for ${tool_name}`
        );
        const session = mcrService.createSession();
        resultData = {
          sessionId: session.id,
          createdAt: session.createdAt.toISOString(),
          facts: session.facts,
          factCount: session.factCount,
        };
        break;

      case 'assert_facts_to_session':
        if (!input || !input.sessionId || !input.naturalLanguageText) {
          logger.warn(
            `[MCP Tool][${clientId}][${toolCorrelationId}] Invalid input for ${tool_name}: sessionId or naturalLanguageText missing.`
          );
          throw new ApiError(
            400,
            'Missing sessionId or naturalLanguageText for assert_facts_to_session'
          );
        }
        logger.debug(
          `[MCP Tool][${clientId}][${toolCorrelationId}] Calling mcrService.assertNLToSession for ${tool_name}. Session: ${input.sessionId}, Text: "${input.naturalLanguageText.substring(0, 50)}..."`
        );
        const assertResult = await mcrService.assertNLToSession(
          input.sessionId,
          input.naturalLanguageText
        );
        resultData = {
          success: assertResult.success,
          message: assertResult.message,
          addedFacts: assertResult.addedFacts,
        };
        if (!assertResult.success) {
          const errorType =
            resultData.message &&
            resultData.message.includes('Session not found')
              ? 'SESSION_NOT_FOUND_TOOL'
              : 'ASSERT_TOOL_FAILED';
          const statusCode = errorType === 'SESSION_NOT_FOUND_TOOL' ? 404 : 400;
          logger.warn(
            `[MCP Tool][${clientId}][${toolCorrelationId}] ${tool_name} failed. Message: ${resultData.message}, Error type: ${errorType}`
          );
          throw new ApiError(statusCode, resultData.message, errorType);
        }
        break;

      case 'translate_nl_to_rules':
        if (!input || !input.naturalLanguageText) {
          logger.warn(
            `[MCP Tool][${clientId}][${toolCorrelationId}] Invalid input for ${tool_name}: naturalLanguageText missing.`
          );
          throw new ApiError(
            400,
            'Missing naturalLanguageText for translate_nl_to_rules'
          );
        }
        logger.debug(
          `[MCP Tool][${clientId}][${toolCorrelationId}] Calling mcrService.translateNLToRulesDirect for ${tool_name}. Text: "${input.naturalLanguageText.substring(0, 50)}..."`
        );
        const nlToRulesResult = await mcrService.translateNLToRulesDirect(
          input.naturalLanguageText
        );
        resultData = {
          success: nlToRulesResult.success,
          rules: nlToRulesResult.rules,
          rawOutput: nlToRulesResult.rawOutput,
          message: nlToRulesResult.message,
        };
        if (!nlToRulesResult.success) {
          logger.warn(
            `[MCP Tool][${clientId}][${toolCorrelationId}] ${tool_name} failed. Message: ${resultData.message}`
          );
          throw new ApiError(
            400,
            resultData.message || 'NL to Rules translation failed',
            'NL_TO_RULES_TOOL_FAILED'
          );
        }
        break;

      case 'translate_rules_to_nl':
        if (!input || !input.prologRules) {
          logger.warn(
            `[MCP Tool][${clientId}][${toolCorrelationId}] Invalid input for ${tool_name}: prologRules missing.`
          );
          throw new ApiError(
            400,
            'Missing prologRules for translate_rules_to_nl'
          );
        }
        logger.debug(
          `[MCP Tool][${clientId}][${toolCorrelationId}] Calling mcrService.translateRulesToNLDirect for ${tool_name}. Style: ${input.style || 'conversational'}, Rules: "${input.prologRules.substring(0, 50)}..."`
        );
        const rulesToNlResult = await mcrService.translateRulesToNLDirect(
          input.prologRules,
          input.style || 'conversational'
        );
        resultData = {
          success: rulesToNlResult.success,
          explanation: rulesToNlResult.explanation,
          message: rulesToNlResult.message,
        };
        if (!rulesToNlResult.success) {
          logger.warn(
            `[MCP Tool][${clientId}][${toolCorrelationId}] ${tool_name} failed. Message: ${resultData.message}`
          );
          throw new ApiError(
            400,
            resultData.message || 'Rules to NL translation failed',
            'RULES_TO_NL_TOOL_FAILED'
          );
        }
        break;

      case 'query_session':
        if (!input || !input.sessionId || !input.naturalLanguageQuestion) {
          logger.warn(
            `[MCP Tool][${clientId}][${toolCorrelationId}] Invalid input for ${tool_name}: sessionId or naturalLanguageQuestion missing.`
          );
          throw new ApiError(
            400,
            'Missing sessionId or naturalLanguageQuestion for query_session'
          );
        }
        logger.debug(
          `[MCP Tool][${clientId}][${toolCorrelationId}] Calling mcrService.querySessionWithNL for ${tool_name}. Session: ${input.sessionId}, Question: "${input.naturalLanguageQuestion.substring(0, 50)}..."`
        );
        const queryResult = await mcrService.querySessionWithNL(
          input.sessionId,
          input.naturalLanguageQuestion
          // Note: MCP query_session tool doesn't currently expose queryOptions like dynamicOntology or style.
          // If needed, the MCP tool schema and this call would need to be updated.
        );
        resultData = {
          success: queryResult.success,
          answer: queryResult.answer,
        };
        if (!queryResult.success) {
          const errorType =
            queryResult.message &&
            queryResult.message.includes('Session not found')
              ? 'SESSION_NOT_FOUND_TOOL'
              : 'QUERY_TOOL_FAILED';
          const statusCode = errorType === 'SESSION_NOT_FOUND_TOOL' ? 404 : 500; // Default to 500 for other query failures
          logger.warn(
            `[MCP Tool][${clientId}][${toolCorrelationId}] ${tool_name} failed. Message: ${queryResult.message}, Error type: ${errorType}`
          );
          throw new ApiError(
            statusCode,
            queryResult.message || 'Query tool failed',
            errorType
          );
        }
        break;

      default:
        logger.warn(
          `[MCP Tool][${clientId}][${toolCorrelationId}] Unknown tool invoked: ${tool_name}`
        );
        throw new ApiError(
          404,
          `Tool not found: ${tool_name}`,
          'TOOL_NOT_FOUND'
        );
    }

    // Sensitive data (like full rule sets or long NL answers) is in resultData.
    // The sendSseEvent function already has logic to summarize 'output' for general logging.
    // For more detailed logging of specific tool outputs, one could add it here conditionally.
    logger.info(
      `[MCP Tool][${clientId}][${toolCorrelationId}] Successfully invoked ${tool_name}.`
      // Specific output details logged by sendSseEvent to avoid duplication and manage verbosity.
    );
    sendSseEvent(
      res,
      'tool_result',
      {
        invocation_id,
        tool_name,
        output: resultData,
      },
      clientId,
      invocation_id
    );
  } catch (error) {
    logger.error(
      `[MCP Tool][${clientId}][${toolCorrelationId}] Error invoking tool ${tool_name}: ${error.message}`,
      { error: error.stack } // Log stack for all errors from tools
    );
    const isApiError = error instanceof ApiError;
    sendSseEvent(
      res,
      'tool_error',
      {
        invocation_id,
        tool_name,
        error: {
          message: error.message,
          code: isApiError ? error.errorCode : 'TOOL_EXECUTION_ERROR',
          details: isApiError ? error.details : undefined, // Only include details if it's a structured ApiError
        },
      },
      clientId,
      invocation_id
    );
  }
}

module.exports = {
  handleSse,
  // mcrTools // if needed externally, e.g. for documentation
};
