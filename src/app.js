const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const { handleWebSocketConnection } = require('./websocketHandlers');
const path = require('path');
const logger = require('./util/logger');
const { errorHandlerMiddleware } = require('./errors');

async function createServer() {
	const app = express();
	const httpServer = http.createServer(app);

	const wss = new WebSocketServer({ noServer: true });
	httpServer.on('upgrade', (request, socket, head) => {
		if (request.url === '/ws') {
			wss.handleUpgrade(request, socket, head, ws => {
				wss.emit('connection', ws, request);
			});
		} else {
			socket.destroy();
		}
	});

	app.use(express.json());

	app.use((req, res, next) => {
		const correlationId =
			req.headers['x-correlation-id'] || `gen-${Date.now()}`;
		req.correlationId = correlationId;
		res.setHeader('X-Correlation-ID', correlationId);
		if (
			!req.path.startsWith('/@vite') &&
			!req.path.startsWith('/node_modules')
		) {
			logger.http(`Request: ${req.method} ${req.path}`, {
				correlationId,
				method: req.method,
				path: req.path,
				ip: req.ip,
				query: req.query,
			});
		}
		next();
	});

	logger.info('[App] Forcing development mode with Vite middleware.');
	const vite = await import('vite');
	const viteDevServer = await vite.createServer({
		configFile: path.resolve(__dirname, '..', 'ui', 'vite.config.js'),
		root: path.resolve(__dirname, '..', 'ui'),
		server: { middlewareMode: true },
		appType: 'spa',
	});
	app.use(viteDevServer.middlewares);

	wss.on('connection', socket => {
		handleWebSocketConnection(socket);
	});

	app.use(errorHandlerMiddleware);

	return httpServer;
}

module.exports = createServer;
