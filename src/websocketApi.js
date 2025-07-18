// src/websocketApi.js
const logger = require('./util/logger');
const { ErrorCodes, ApiError } = require('./errors');
const { v4: uuidv4 } = require('uuid');
const { generateExample, generateOntology } = require('./utility');
const mcrService = require('./mcrService');
const mcrToolDefinitions = require('./tools')(mcrService, require('../src/config'));

// Define the tools MCR will offer via MCP
const mcrTools = [
	{
		name: 'create_reasoning_session',
		description:
			'Creates a new reasoning session for asserting facts and making queries.',
		input_schema: { type: 'object', properties: {} }, // No input needed
		output_schema: {
			type: 'object',
			properties: {
				sessionId: {
					type: 'string',
					description: 'The ID of the created session.',
				},
				createdAt: {
					type: 'string',
					format: 'date-time',
					description: 'Timestamp of session creation.',
				},
				// Added from mcrService.createSession output
				facts: {
					type: 'array',
					items: { type: 'string' },
					description: 'Initial facts in the session (usually empty).',
				},
				factCount: {
					type: 'integer',
					description: 'Initial number of facts in the session (usually 0).',
				},
			},
			required: ['sessionId', 'createdAt', 'facts', 'factCount'],
		},
	},
	{
		name: 'assert_facts_to_session',
		description:
			'Asserts natural language facts into a specified reasoning session.',
		input_schema: {
			type: 'object',
			properties: {
				sessionId: {
					type: 'string',
					description: 'The ID of the session to assert facts into.',
				},
				naturalLanguageText: {
					type: 'string',
					description: 'The natural language text containing facts to assert.',
				},
			},
			required: ['sessionId', 'naturalLanguageText'],
		},
		output_schema: {
			type: 'object',
			properties: {
				success: {
					type: 'boolean',
					description: 'Whether the assertion was successful.',
				},
				message: {
					type: 'string',
					description: 'A message indicating the result.',
				},
				addedFacts: {
					type: 'array',
					items: { type: 'string' },
					description: 'The Prolog facts that were added.',
					nullable: true,
				},
			},
			required: ['success', 'message'],
		},
	},
	{
		name: 'query_session',
		description:
			'Queries a specified reasoning session using a natural language question.',
		input_schema: {
			type: 'object',
			properties: {
				sessionId: {
					type: 'string',
					description: 'The ID of the session to query.',
				},
				naturalLanguageQuestion: {
					type: 'string',
					description: 'The natural language question to ask.',
				},
			},
			required: ['sessionId', 'naturalLanguageQuestion'],
		},
		output_schema: {
			type: 'object',
			properties: {
				success: {
					type: 'boolean',
					description: 'Whether the query processing was successful.',
				},
				answer: {
					type: 'string',
					description: 'The natural language answer from MCR.',
					nullable: true,
				},
				// debugInfo could be added here if useful for the MCP client
			},
			required: ['success'],
		},
	},
	{
		name: 'translate_nl_to_rules',
		description:
			'Translates a piece of natural language text into logical rules.',
		input_schema: {
			type: 'object',
			properties: {
				naturalLanguageText: {
					type: 'string',
					description: 'The natural language text to translate.',
				},
			},
			required: ['naturalLanguageText'],
		},
		output_schema: {
			type: 'object',
			properties: {
				success: {
					type: 'boolean',
					description: 'Whether the translation was successful.',
				},
				rules: {
					type: 'array',
					items: { type: 'string' },
					description:
						'An array of logical rules translated from the input text.',
					nullable: true,
				},
				rawOutput: {
					type: 'string',
					description:
						'The raw output string from the LLM, which might contain partially formed rules or comments.',
					nullable: true,
				},
				message: {
					type: 'string',
					description: 'A message indicating the result if not successful.',
					nullable: true,
				},
			},
			required: ['success'],
		},
	},
	{
		name: 'translate_rules_to_nl',
		description:
			'Translates a string of Prolog rules/facts into a natural language explanation.',
		input_schema: {
			type: 'object',
			properties: {
				prologRules: {
					type: 'string',
					description:
						'The Prolog rules/facts as a string (newline-separated).',
				},
				style: {
					type: 'string',
					enum: ['formal', 'conversational'],
					description:
						'The desired style of the explanation (defaults to conversational).',
					nullable: true,
				},
			},
			required: ['prologRules'],
		},
		output_schema: {
			type: 'object',
			properties: {
				success: {
					type: 'boolean',
					description: 'Whether the translation was successful.',
				},
				explanation: {
					type: 'string',
					description: 'The natural language explanation of the rules.',
					nullable: true,
				},
				message: {
					type: 'string',
					description: 'A message indicating the result if not successful.',
					nullable: true,
				},
			},
			required: ['success'],
		},
	},
];


