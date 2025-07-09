// src/websocketHandler.js
const WebSocket = require('ws');
const toolDefinitions = require('./tools');
const logger = require('./logger');
const { v4: uuidv4 } = require('uuid');

// Store connected clients
const clients = new Map(); // Using a Map to store clients with their IDs

function broadcast(message, currentClientWs = null) {
  // currentClientWs is the WebSocket connection of the client that triggered the broadcast (optional)
  logger.debug('[WebSocket] Broadcasting message to all clients:', message);
  for (const [clientId, clientData] of clients.entries()) {
    if (clientData.ws.readyState === WebSocket.OPEN) {
      // Optionally, don't send back to the originating client if message is specific
      // or modify message for originating client vs others.
      // For kb_updated, all clients of the same session should receive it.
      clientData.ws.send(JSON.stringify(message));
    }
  }
}

// Function to send a message to a specific client
function sendToClient(clientId, message) {
    const clientData = clients.get(clientId);
    if (clientData && clientData.ws.readyState === WebSocket.OPEN) {
        logger.debug(`[WebSocket] Sending message to client ${clientId}:`, message);
        clientData.ws.send(JSON.stringify(message));
    } else {
        logger.warn(`[WebSocket] Client ${clientId} not found or connection not open for sending message.`);
    }
}


async function messageDispatcher(clientId, message) {
  let parsedMessage;
  try {
    parsedMessage = JSON.parse(message);
    logger.info(`[WebSocket] Received message from client ${clientId}:`, parsedMessage);
  } catch (error) {
    logger.error(`[WebSocket] Failed to parse message from client ${clientId}: ${message}`, error);
    sendToClient(clientId, {
      type: 'error',
      correlationId: null,
      payload: { message: 'Invalid JSON message format.' },
    });
    return;
  }

  const { type, correlationId, payload } = parsedMessage;

  if (type === 'tool_invoke') {
    const toolName = payload.tool_name;
    const toolInput = payload.input;
    const tool = toolDefinitions[toolName];

    if (tool && typeof tool.handler === 'function') {
      try {
        logger.info(`[WebSocket] Dispatching to tool: ${toolName} for client ${clientId}`);
        // Add clientId and current WebSocket connection to toolInput if needed by handlers
        // For example: if a tool needs to know which client initiated the request
        const augmentedInput = { ...toolInput, _clientId: clientId };
        const result = await tool.handler(augmentedInput); // Call the handler from tools.js

        const response = {
          type: 'tool_result',
          correlationId,
          payload: result, // result should be { success: true/false, data: ..., error: ... }
        };
        sendToClient(clientId, response);

        // If the tool was successful and it's an action that modifies session state,
        // like asserting facts or loading an ontology, broadcast the KB update.
        if (result.success &&
            (toolName === 'assert_nl_to_session' ||
             toolName === 'load_ontology_into_session' ||
             toolName === 'create_session' || // Also send KB on new session (it will be empty)
             toolName === 'delete_session') && // Could send a "session_deleted" or clear KB
            toolInput.sessionId) {

          if (toolName === 'delete_session') {
            // For delete_session, we might want to send a specific message to clients of that session
            // or simply have them react to the session no longer being available.
            // For now, let's broadcast a specific event.
            const sessionSpecificMessage = {
              type: 'session_deleted_event',
              payload: { sessionId: toolInput.sessionId, message: `Session ${toolInput.sessionId} was deleted.`}
            };
            // Broadcast to all clients, they can filter by sessionID on their end if needed
            // Or, iterate clients and send only to those associated with this session.
            // For simplicity now, broadcast and let client handle.
            clients.forEach((clientObj, cId) => {
                if (clientObj.sessionId === toolInput.sessionId || !clientObj.sessionId) { // Also notify clients not in a session
                    sendToClient(cId, sessionSpecificMessage);
                }
            });

          } else {
            // Fetch the latest KB for the affected session
            const kbTool = toolDefinitions['get_full_kb_for_session'];
            if (kbTool) {
              const kbResult = await kbTool.handler({ sessionId: toolInput.sessionId });
              if (kbResult.success) {
                const kbUpdateMessage = {
                  type: 'kb_updated',
                  payload: {
                    sessionId: toolInput.sessionId,
                    knowledgeBase: kbResult.data.knowledgeBase,
                    triggeringTool: toolName,
                    addedFacts: result.data?.addedFacts // Include addedFacts if available from assert
                  },
                };
                // Broadcast this update to all clients subscribed to this session.
                // This requires clients to register their current sessionId.
                clients.forEach((clientObj, cId) => {
                    if (clientObj.sessionId === toolInput.sessionId) {
                        sendToClient(cId, kbUpdateMessage);
                    }
                });
              } else {
                logger.error(`[WebSocket] Failed to get KB for session ${toolInput.sessionId} after ${toolName} for broadcast. KB fetch error:`, kbResult.error);
              }
            }
          }
        }
      } catch (error) {
        logger.error(`[WebSocket] Error executing tool ${toolName} for client ${clientId}:`, error);
        sendToClient(clientId, {
          type: 'tool_result',
          correlationId,
          payload: {
            success: false,
            error: { message: `Server error executing tool: ${error.message}`, code: 'TOOL_EXECUTION_EXCEPTION' },
          },
        });
      }
    } else {
      logger.warn(`[WebSocket] Unknown tool: ${toolName} requested by client ${clientId}`);
      sendToClient(clientId, {
        type: 'tool_result',
        correlationId,
        payload: {
          success: false,
          error: { message: `Unknown tool: ${toolName}`, code: 'UNKNOWN_TOOL' },
        },
      });
    }
  } else if (type === 'client_update_session_subscription') {
    // Allow client to tell the server which session it's currently interested in
    const clientData = clients.get(clientId);
    if (clientData && payload.sessionId) {
        clientData.sessionId = payload.sessionId;
        logger.info(`[WebSocket] Client ${clientId} subscribed to session ${payload.sessionId}`);
        // Optionally, send current KB state for this new session subscription
        const kbTool = toolDefinitions['get_full_kb_for_session'];
        if (kbTool) {
            const kbResult = await kbTool.handler({ sessionId: payload.sessionId });
            if (kbResult.success) {
            const kbUpdateMessage = {
                type: 'kb_updated', // Use the same type so client handles it consistently
                payload: {
                sessionId: payload.sessionId,
                knowledgeBase: kbResult.data.knowledgeBase,
                reason: "Subscribed to session"
                },
            };
            sendToClient(clientId, kbUpdateMessage);
            }
        }

    } else if (clientData && payload.sessionId === null) {
        logger.info(`[WebSocket] Client ${clientId} unsubscribed from session ${clientData.sessionId}`);
        clientData.sessionId = null; // Unsubscribe
    }

  } else {
    logger.warn(`[WebSocket] Unknown message type: ${type} from client ${clientId}`);
    sendToClient(clientId, {
      type: 'error',
      correlationId,
      payload: { message: `Unknown message type: ${type}`, code: 'UNKNOWN_MESSAGE_TYPE' },
    });
  }
}

