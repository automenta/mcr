// new/src/websocketHandlers.js
const logger = require('./util/logger');
const sessionHandlers = require('./api/sessionHandlers');
const strategyHandlers = require('./api/strategyHandlers');
const ontologyHandlers = require('./api/ontologyHandlers');
const translationHandlers = require('./api/translationHandlers');
const utilityHandlers = require('./api/utilityHandlers');
const mcpHandler = require('./mcpHandler'); // For /mcp/sse, though SSE might remain HTTP

// Mock request and response objects for adapting Express handlers
function mockRequest(ws, message) {
  // Default headers, can be expanded if specific handlers need them
  const headers = {
    'x-correlation-id': ws.correlationId || `ws-gen-${Date.now()}`,
  };
  if (message.headers) {
    Object.assign(headers, message.headers);
  }

  return {
    body: message.payload || {},
    params: message.params || {},
    query: message.query || {},
    headers: headers,
    correlationId: headers['x-correlation-id'], // Ensure correlationId is on the req
    // Add other request properties if needed by handlers (e.g., ip, method)
    method: 'WEBSOCKET', // Indicate the method
    path: message.action, // Use action as path
    ws: ws, // Make WebSocket connection available to handlers if needed
  };
}

function mockResponse(ws, messageId) {
  const res = {
    status: (statusCode) => {
      res.statusCode = statusCode;
      return res;
    },
    json: (body) => {
      ws.send(
        JSON.stringify({
          messageId: messageId, // Include messageId for client-side tracking
          status: res.statusCode || 200,
          body: body,
        })
      );
      logger.http(
        `WS Response: ${messageId} Status: ${res.statusCode || 200}`,
        {
          correlationId: ws.correlationId,
          messageId: messageId,
          action: ws.currentAction, // The action being processed
        }
      );
    },
    send: (body) => {
      // For handlers that use send directly (e.g. for non-JSON responses)
      ws.send(
        JSON.stringify({
          messageId: messageId,
          status: res.statusCode || 200,
          body: body, // Body might be string or other type
        })
      );
      logger.http(
        `WS Response (send): ${messageId} Status: ${res.statusCode || 200}`,
        {
          correlationId: ws.correlationId,
          messageId: messageId,
          action: ws.currentAction,
        }
      );
    },
    setHeader: (name, value) => {
      // Websockets don't have headers in the same way as HTTP responses.
      // Log this or decide if there's a way to convey this info if necessary.
      logger.debug(
        `mockResponse setHeader called: ${name}=${value}. This is not directly supported by WebSockets.`
      );
    },
    // Add other response methods if needed by handlers
  };
  res.statusCode = 200; // Default status code
  return res;
}

