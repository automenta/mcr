import { serve } from '@hono/node-server';
import { mcrApiApp } from './src/api'; // Imports the Hono app instance

const port = parseInt(process.env.AETHELRED_PORT || process.env.PORT || "3001", 10);
const hostname = process.env.AETHELRED_HOST || process.env.HOST || "0.0.0.0";

console.log(`Aethelred MCR API server starting on http://${hostname}:${port}...`);

const server = serve({
  fetch: mcrApiApp.fetch,
  port: port,
  hostname: hostname,
}, (info) => {
  console.log(`Aethelred MCR API server running at http://${info.address}:${info.port}/`);
  console.log("Access /status for API status.");
  console.log(`LLM Provider configured: ${process.env.MCR_LLM_PROVIDER || 'null (default)'}`);
});


// Graceful shutdown handling
function shutdown(signal: string) {
  console.log(`\n${signal} received. Shutting down Aethelred server...`);
  // For @hono/node-server, the server object returned by `serve` has a `close` method.
  if (server && typeof (server as any).close === 'function') {
    console.log('Closing HTTP server...');
    (server as any).close((err?: Error) => {
      if (err) {
        console.error('Error during server shutdown:', err);
        process.exit(1);
      }
      console.log('Server closed.');
      process.exit(0);
    });
  } else {
    console.log('Server object does not support close method or is undefined, exiting directly.');
    process.exit(0);
  }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Handle unhandled rejections and exceptions
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Application specific logging, throwing an error, or other logic here
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // Application specific logging, shutdown, or other logic here
  shutdown('uncaughtException'); // Attempt graceful shutdown
});
