// src/websocketHandlers.js
const logger = require('./util/logger');
const mcrToolDefinitions = require('./tools');
const { handleMcpSocketMessage } = require('./mcpHandler');
const { ErrorCodes } = require('./errors');
const mcrService = require('./mcrService');

async function routeMessage(socket, message) {
  const { type, payload, messageId } = message;
  const toolName = payload?.tool_name;
  const inputPayload = payload?.input;

  const correlationId = socket.correlationId;

  logger.info(
    `[WS-Handler][${correlationId}] Routing message. Type: '${type}', Tool/Action: '${toolName}', MsgID: ${messageId}`
  );

  try {
    if (type === 'tool_invoke' && toolName) {
      const tool = mcrToolDefinitions[toolName];
      if (tool && typeof tool.handler === 'function') {
        logger.debug(
          `[WS-Handler][${correlationId}] Invoking MCR tool: ${toolName}`,
          { input: inputPayload }
        );
        const result = await tool.handler(inputPayload || {});

        logger.info(
          `[WS-Handler][${correlationId}] MCR tool '${toolName}' executed. Success: ${result.success}`,
          { messageId }
        );
        logger.debug(
          `[WS-Handler][${correlationId}] Result for '${toolName}':`,
          result
        );

        if (result.success) {
          if (
            (toolName === 'session.create' || toolName === 'session.get') &&
            result.data?.id
          ) {
            if (socket.sessionId !== result.data.id) {
              socket.sessionId = result.data.id;
              logger.info(
                `[WS-Handler][${correlationId}] WebSocket connection now associated with session: ${socket.sessionId}`
              );
            }
          }
        }

        socket.send(
          JSON.stringify({
            type: 'tool_result',
            correlationId: correlationId,
            messageId: messageId,
            payload: result,
          })
        );
      } else if (toolName === 'hybrid.refine') {
        logger.info(
          `[WS-Handler][${correlationId}] Invoking hybrid.refine tool.`,
          { input: inputPayload }
        );

        const { sessionId, type: refineType, data } = inputPayload;
        const session = await mcrService.getSession(sessionId);
        if (!session) {
          return {
            success: false,
            message: 'Session not found.',
            error: ErrorCodes.SESSION_NOT_FOUND,
          };
        }

        const refineOperation = async (input) => {
          // This is a simplified operation for demonstration.
          // A real implementation would have more complex logic based on the refineType.
          return mcrService.assertNLToSession(sessionId, input);
        };

        const loopResult = await mcrService._refineLoop(refineOperation, data, {
          session,
          embeddingBridge: mcrService.embeddingBridge,
        });

        socket.send(
          JSON.stringify({
            type: 'tool_result',
            correlationId: correlationId,
            messageId: messageId,
            payload: {
              success: true,
              data: loopResult,
            },
          })
        );
      } else if (toolName === 'kg.query') {
        logger.info(`[WS-Handler][${correlationId}] Invoking kg.query tool.`, {
          input: inputPayload,
        });
        const { sessionId, query } = inputPayload;
        const session = await mcrService.getSession(sessionId);
        if (!session || !session.kbGraph) {
          return {
            success: false,
            message: 'Knowledge graph not enabled for this session.',
            error: ErrorCodes.KG_NOT_ENABLED,
          };
        }
        const results = session.kbGraph.queryTriples(query);
        socket.send(
          JSON.stringify({
            type: 'tool_result',
            correlationId: correlationId,
            messageId: messageId,
            payload: {
              success: true,
              data: results,
            },
          })
        );
      } else {
        logger.warn(
          `[WS-Handler][${correlationId}] Unknown MCR tool: ${toolName}`,
          { messageId }
        );
        socket.send(
          JSON.stringify({
            type: 'tool_result',
            correlationId: correlationId,
            messageId: messageId,
            payload: {
              success: false,
              error: ErrorCodes.UNKNOWN_TOOL,
              message: `Unknown tool: ${toolName}`,
            },
          })
        );
      }
    } else if (
      toolName &&
      (toolName.startsWith('mcp.') || message.action?.startsWith('mcp.'))
    ) {
      logger.info(
        `[WS-Handler][${correlationId}] Forwarding to MCP handler. Action: ${toolName}`,
        { messageId }
      );
      await handleMcpSocketMessage(socket, message);
    } else {
      logger.warn(
        `[WS-Handler][${correlationId}] Unrecognized message structure or missing tool/action. Type: '${type}', Tool/Action: '${toolName}'`,
        { parsedMessage: message }
      );
      socket.send(
        JSON.stringify({
          type: 'error',
          correlationId: correlationId,
          messageId: messageId,
          payload: {
            success: false,
            error: ErrorCodes.INVALID_MESSAGE_STRUCTURE,
            message:
              'Unrecognized message structure, type, or missing tool/action.',
          },
        })
      );
    }
  } catch (error) {
    logger.error(
      `[WS-Handler][${correlationId}] Error processing message for tool ${toolName}: ${error.message}`,
      {
        stack: error.stack,
        messageId: messageId,
        toolName: toolName,
      }
    );
    socket.send(
      JSON.stringify({
        type: 'tool_result',
        correlationId: correlationId,
        messageId: messageId,
        payload: {
          success: false,
          error: ErrorCodes.INTERNAL_SERVER_ERROR,
          message: `Internal server error while processing tool '${toolName}'.`,
          details: error.message,
        },
      })
    );
  }
}

function handleWebSocketConnection(socket) {
  socket.correlationId = `ws-conn-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  logger.info(
    `[WS-Handler][${socket.correlationId}] New WebSocket connection processing started.`
  );

  socket.on('message', (message) => {
    logger.info(
      `[WS-Handler][${socket.correlationId}] Received raw message:`,
      message
    );
    routeMessage(socket, JSON.parse(message));
  });

  socket.on('close', () => {
    logger.info(
      `[WS-Handler][${socket.correlationId}] WebSocket connection closed.`
    );
  });

  socket.on('error', (error) => {
    logger.error(`[WS-Handler][${socket.correlationId}] WebSocket error:`, {
      error: error.message,
      stack: error.stack,
    });
  });

  socket.send(
    JSON.stringify({
      type: 'connection_ack',
      correlationId: socket.correlationId,
      message: 'WebSocket connection established with MCR server.',
    })
  );
}

module.exports = {
  handleWebSocketConnection,
};
