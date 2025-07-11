// src/websocketHandlers.js
const logger = require('./util/logger');
const mcrToolDefinitions = require('./tools'); // Import the new tool definitions
const { handleMcpSocketMessage } = require('./mcpHandler'); // For MCP messages
const { ErrorCodes } = require('./errors'); // For standard error codes

// No longer needed:
// const sessionHandlers = require('./api/sessionHandlers');
// const strategyHandlers = require('./api/strategyHandlers');
// const ontologyHandlers = require('./api/ontologyHandlers');
// const translationHandlers = require('./api/translationHandlers');
// const utilityHandlers = require('./api/utilityHandlers');
// const { mockRequest, mockResponse } = require('./mockUtils'); // Assuming these would be moved/removed

async function routeMessage(ws, parsedMessage) {
  // parsedMessage structure is expected to be:
  // { type: "tool_invoke", action: "tool_name", payload: { tool_name: "...", input: {...} }, messageId: "...", headers: {...} }
  // or for MCP:
  // { action: "mcp.request_tools" or "mcp.invoke_tool", payload: {...}, messageId: "...", headers: {...} }

  const messageType = parsedMessage.type; // "tool_invoke" for MCR tools
  const toolName = parsedMessage.action || parsedMessage.payload?.tool_name; // `action` for general, `payload.tool_name` for specific tool_invoke
  const inputPayload = parsedMessage.payload?.input; // For MCR tools
  const fullPayload = parsedMessage.payload; // For MCP tools or if input isn't nested
  const messageId = parsedMessage.messageId;

  // Ensure correlationId is set up for the WebSocket connection for logging
  if (!ws.correlationId) {
    // This should ideally be set on connection, but as a fallback:
    ws.correlationId = (parsedMessage.headers && parsedMessage.headers['x-correlation-id']) || `ws-fallback-corr-${Date.now()}`;
    logger.info(`[WS-Handler] Fallback: Assigned correlation ID for WebSocket: ${ws.correlationId}`);
  }
  const correlationId = ws.correlationId;

  logger.info(`[WS-Handler][${correlationId}] Routing message. Type: '${messageType}', Tool/Action: '${toolName}', MsgID: ${messageId}`);

  try {
    if (messageType === 'tool_invoke' && toolName) {
      const tool = mcrToolDefinitions[toolName];
      if (tool && typeof tool.handler === 'function') {
        logger.debug(`[WS-Handler][${correlationId}] Invoking MCR tool: ${toolName}`, { input: inputPayload });
        const result = await tool.handler(inputPayload || {}); // Pass input part of payload, or empty object if none

        logger.info(`[WS-Handler][${correlationId}] MCR tool '${toolName}' executed. Success: ${result.success}`, { messageId });
        logger.debug(`[WS-Handler][${correlationId}] Result for '${toolName}':`, result);

        // Associate ws with sessionId if the tool implies a session context
        if (result.success) {
          if ((toolName === 'session.create' || toolName === 'session.get') && result.data?.id) {
            if (ws.sessionId !== result.data.id) {
              ws.sessionId = result.data.id;
              logger.info(`[WS-Handler][${correlationId}] WebSocket connection now associated with session: ${ws.sessionId}`);
            }
          }
          // If client explicitly sets session via a dedicated tool (not implemented yet, but for future)
          // else if (toolName === 'session.setActiveContext' && result.sessionId) {
          //   ws.sessionId = result.sessionId;
          // }
        }

        ws.send(JSON.stringify({
          type: 'tool_result',
          correlationId: correlationId,
          messageId: messageId,
          payload: result, // The result from the tool handler is the payload
        }));

        // Send kb_updated message if an assertion tool was successful and modified the KB
        if (result.success && ws.sessionId &&
            (toolName === 'session.assert' || toolName === 'session.assert_rules') &&
            result.addedFacts && result.fullKnowledgeBase) {

          const kbUpdateMessage = {
            type: 'kb_updated',
            // correlationId: correlationId, // Or a new one for server-initiated messages
            payload: {
              sessionId: ws.sessionId,
              newFacts: result.addedFacts,
              fullKnowledgeBase: result.fullKnowledgeBase,
            }
          };
          // Add a messageId to kb_updated if clients need to track/ack it, though typically not for push updates.
          // kbUpdateMessage.messageId = `server-push-${Date.now()}`;

          logger.info(`[WS-Handler][${correlationId}] Sending kb_updated for session ${ws.sessionId}. Facts added: ${result.addedFacts.length}`);
          ws.send(JSON.stringify(kbUpdateMessage));
        }

      } else {
        logger.warn(`[WS-Handler][${correlationId}] Unknown MCR tool: ${toolName}`, { messageId });
        ws.send(JSON.stringify({
          type: 'tool_result',
          correlationId: correlationId,
          messageId: messageId,
          payload: {
            success: false,
            error: ErrorCodes.UNKNOWN_TOOL,
            message: `Unknown tool: ${toolName}`,
          },
        }));
      }
    } else if (toolName && (toolName.startsWith('mcp.') || parsedMessage.action?.startsWith('mcp.'))) {
      // Handle MCP messages separately using the existing mcpHandler
      logger.info(`[WS-Handler][${correlationId}] Forwarding to MCP handler. Action: ${toolName}`, { messageId });
      // handleMcpSocketMessage expects the full parsedMessage
      await handleMcpSocketMessage(ws, parsedMessage);
    } else {
      logger.warn(`[WS-Handler][${correlationId}] Unrecognized message structure or missing tool/action. Type: '${messageType}', Tool/Action: '${toolName}'`, { parsedMessage });
      ws.send(JSON.stringify({
        type: 'error', // General error type
        correlationId: correlationId,
        messageId: messageId,
        payload: {
          success: false,
          error: ErrorCodes.INVALID_MESSAGE_STRUCTURE,
          message: 'Unrecognized message structure, type, or missing tool/action.',
        },
      }));
    }
  } catch (error) {
    logger.error(`[WS-Handler][${correlationId}] Error processing message for tool ${toolName}: ${error.message}`, {
      stack: error.stack,
      messageId: messageId,
      toolName: toolName,
    });
    // Ensure a response is sent even if an unhandled error occurs within the handler logic itself
    if (!ws.CLOSED) { // Check if WebSocket is still open
      ws.send(JSON.stringify({
        type: 'tool_result', // or 'error' type
        correlationId: correlationId,
        messageId: messageId,
        payload: {
          success: false,
          error: ErrorCodes.INTERNAL_SERVER_ERROR,
          message: `Internal server error while processing tool '${toolName}'.`,
          details: error.message,
        },
      }));
    }
  }
}

