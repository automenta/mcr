// new/src/app.js
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const setupRoutes = require('./routes');
const { errorHandlerMiddleware } = require('./errors');
const logger = require('./util/logger'); // For logging server start
// Placeholder for websocketHandlers, will be created in a later step
const { handleWebSocketConnection } = require('./websocketHandlers');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Standard middleware
app.use(express.json()); // For parsing application/json request bodies

// Request logging middleware (simple version)
app.use((req, res, next) => {
  const correlationId = req.headers['x-correlation-id'] || `gen-${Date.now()}`;
  req.correlationId = correlationId; // Make it available on req object
  res.setHeader('X-Correlation-ID', correlationId);

  logger.http(`Request: ${req.method} ${req.path}`, {
    correlationId,
    method: req.method,
    path: req.path,
    ip: req.ip,
    query: req.query,
    // body: req.body // Be cautious logging request bodies, especially in production (PII, large objects)
  });
  next();
});

// Setup routes
logger.info('Setting up application routes...');
setupRoutes(app); // HTTP routes are set up on the Express app
logger.info('Application routes set up.');

// WebSocket connection handling
wss.on('connection', (ws) => {
  logger.info('New WebSocket connection established.');
  handleWebSocketConnection(ws); // Delegate to the handler

  // ws.on('message', (message) => { // This logic is now in handleWebSocketConnection
  //   logger.info(`Received WebSocket message: ${message}`);
  //   // Placeholder: Message routing logic will be added here
  //   ws.send(`Echo: ${message}`); // Simple echo for now
  // });

  ws.on('close', () => {
    logger.info('WebSocket connection closed.');
  });

  ws.on('error', (error) => {
    logger.error('WebSocket error:', error);
  });
});

logger.info('WebSocket server set up.');

// Error handling middleware - should be last for the Express app
logger.info('Attaching error handling middleware...');
app.use(errorHandlerMiddleware);
logger.info('Error handling middleware attached.');

// Export the HTTP server instance for starting the server (e.g., in mcr.js)
module.exports = server;
