// new/src/app.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { handleWebSocketConnection } = require('./websocketHandlers');
const path = require('path'); // For serving static UI files

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*', // Allow all origins for now
  },
});

// Standard middleware
app.use(express.json()); // For parsing application/json request bodies

// Request logging middleware (simple version) - useful for UI asset requests too
app.use((req, res, next) => {
  const correlationId = req.headers['x-correlation-id'] || `gen-${Date.now()}`;
  req.correlationId = correlationId; // Make it available on req object
  res.setHeader('X-Correlation-ID', correlationId);

  // Log less for static assets if desired, or filter by path
  if (!req.path.startsWith('/assets/') && !req.path.endsWith('.jsx')) { // Example filter
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

// Serve static files for the MCR Workbench UI from the 'ui/dist' folder
// This assumes the React app is built into 'ui/dist'
const uiBuildPath = path.join(__dirname, '..', 'ui', 'dist');
logger.info(`[App] Serving MCR Workbench UI from: ${uiBuildPath}`);
app.use(express.static(uiBuildPath));

// Fallback for SPAs: always serve index.html for non-api routes
// This needs to be after API-specific routes (if any) and static files.
// Since we removed dedicated API routes, this is simpler.
app.get('*', (req, res, next) => {
  // If express.static has not served an asset, and no other GET route matched,
  // this will serve index.html for SPA routing.
  // The check for req.path.includes('.') might be too broad if assets are served by express.static.
  // WebSocket requests (/ws) are typically handled by an upgrade mechanism, not a GET route.
  const indexPath = path.join(uiBuildPath, 'index.html');
  logger.debug(`[App] SPA fallback: attempting to serve ${indexPath} for ${req.path}`);
  res.sendFile(indexPath, (err) => {
    if (err) {
        logger.error(`[App] Error serving index.html for SPA fallback: ${err.message}`);
        next(err);
    }
  });
});


// Setup routes - REMOVED
// logger.info('Setting up application routes...');
// setupRoutes(app); // HTTP routes are set up on the Express app
// logger.info('Application routes set up.');

// WebSocket connection handling with Socket.IO
io.on('connection', (socket) => {
  handleWebSocketConnection(socket, io);
});

logger.info('WebSocket server set up.');

// Error handling middleware - should be last for the Express app
logger.info('Attaching error handling middleware...');
app.use(errorHandlerMiddleware);
logger.info('Error handling middleware attached.');

// Export the HTTP server instance for starting the server (e.g., in mcr.js)
module.exports = server;