function handleWebSocketConnection(ws, req) { // Added req parameter
  // Assign a correlation ID for this WebSocket connection for consistent logging
  // Prefer X-Correlation-ID from incoming request if available (e.g. via upgrade headers, though not standard for raw WS)
  // For now, generate one per connection.
  // req is available here if needed for context (e.g. req.headers, req.url)
  ws.correlationId = `ws-conn-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  logger.info(`[WS-Handler][${ws.correlationId}] New WebSocket connection processing started.`);

  ws.on('message', async (messageBuffer) => {
    const messageString = messageBuffer.toString();
    logger.info(`[WS-Handler][${ws.correlationId}] Received raw message: ${messageString}`); // Log raw message
    let parsedMessage;

    try {
      parsedMessage = JSON.parse(messageString);
      logger.debug(`[WS-Handler][${ws.correlationId}] Parsed message:`, parsedMessage);
    } catch (error) {
      logger.error(`[WS-Handler][${ws.correlationId}] Failed to parse WebSocket message as JSON:`, {
        message: messageString,
        error: error.message,
      });
      ws.send(JSON.stringify({
        type: 'error',
        correlationId: ws.correlationId,
        messageId: null, // No messageId if we can't parse the message
        payload: {
          success: false,
          error: ErrorCodes.INVALID_JSON,
          message: 'Invalid JSON message format.',
        },
      }));
      return;
    }

    // Validate core message structure (type, messageId, payload)
    // The `action` field is used by MCP and was used by the old router.
    // For `tool_invoke` type, `payload.tool_name` is the key.
    const { type, messageId, payload, action } = parsedMessage;

    if (!messageId) {
      logger.warn(`[WS-Handler][${ws.correlationId}] WebSocket message missing messageId:`, { message: parsedMessage });
      ws.send(JSON.stringify({
        type: 'error',
        correlationId: ws.correlationId,
        messageId: null,
        payload: {
          success: false,
          error: ErrorCodes.MISSING_MESSAGE_ID,
          message: "Message must include a 'messageId' property for tracking.",
        },
      }));
      return;
    }

    // For MCR tools, we expect type: 'tool_invoke' and payload.tool_name
    // For MCP tools, we expect an 'action' like 'mcp.invoke_tool'
    const toolNameFromPayload = payload?.tool_name;
    if (type === 'tool_invoke' && !toolNameFromPayload) {
       logger.warn(`[WS-Handler][${ws.correlationId}] WebSocket 'tool_invoke' message missing 'payload.tool_name':`, { message: parsedMessage });
       ws.send(JSON.stringify({
         type: 'error',
         correlationId: ws.correlationId,
         messageId: messageId,
         payload: {
           success: false,
           error: ErrorCodes.MISSING_TOOL_NAME,
           message: "Messages of type 'tool_invoke' must include a 'payload.tool_name' property.",
         },
       }));
       return;
    }
    if (!type && !action) {
        logger.warn(`[WS-Handler][${ws.correlationId}] WebSocket message missing 'type' or 'action':`, { message: parsedMessage });
        ws.send(JSON.stringify({
          type: 'error',
          correlationId: ws.correlationId,
          messageId: messageId,
          payload: {
            success: false,
            error: ErrorCodes.MISSING_MESSAGE_TYPE_OR_ACTION,
            message: "Message must include a 'type' (e.g., 'tool_invoke') or 'action' (for MCP) property.",
          },
        }));
        return;
    }


    // Add `action` to parsedMessage if it's from `payload.tool_name` for `routeMessage` to use.
    // This standardizes where `routeMessage` looks for the primary action/tool identifier.
    // However, `routeMessage` is updated to check both.
    if (type === 'tool_invoke' && toolNameFromPayload && !action) {
        parsedMessage.action = toolNameFromPayload;
    }


    await routeMessage(ws, parsedMessage);
  });

  ws.on('close', () => {
    logger.info(`[WS-Handler][${ws.correlationId}] WebSocket connection closed.`);
  });

  ws.on('error', (error) => {
    logger.error(`[WS-Handler][${ws.correlationId}] WebSocket error:`, { error: error.message, stack: error.stack });
  });

  ws.send(JSON.stringify({
    type: 'connection_ack',
    correlationId: ws.correlationId,
    message: 'WebSocket connection established with MCR server.'
  }));
}

module.exports = {
  handleWebSocketConnection,
  // routeMessage can be exported for testing if needed
};