async function routeMessage(socket, message) {
    const { type, tool, payload, messageId } = message;
    const correlationId = socket.correlationId;

    logger.info(`[WS-API][${correlationId}] Routing message. Type: '${type}', Tool: '${tool}', MsgID: ${messageId}`);

    try {
        switch (type) {
            case 'invoke':
                let result;
                const toolDefinition = mcrToolDefinitions[tool];
                if (toolDefinition && typeof toolDefinition.handler === 'function') {
                    logger.debug(`[WS-API][${correlationId}] Invoking tool: ${tool}`, { input: payload });

                    result = await toolDefinition.handler(payload || {});

                    if (result.success && (tool === 'session.create' || tool === 'session.get') && result.data?.id) {
                        if (socket.sessionId !== result.data.id) {
                            socket.sessionId = result.data.id;
                            logger.info(`[WS-API][${correlationId}] WebSocket connection now associated with session: ${socket.sessionId}`);
                        }
                    }
                } else if (tool === 'util.generate_example') {
                    result = await generateExample(payload.domain, payload.instructions);
                } else if (tool === 'util.generate_ontology') {
                    result = await generateOntology(payload.domain, payload.instructions);
                } else {
                    logger.warn(`[WS-API][${correlationId}] Unknown tool: ${tool}`, { messageId });
                    socket.send(JSON.stringify({
                        type: 'error',
                        correlationId,
                        messageId,
                        tool,
                        payload: {
                            success: false,
                            error: ErrorCodes.UNKNOWN_TOOL,
                            message: `Unknown tool: ${tool}`,
                        },
                    }));
                    return;
                }

                socket.send(JSON.stringify({
                    type: 'result',
                    correlationId,
                    messageId,
                    tool,
                    payload: result,
                }));
                break;

            case 'mcp.invoke_tool':
                await handleMcpToolInvocation(socket, message);
                break;

            case 'mcp.request_tools':
                sendWebSocketMessage(socket, 'mcp.tools_updated', { tools: mcrTools }, messageId, correlationId, 'initial_setup');
                break;

            default:
                logger.warn(`[WS-API][${correlationId}] Unrecognized message type: '${type}'`, { parsedMessage: message });
                socket.send(JSON.stringify({
                    type: 'error',
                    correlationId,
                    messageId,
                    payload: {
                        success: false,
                        error: ErrorCodes.INVALID_MESSAGE_STRUCTURE,
                        message: `Unrecognized message type: '${type}'`,
                    },
                }));
        }
    } catch (error) {
        logger.error(`[WS-API][${correlationId}] Error processing message for tool ${tool}: ${error.message}`, {
            stack: error.stack,
            messageId,
            tool,
        });
        socket.send(JSON.stringify({
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
        }));
    }
}

