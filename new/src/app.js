// new/src/app.js
const express = require('express');
const setupRoutes = require('./routes');
const { errorHandlerMiddleware } = require('./errors');
const logger = require('./logger'); // For logging server start

const app = express();

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
setupRoutes(app);

// Error handling middleware - should be last
app.use(errorHandlerMiddleware);

module.exports = app;
