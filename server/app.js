// src/app.js
// This file will be simplified as WebSocket handling moves to websocketHandler.js
// and mcr.js will orchestrate the HTTP server and WebSocket server.
const express = require('express');
const { errorHandlerMiddleware } = require('./errors'); // Still useful for any basic HTTP interactions
const logger = require('./logger');

const app = express();

// Standard middleware
app.use(express.json()); // For parsing application/json if any HTTP endpoints remain or for health checks

// Basic request logging middleware (can be simplified or removed if no HTTP routes are complex)
app.use((req, res, next) => {
  // For WebSocket, correlationId will be handled differently, per message.
  // This HTTP logger is less critical now but can remain for simple health/root checks.
  logger.http(`HTTP Request: ${req.method} ${req.path}`, {
    method: req.method,
    path: req.path,
    ip: req.ip,
  });
  next();
});

// No more API routes here. They are removed in favor of WebSockets.
// A health check endpoint can be useful.
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'MCR server is running, WebSocket is primary interface.' });
});


// Error handling middleware - should be last for any remaining HTTP routes
app.use(errorHandlerMiddleware);

module.exports = app;
