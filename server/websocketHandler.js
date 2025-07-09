// server/websocketHandler.js
const WebSocket = require('ws');
const toolDefinitions = require('./tools');
const { v4: uuidv4 } = require('uuid'); // For correlation IDs if client doesn't send

// This will store a map of sessionIds to WebSocket connections
// to allow pushing kb_updated messages only to relevant clients.
// This is a simple in-memory store. For scalability, a more robust solution
// (e.g., Redis pub/sub) would be needed if sessions can be accessed by multiple clients
// or if the server is load-balanced.
const sessionSubscriptions = new Map();

function subscribeClientToSession(sessionId, ws) {
  if (!sessionSubscriptions.has(sessionId)) {
    sessionSubscriptions.set(sessionId, new Set());
  }
  sessionSubscriptions.get(sessionId).add(ws);
  console.log(`[WebSocketHandler] Client subscribed to session ${sessionId}`);
}

function unsubscribeClientFromSession(sessionId, ws) {
  if (sessionSubscriptions.has(sessionId)) {
    sessionSubscriptions.get(sessionId).delete(ws);
    if (sessionSubscriptions.get(sessionId).size === 0) {
      sessionSubscriptions.delete(sessionId);
    }
    console.log(`[WebSocketHandler] Client unsubscribed from session ${sessionId}`);
  }
}

function unsubscribeClientFromAll(ws) {
    let unsubscribedFromAny = false;
    sessionSubscriptions.forEach((clients, sessionId) => {
        if (clients.has(ws)) {
            clients.delete(ws);
            unsubscribedFromAny = true;
            console.log(`[WebSocketHandler] Client auto-unsubscribed from session ${sessionId} on disconnect`);
            if (clients.size === 0) {
                sessionSubscriptions.delete(sessionId);
            }
        }
    });
    if (unsubscribedFromAny) {
        console.log('[WebSocketHandler] Client disconnected and unsubscribed from all sessions.');
    }
}


async function handleMessage(ws, message) {
  let parsedMessage;
  try {
    parsedMessage = JSON.parse(message);
  } catch (error) {
    console.error('[WebSocketHandler] Error parsing message:', message, error);
    ws.send(JSON.stringify({
      type: 'error',
      correlationId: null,
      payload: { success: false, message: 'Invalid JSON message format.' }
    }));
    return;
  }

  const { type, correlationId: clientCorrelationId, payload } = parsedMessage;
  const correlationId = clientCorrelationId || uuidv4(); // Use client's or generate one

  console.log(`[WebSocketHandler] Received message: type=${type}, correlationId=${correlationId}`, payload);

  if (type === 'tool_invoke') {
    const toolName = payload.tool_name;
    const toolInput = payload.input;
    const tool = toolDefinitions[toolName];

    if (tool && typeof tool.handler === 'function') {
      try {
        const result = await tool.handler(toolInput);
        ws.send(JSON.stringify({
          type: 'tool_result',
          correlationId: correlationId,
          payload: result // result should include { success: true/false, ...data }
        }));

        // If a session was created or interacted with, subscribe the client to it
        // This is a simplistic way to manage subscriptions.
        // A more robust way would be an explicit subscribe_to_session tool.
        if (result.sessionId) {
            subscribeClientToSession(result.sessionId, ws);
        }

        // Handle real-time KB update after successful assertion
        if (toolName === 'assert_facts_to_session' && result.success && result.sessionId) {
          const mcrService = require('./services/mcrService'); // local require to avoid top-level circular dep with tools.js
          const fullKnowledgeBase = await mcrService.getKnowledgeBase(result.sessionId);
          if (fullKnowledgeBase !== null) {
            const updatedKbPayload = {
              sessionId: result.sessionId,
              newFacts: result.addedFacts || [], // Ensure newFacts is an array
              fullKnowledgeBase: fullKnowledgeBase
            };
            broadcastKbUpdate(result.sessionId, updatedKbPayload); // Removed correlationId from broadcast
          } else {
            console.warn(`[WebSocketHandler] Could not retrieve full KB for session ${result.sessionId} after assertion. KB_updated message not sent.`);
          }
        }

      } catch (error) {
        console.error(`[WebSocketHandler] Error executing tool ${toolName}:`, error);
        ws.send(JSON.stringify({
          type: 'tool_result',
          correlationId: correlationId,
          payload: { success: false, message: error.message || 'Tool execution failed.', error: error.name || 'UnknownError' }
        }));
      }
    } else {
      ws.send(JSON.stringify({
        type: 'tool_result',
        correlationId: correlationId,
        payload: { success: false, message: `Tool "${toolName}" not found or handler is not a function.` }
      }));
    }
  } else if (type === 'subscribe_to_session') { // Explicit subscription management
    const { sessionId } = payload;
    if (sessionId) {
      subscribeClientToSession(sessionId, ws);
      ws.send(JSON.stringify({ type: 'subscription_ack', correlationId, payload: { sessionId, message: 'Subscribed successfully.' }}));
    } else {
      ws.send(JSON.stringify({ type: 'error', correlationId, payload: { message: 'Session ID required for subscription.' }}));
    }
  } else if (type === 'unsubscribe_from_session') {
    const { sessionId } = payload;
    if (sessionId) {
      unsubscribeClientFromSession(sessionId, ws);
      ws.send(JSON.stringify({ type: 'unsubscription_ack', correlationId, payload: { sessionId, message: 'Unsubscribed successfully.' }}));
    } else {
      ws.send(JSON.stringify({ type: 'error', correlationId, payload: { message: 'Session ID required for unsubscription.' }}));
    }
  }
  else {
    ws.send(JSON.stringify({
      type: 'error',
      correlationId: correlationId,
      payload: { success: false, message: `Unknown message type: "${type}"` }
    }));
  }
}