function setupWebSocketServer(server) {
  const wss = new WebSocket.Server({ server });
  logger.info('[WebSocket] WebSocket server is attached and listening.');

  wss.on('connection', (ws) => {
    const clientId = uuidv4();
    clients.set(clientId, { ws, sessionId: null }); // Store client and their current session interest
    logger.info(`[WebSocket] Client connected: ${clientId}, total clients: ${clients.size}`);

    // Send a connection acknowledgement message with the list of available tools
    const availableToolNames = Object.keys(toolDefinitions);
    ws.send(JSON.stringify({
      type: 'connection_ack',
      payload: {
        clientId,
        message: 'Successfully connected to MCR WebSocket server.',
        availableTools: availableToolNames.map(name => ({
            name,
            description: toolDefinitions[name].description
        }))
      }
    }));

    ws.on('message', (message) => {
      messageDispatcher(clientId, message);
    });

    ws.on('close', () => {
      clients.delete(clientId);
      logger.info(`[WebSocket] Client disconnected: ${clientId}, total clients: ${clients.size}`);
    });

    ws.on('error', (error) => {
      logger.error(`[WebSocket] Error on connection for client ${clientId}:`, error);
      // Ensure client is removed if an error causes a disconnect
      if (clients.has(clientId)) {
          clients.delete(clientId);
          logger.info(`[WebSocket] Client ${clientId} removed due to error, total clients: ${clients.size}`);
      }
    });
  });

  wss.on('error', (error) => {
    logger.error('[WebSocket] WebSocket Server Error:', error);
  });

  return wss;
}

module.exports = { setupWebSocketServer, broadcast, sendToClient };
// Note: `broadcast` and `sendToClient` might be used by mcrService if it needs to proactively send messages.
// For now, most communication is client-initiated or a response to client actions.
// The kb_updated is a proactive message, but it's triggered within the dispatcher.
// If mcrService background tasks (like evolver) need to send updates, they'd use these.