async function routeMessage(ws, parsedMessage) {
  const { action, payload, params, query, messageId } = parsedMessage;
  ws.currentAction = action; // Store action for logging
  ws.correlationId = (parsedMessage.headers && parsedMessage.headers['x-correlation-id']) || ws.correlationId || `ws-gen-${Date.now()}`;


  const req = mockRequest(ws, parsedMessage);
  const res = mockResponse(ws, messageId);

  try {
    logger.info(`Routing WebSocket action: ${action}`, {
      correlationId: ws.correlationId,
      messageId: messageId,
      action: action,
    });

    // TODO: Add a timeout for processing each message?

    switch (action) {
      // Session management
      case 'sessions.create':
        await sessionHandlers.createSessionHandler(req, res);
        break;
      case 'sessions.get':
        await sessionHandlers.getSessionHandler(req, res);
        break;
      case 'sessions.delete':
        await sessionHandlers.deleteSessionHandler(req, res);
        break;
      case 'sessions.assert':
        await sessionHandlers.assertToSessionHandler(req, res);
        break;
      case 'sessions.query':
        await sessionHandlers.querySessionHandler(req, res);
        break;
      case 'sessions.explainQuery': // Renamed from explain-query for consistency
        await translationHandlers.explainQueryHandler(req, res);
        break;

      // Ontology management
      case 'ontologies.create':
        await ontologyHandlers.createOntologyHandler(req, res);
        break;
      case 'ontologies.list':
        await ontologyHandlers.listOntologiesHandler(req, res);
        break;
      case 'ontologies.get':
        await ontologyHandlers.getOntologyHandler(req, res);
        break;
      case 'ontologies.update':
        await ontologyHandlers.updateOntologyHandler(req, res);
        break;
      case 'ontologies.delete':
        await ontologyHandlers.deleteOntologyHandler(req, res);
        break;

      // Direct translation
      case 'translate.nlToRules': // Renamed for consistency
        await translationHandlers.nlToRulesDirectHandler(req, res);
        break;
      case 'translate.rulesToNl': // Renamed for consistency
        await translationHandlers.rulesToNlDirectHandler(req, res);
        break;

      // Strategy Management
      case 'strategies.list':
        await strategyHandlers.listStrategiesHandler(req, res);
        break;
      case 'strategies.setActive': // Renamed from /strategies/active PUT
        await strategyHandlers.setStrategyHandler(req, res);
        break;
      case 'strategies.getActive': // Renamed from /strategies/active GET
        await strategyHandlers.getActiveStrategyHandler(req, res);
        break;

      // Utility & Debugging
      case 'utility.getPrompts': // Renamed for consistency
        await utilityHandlers.getPromptsHandler(req, res);
        break;
      case 'utility.debugFormatPrompt': // Renamed for consistency
        await utilityHandlers.debugFormatPromptHandler(req, res);
        break;
      // Note: /health, /status, /mcp/sse are likely to remain HTTP or require special handling
      // For example, status could be a WebSocket message, but health is typically HTTP.
      // SSE over WebSockets is possible but mcpHandler would need significant changes.

      default:
        logger.warn(`Unknown WebSocket action: ${action}`, {
          correlationId: ws.correlationId,
          messageId: messageId,
        });
        res
          .status(400)
          .json({ error: 'Unknown action', receivedAction: action });
    }
  } catch (error) {
    logger.error(`Error processing WebSocket action ${action}:`, {
      error: error.message,
      stack: error.stack,
      correlationId: ws.correlationId,
      messageId: messageId,
      action: action,
    });
    // Ensure a response is sent even if an unhandled error occurs in the handler
    if (!res.headersSent) {
      // Check if response already started (though less common with our mock)
      res.status(500).json({
        error: 'Internal server error while processing action',
        action: action,
        messageId: messageId,
      });
    }
  }
}

function handleWebSocketConnection(ws) {
  ws.on('message', async (messageBuffer) => {
    const messageString = messageBuffer.toString();
    let parsedMessage;

    // Generate a correlation ID for this connection if it doesn't have one
    // This helps in tracking logs related to this specific WebSocket session
    if (!ws.correlationId) {
        ws.correlationId = `ws-conn-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        logger.info(`Assigned new correlation ID to WebSocket: ${ws.correlationId}`);
    }

    try {
      parsedMessage = JSON.parse(messageString);
    } catch (error) {
      logger.error('Failed to parse WebSocket message as JSON:', {
        message: messageString,
        error: error.message,
        correlationId: ws.correlationId,
      });
      ws.send(
        JSON.stringify({
          error: 'Invalid JSON message format.',
          status: 400,
          messageId: null, // No messageId if we can't parse the message
        })
      );
      return;
    }

    const { action, messageId } = parsedMessage;

    if (!action) {
      logger.warn('WebSocket message missing action:', {
        message: parsedMessage,
        correlationId: ws.correlationId,
        messageId: messageId,
      });
      ws.send(
        JSON.stringify({
          error: "Message must include an 'action' property.",
          status: 400,
          messageId: messageId,
        })
      );
      return;
    }
     if (!messageId) {
      logger.warn('WebSocket message missing messageId:', {
        message: parsedMessage,
        correlationId: ws.correlationId,
        action: action,
      });
      ws.send(JSON.stringify({
        error: "Message must include a 'messageId' property for tracking.",
        status: 400,
        action: action,
        messageId: null
      }));
      return;
    }

    await routeMessage(ws, parsedMessage);
  });

  ws.on('close', () => {
    logger.info('WebSocket connection closed.', { correlationId: ws.correlationId });
  });

  ws.on('error', (error) => {
    logger.error('WebSocket error:', { error: error.message, stack: error.stack, correlationId: ws.correlationId });
  });

  // Send a welcome message or initial state if needed
  ws.send(
    JSON.stringify({ type: 'connection_ack', message: 'WebSocket connection established.' })
  );
}

module.exports = {
  handleWebSocketConnection,
  // Exporting for potential testing, not direct use by app.js for now
  mockRequest,
  mockResponse,
  routeMessage
};
