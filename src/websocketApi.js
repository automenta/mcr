// src/websocketApi.js
const logger = require('./util/logger');
const { ErrorCodes, ApiError } = require('./errors');
const { v4: uuidv4 } = require('uuid');
const mcrToolDefinitions = require('./tools');

async function routeMessage(socket, message, mcrEngine) {
	const { type, tool, args, messageId } = message;
	const correlationId = socket.correlationId;

	logger.info(
		`[WS-API][${correlationId}] Routing message. Type: '${type}', Tool: '${tool}', MsgID: ${messageId}`
	);

	try {
		switch (type) {
			case 'invoke':
				let result;
				const tools = mcrToolDefinitions(mcrEngine, mcrEngine.config);
				const toolDefinition = tools[tool];

				if (toolDefinition && typeof toolDefinition.handler === 'function') {
					logger.debug(`[WS-API][${correlationId}] Invoking tool: ${tool}`, {
						input: args,
					});

					result = await toolDefinition.handler(args || {});

					if (
						result.success &&
						(tool === 'session.create' || tool === 'session.get') &&
						result.data?.id
					) {
						if (socket.sessionId !== result.data.id) {
							socket.sessionId = result.data.id;
							logger.info(
								`[WS-API][${correlationId}] WebSocket connection now associated with session: ${socket.sessionId}`
							);
						}
					}
				} else {
					logger.warn(`[WS-API][${correlationId}] Unknown tool: ${tool}`, {
						messageId,
					});
					socket.send(
						JSON.stringify({
							type: 'error',
							correlationId,
							messageId,
							tool,
							payload: {
								success: false,
								error: ErrorCodes.UNKNOWN_TOOL,
								message: `Unknown tool: ${tool}`,
							},
						})
					);
					return;
				}

				socket.send(
					JSON.stringify({
						type: 'result',
						correlationId,
						messageId,
						tool,
						payload: result,
					})
				);
				break;

			default:
				logger.warn(
					`[WS-API][${correlationId}] Unrecognized message type: '${type}'`,
					{ parsedMessage: message }
				);
				socket.send(
					JSON.stringify({
						type: 'error',
						correlationId,
						messageId,
						payload: {
							success: false,
							error: ErrorCodes.INVALID_MESSAGE_STRUCTURE,
							message: `Unrecognized message type: '${type}'`,
						},
					})
				);
		}
	} catch (error) {
		logger.error(
			`[WS-API][${correlationId}] Error processing message for tool ${tool}: ${error.message}`,
			{
				stack: error.stack,
				messageId,
				tool,
			}
		);
		socket.send(
			JSON.stringify({
				type: 'error',
				correlationId,
				messageId,
				tool,
				payload: {
					success: false,
					error: ErrorCodes.INTERNAL_SERVER_ERROR,
					message: `Internal server error while processing tool '${tool}'.`,
					details: error.message,
				},
			})
		);
	}
}

function handleWebSocketConnection(socket, mcrEngine) {
	socket.correlationId = `ws-conn-${Date.now()}-${Math.random()
		.toString(36)
		.substring(2, 7)}`;
	logger.info(
		`[WS-API][${socket.correlationId}] New WebSocket connection established.`
	);

	socket.on('message', message => {
		logger.info(
			`[WS-API][${socket.correlationId}] Received raw message:`,
			message
		);
		routeMessage(socket, JSON.parse(message), mcrEngine);
	});

	socket.on('close', () => {
		logger.info(
			`[WS-API][${socket.correlationId}] WebSocket connection closed.`
		);
	});

	socket.on('error', error => {
		logger.error(`[WS-API][${socket.correlationId}] WebSocket error:`, {
			error: error.message,
			stack: error.stack,
		});
	});

	socket.send(
		JSON.stringify({
			type: 'connection_ack',
			correlationId: socket.correlationId,
			message: 'WebSocket connection established with MCR server.',
		})
	);
}

module.exports = {
	handleWebSocketConnection,
};