function handleWebSocketConnection(socket) {
    socket.correlationId = `ws-conn-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    logger.info(`[WS-API][${socket.correlationId}] New WebSocket connection established.`);

    socket.on('message', message => {
        logger.info(`[WS-API][${socket.correlationId}] Received raw message:`, message);
        routeMessage(socket, JSON.parse(message));
    });

    socket.on('close', () => {
        logger.info(`[WS-API][${socket.correlationId}] WebSocket connection closed.`);
    });

    socket.on('error', error => {
        logger.error(`[WS-API][${socket.correlationId}] WebSocket error:`, {
            error: error.message,
            stack: error.stack,
        });
    });

    socket.send(JSON.stringify({
        type: 'connection_ack',
        correlationId: socket.correlationId,
        message: 'WebSocket connection established with MCR server.',
    }));
}

function sendWebSocketMessage(ws, type, data, messageId, correlationId, invocation_id = 'N/A') {
    const message = {
        type,
        messageId,
        invocation_id,
        payload: data,
    };
    ws.send(JSON.stringify(message));
    logger.http(`[MCP WS][${ws.clientId}][${correlationId}] Sent WS message. Type: ${type}, MessageID: ${messageId}, InvocationID: ${invocation_id}`, { type, messageId, invocation_id, data });
}

async function handleMcpToolInvocation(socket, message) {
    const { payload, messageId, headers } = message;
    socket.correlationId = (headers && headers['x-correlation-id']) || socket.correlationId || `ws-mcp-${uuidv4()}`;
    socket.clientId = (headers && headers['x-mcp-client-id']) || socket.clientId || `ws-client-${uuidv4().substring(0, 8)}`;

    if (!payload || !payload.tool_name || !payload.invocation_id) {
        logger.warn(`[MCP WS][${socket.clientId}][${socket.correlationId}] Invalid 'mcp.invoke_tool' message: missing tool_name or invocation_id. MessageID: ${messageId}`);
        sendWebSocketMessage(socket, 'mcp.protocol_error', { error: "Invalid 'mcp.invoke_tool' message: missing tool_name or invocation_id." }, messageId, socket.correlationId, payload.invocation_id || 'unknown_invocation');
        return;
    }

    const { tool_name, input, invocation_id } = payload;
    const toolCorrelationId = `${socket.correlationId}-tool-${invocation_id ? invocation_id.substring(0, 8) : 'noinv'}`;
    logger.info(`[MCP Tool][${socket.clientId}][${toolCorrelationId}] Enter handleToolInvocation. Tool: ${tool_name}, InvocationID: ${invocation_id}, OriginalMsgID: ${messageId}`, { tool_name, input, invocation_id });

    let resultData;

    try {
        switch (tool_name) {
            case 'create_reasoning_session':
                const session = await mcrService.createSession();
                resultData = {
                    sessionId: session.id,
                    createdAt: session.createdAt.toISOString(),
                    facts: session.facts,
                    factCount: session.factCount,
                };
                break;
            case 'assert_facts_to_session':
                if (!input || !input.sessionId || !input.naturalLanguageText) {
                    throw new ApiError(400, 'Missing sessionId or naturalLanguageText for assert_facts_to_session');
                }
                const assertResult = await mcrService.assertNLToSession(input.sessionId, input.naturalLanguageText);
                resultData = {
                    success: assertResult.success,
                    message: assertResult.message,
                    addedFacts: assertResult.addedFacts,
                };
                if (!assertResult.success) {
                    const errorType = resultData.message && resultData.message.includes('Session not found') ? 'SESSION_NOT_FOUND_TOOL' : 'ASSERT_TOOL_FAILED';
                    const statusCode = errorType === 'SESSION_NOT_FOUND_TOOL' ? 404 : 400;
                    throw new ApiError(statusCode, resultData.message, errorType);
                }
                break;
            case 'translate_nl_to_rules':
                if (!input || !input.naturalLanguageText) {
                    throw new ApiError(400, 'Missing naturalLanguageText for translate_nl_to_rules');
                }
                const nlToRulesResult = await mcrService.translateNLToRulesDirect(input.naturalLanguageText);
                resultData = {
                    success: nlToRulesResult.success,
                    rules: nlToRulesResult.rules,
                    rawOutput: nlToRulesResult.rawOutput,
                    message: nlToRulesResult.message,
                };
                if (!nlToRulesResult.success) {
                    throw new ApiError(400, resultData.message || 'NL to Rules translation failed', 'NL_TO_RULES_TOOL_FAILED');
                }
                break;
            case 'translate_rules_to_nl':
                if (!input || !input.prologRules) {
                    throw new ApiError(400, 'Missing prologRules for translate_rules_to_nl');
                }
                const rulesToNlResult = await mcrService.translateRulesToNLDirect(input.prologRules, input.style || 'conversational');
                resultData = {
                    success: rulesToNlResult.success,
                    explanation: rulesToNlResult.explanation,
                    message: rulesToNlResult.message,
                };
                if (!rulesToNlResult.success) {
                    throw new ApiError(400, resultData.message || 'Rules to NL translation failed', 'RULES_TO_NL_TOOL_FAILED');
                }
                break;
            case 'query_session':
                if (!input || !input.sessionId || !input.naturalLanguageQuestion) {
                    throw new ApiError(400, 'Missing sessionId or naturalLanguageQuestion for query_session');
                }
                const queryResult = await mcrService.querySessionWithNL(input.sessionId, input.naturalLanguageQuestion);
                resultData = {
                    success: queryResult.success,
                    answer: queryResult.answer,
                };
                if (!queryResult.success) {
                    const errorType = queryResult.message && queryResult.message.includes('Session not found') ? 'SESSION_NOT_FOUND_TOOL' : 'QUERY_TOOL_FAILED';
                    const statusCode = errorType === 'SESSION_NOT_FOUND_TOOL' ? 404 : 500;
                    throw new ApiError(statusCode, queryResult.message || 'Query tool failed', errorType);
                }
                break;
            default:
                throw new ApiError(404, `Tool not found: ${tool_name}`, 'TOOL_NOT_FOUND');
        }

        sendWebSocketMessage(socket, 'mcp.tool_result', { tool_name, output: resultData }, messageId, toolCorrelationId, invocation_id);
    } catch (error) {
        logger.error(`[MCP Tool][${socket.clientId}][${toolCorrelationId}] Error invoking tool ${tool_name}: ${error.message}. OriginalMsgID: ${messageId}`, { error: error.stack });
        const isApiError = error instanceof ApiError;
        sendWebSocketMessage(socket, 'mcp.tool_error', {
            tool_name,
            error: {
                message: error.message,
                code: isApiError ? error.errorCode : 'TOOL_EXECUTION_ERROR',
                details: isApiError ? error.details : undefined,
            },
        }, messageId, toolCorrelationId, invocation_id);
    }
}

module.exports = {
    handleWebSocketConnection,
};