// Function to broadcast KB updates to subscribed clients
function broadcastKbUpdate(sessionId, kbPayload, originalCorrelationId) {
  const subscribers = sessionSubscriptions.get(sessionId);
  if (subscribers) {
    const message = JSON.stringify({
      type: 'kb_updated',
      // We don't use the original client's correlationId for a broadcast,
      // as this is a server-initiated push relevant to the session, not a direct response.
      // However, including it might help some clients trace causality if needed.
      // Alternatively, generate a new one or have a fixed "event_id" for such pushes.
      // For now, let's just send the payload. The client will know which session it's for.
      correlationId: `event-${uuidv4()}`, // New correlation ID for the event
      payload: kbPayload
    });
    console.log(`[WebSocketHandler] Broadcasting kb_updated for session ${sessionId} to ${subscribers.size} client(s).`);
    subscribers.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  } else {
    console.log(`[WebSocketHandler] No clients subscribed to session ${sessionId} for kb_update.`);
  }
}


function setupWebSocketServer(server) {
  const wss = new WebSocket.Server({ server, path: '/ws' }); // Define path for WebSocket

  wss.on('connection', (ws) => {
    console.log('[WebSocketHandler] Client connected');

    ws.on('message', (message) => {
      handleMessage(ws, message);
    });

    ws.on('close', () => {
      console.log('[WebSocketHandler] Client disconnected');
      // Clean up any subscriptions this client had
      unsubscribeClientFromAll(ws);
    });

    ws.on('error', (error) => {
      console.error('[WebSocketHandler] WebSocket error:', error);
      // Also clean up subscriptions on error
      unsubscribeClientFromAll(ws);
    });

    ws.send(JSON.stringify({ type: 'connection_ack', message: 'Successfully connected to MCR WebSocket server.' }));
  });

  console.log('[WebSocketHandler] WebSocket server is set up and listening on /ws');
  return wss;
}

module.exports = { setupWebSocketServer, broadcastKbUpdate }; // Export broadcastKbUpdate for mcrService
