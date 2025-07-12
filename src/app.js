const express = require('express');
const http = require('http');
const { Server: SocketIOServer } = require('socket.io'); // Renamed to avoid conflict
const { handleWebSocketConnection } = require('./websocketHandlers');
const path = require('path');

// Assuming logger and errorHandlerMiddleware are accessible or passed in mcr.js
// For standalone tool checking, we might need placeholders if not modifying mcr.js in this step
const logger = require('./util/logger'); // Assuming logger is here
const { errorHandlerMiddleware } = require('./errors');

async function createServer() {
  const app = express();
  const httpServer = http.createServer(app);
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: '*', // Allow all origins for now
    },
  });

  // Standard middleware
  app.use(express.json());

  // Request logging middleware
  app.use((req, res, next) => {
    const correlationId = req.headers['x-correlation-id'] || `gen-${Date.now()}`;
    req.correlationId = correlationId;
    res.setHeader('X-Correlation-ID', correlationId);
    // Avoid logging every asset request from Vite dev server if too noisy
    if (!req.path.startsWith('/@vite') && !req.path.startsWith('/node_modules')) {
      logger.http(`Request: ${req.method} ${req.path}`, {
        correlationId, method: req.method, path: req.path, ip: req.ip, query: req.query,
      });
    }
    next();
  });

  logger.info('[App] Starting in development mode with Vite middleware.');
  const vite = await import('vite'); // Dynamic import for ESM module
  const viteDevServer = await vite.createServer({
    configFile: path.resolve(__dirname, '..', 'ui', 'vite.config.js'),
    root: path.resolve(__dirname, '..', 'ui'),
    server: { middlewareMode: true },
    appType: 'spa', // ensure Vite handles SPA routing in dev
  });
  app.use(viteDevServer.middlewares);
  logger.info('[App] Vite development middleware attached.');


  // WebSocket connection handling
  io.on('connection', (socket) => {
    handleWebSocketConnection(socket, io);
  });
  logger.info('[App] WebSocket server event handlers set up.');

  // Error handling middleware - should be last for the Express app
  // Assuming errorHandlerMiddleware is defined and imported elsewhere (e.g. mcr.js or a utils file)
  // If not, this would need to be defined or imported:
  app.use(errorHandlerMiddleware);
  logger.info('[App] Error-handling middleware attached.');

  return httpServer;
}

// Export the async function that creates and returns the server
module.exports = createServer;
