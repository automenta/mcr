// new/src/app.js
const express = require('express');
// const setupRoutes = require('./routes'); // Will be removed or heavily modified
const { errorHandlerMiddleware } = require('../server/utils/errors'); // Corrected path
const logger = require('../server/utils/logger'); // Corrected path
const { setupWebSocketServer } = require('../server/websocketHandler'); // Path to new handler

const app = express();

// Standard middleware
app.use(express.json()); // For parsing application/json request bodies for any remaining HTTP routes

// Request logging middleware (simple version) - still useful for HTTP part
app.use((req, res, next) => {
  // Only log if it's not a WebSocket upgrade request
  if (req.headers.upgrade !== 'websocket') {
    const correlationId = req.headers['x-correlation-id'] || `gen-${Date.now()}`;
    req.correlationId = correlationId; // Make it available on req object
    res.setHeader('X-Correlation-ID', correlationId);

    logger.http(`Request: ${req.method} ${req.path}`, {
      correlationId,
      method: req.method,
      path: req.path,
      ip: req.ip,
      query: req.query,
      // body: req.body // Be cautious logging request bodies
    });
  }
  next();
});

// Basic HTTP routes (e.g., health check) can remain or be added here
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'MCR server is running and healthy.' });
});

// Comment out or remove old REST API route setup
// logger.info('Setting up application routes...');
// setupRoutes(app); // This line is commented out as REST routes are being replaced
// logger.info('Application routes set up.');


// Error handling middleware - should be last for HTTP routes
logger.info('Attaching error handling middleware for HTTP routes...');
app.use(errorHandlerMiddleware);
logger.info('Error handling middleware attached.');

// The function to start the server and attach WebSocket server will be in mcr.js
// This module will now primarily export the configured Express app.
// The WebSocket server will be attached to the HTTP server instance created from this app.

module.exports = { app, setupWebSocketServer }; // Export app and the WebSocket setup function
