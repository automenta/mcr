// new/src/mcpHandler.js
const mcrService = require('./mcrService');
const { ApiError } = require('./errors'); // For consistent error structure if needed
const logger = require('./util/logger');
const { v4: uuidv4 } = require('uuid'); // For generating invocation IDs

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

/* function sendSseEvent( // Commented out as it's unused
  res,
  eventName,
  data,
  clientId = 'unknown',
  invocation_id = 'N/A'
) {
  const eventId = uuidv4();
  const loggedData = { ...data };
  // Avoid logging potentially very large tool outputs by default in the main log, log them separately if needed.
  if (eventName === 'tool_result' && loggedData.output) {
    loggedData.output =
      typeof loggedData.output === 'string'
        ? `String(length:${loggedData.output.length})`
        : `Object(keys:${Object.keys(loggedData.output)})`;
  }

  res.write(`id: ${eventId}\n`);
  res.write(`event: ${eventName}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
  logger.http(
    `[MCP SSE][${clientId}] Sent SSE event. Name: ${eventName}, EventID: ${eventId}, InvocationID: ${invocation_id}`,
    { eventName, eventId, invocation_id, data: loggedData }
  );
} */

// Function to send data over WebSocket
function sendWebSocketMessage(
	ws,
	type,
	data,
	messageId,
	correlationId,
	invocation_id = 'N/A'
) {
	const payload = {
		type, // e.g., 'mcp.tools_updated', 'mcp.tool_result', 'mcp.tool_error'
		messageId, // Original messageId from client, or new one for server-initiated messages
		invocation_id, // Relevant for tool_result/tool_error
		payload: data,
	};
	ws.send(JSON.stringify(payload));
	logger.http(
		`[MCP WS][${ws.clientId}][${correlationId}] Sent WS message. Type: ${type}, MessageID: ${messageId}, InvocationID: ${invocation_id}`,
		{ type, messageId, invocation_id, data } // Consider summarizing data for logging if large
	);
}

// This function will be called from websocketHandlers.js
async function handleMcpSocketMessage(ws, parsedMessage) {
	const { action, payload, messageId, headers } = parsedMessage; // 'action' is the MCP message type like 'mcp.invoke_tool' or 'mcp.request_tools'
	ws.correlationId =
		(headers && headers['x-correlation-id']) ||
		ws.correlationId ||
		`ws-mcp-${uuidv4()}`;
	ws.clientId =
		(headers && headers['x-mcp-client-id']) ||
		ws.clientId ||
		`ws-client-${uuidv4().substring(0, 8)}`;

	logger.info(
		`[MCP WS][${ws.clientId}][${ws.correlationId}] Received MCP message. Action: ${action}, MessageID: ${messageId}`,
		{ action, payload }
	);

	switch (action) {
		case 'mcp.request_tools':
			logger.info(
				`[MCP WS][${ws.clientId}][${ws.correlationId}] Sending 'mcp.tools_updated' event in response to request_tools. MessageID: ${messageId}`
			);
			sendWebSocketMessage(
				ws,
				'mcp.tools_updated',
				{ tools: mcrTools },
				messageId, // Respond with the same messageId
				ws.correlationId,
				'initial_setup'
			);
			break;
		case 'mcp.invoke_tool':
			// The payload of 'mcp.invoke_tool' should be invokeMsg format: { tool_name, input, invocation_id }
			if (!payload || !payload.tool_name || !payload.invocation_id) {
				logger.warn(
					`[MCP WS][${ws.clientId}][${ws.correlationId}] Invalid 'mcp.invoke_tool' message: missing tool_name or invocation_id. MessageID: ${messageId}`
				);
				sendWebSocketMessage(
					ws,
					'mcp.protocol_error',
					{
						error:
							"Invalid 'mcp.invoke_tool' message: missing tool_name or invocation_id.",
					},
					messageId,
					ws.correlationId,
					payload.invocation_id || 'unknown_invocation'
				);
				return;
			}
			await handleToolInvocation(
				ws, // Pass WebSocket connection
				payload, // This is the invokeMsg: { tool_name, input, invocation_id }
				messageId, // Pass messageId for responding
				ws.clientId,
				ws.correlationId
			);
			break;
		default:
			logger.warn(
				`[MCP WS][${ws.clientId}][${ws.correlationId}] Received unknown MCP WebSocket action: ${action}. MessageID: ${messageId}`
			);
			sendWebSocketMessage(
				ws,
				'mcp.protocol_error',
				{ error: 'Unknown MCP action', receivedAction: action },
				messageId,
				ws.correlationId
			);
	}
}

async function handleToolInvocation(
	ws, // Changed from res
	invokeMsg,
	originalMessageId, // To send back in response
	clientId,
	parentCorrelationId
) {
	const { tool_name, input, invocation_id } = invokeMsg;
	const toolCorrelationId = `${parentCorrelationId}-tool-${invocation_id ? invocation_id.substring(0, 8) : 'noinv'}`;
	logger.info(
		`[MCP Tool][${clientId}][${toolCorrelationId}] Enter handleToolInvocation. Tool: ${tool_name}, InvocationID: ${invocation_id}, OriginalMsgID: ${originalMessageId}`,
		{ tool_name, input, invocation_id } // Log full input here as it's specific to this invocation
	);
	let resultData;

	try {
		switch (tool_name) {
			case 'create_reasoning_session':
				logger.debug(
					`[MCP Tool][${clientId}][${toolCorrelationId}] Calling mcrService.createSession for ${tool_name}`
				);
				const session = mcrService.createSession();
				resultData = {
					sessionId: session.id,
					createdAt: session.createdAt.toISOString(),
					facts: session.facts,
					factCount: session.factCount,
				};
				break;

			case 'assert_facts_to_session':
				if (!input || !input.sessionId || !input.naturalLanguageText) {
					logger.warn(
						`[MCP Tool][${clientId}][${toolCorrelationId}] Invalid input for ${tool_name}: sessionId or naturalLanguageText missing.`
					);
					throw new ApiError(
						400,
						'Missing sessionId or naturalLanguageText for assert_facts_to_session'
					);
				}
				logger.debug(
					`[MCP Tool][${clientId}][${toolCorrelationId}] Calling mcrService.assertNLToSession for ${tool_name}. Session: ${input.sessionId}, Text: "${input.naturalLanguageText.substring(0, 50)}..."`
				);
				const assertResult = await mcrService.assertNLToSession(
					input.sessionId,
					input.naturalLanguageText
				);
				resultData = {
					success: assertResult.success,
					message: assertResult.message,
					addedFacts: assertResult.addedFacts,
				};
				if (!assertResult.success) {
					const errorType =
						resultData.message &&
						resultData.message.includes('Session not found')
							? 'SESSION_NOT_FOUND_TOOL'
							: 'ASSERT_TOOL_FAILED';
					const statusCode = errorType === 'SESSION_NOT_FOUND_TOOL' ? 404 : 400;
					logger.warn(
						`[MCP Tool][${clientId}][${toolCorrelationId}] ${tool_name} failed. Message: ${resultData.message}, Error type: ${errorType}`
					);
					throw new ApiError(statusCode, resultData.message, errorType);
				}
				break;

			case 'translate_nl_to_rules':
				if (!input || !input.naturalLanguageText) {
					logger.warn(
						`[MCP Tool][${clientId}][${toolCorrelationId}] Invalid input for ${tool_name}: naturalLanguageText missing.`
					);
					throw new ApiError(
						400,
						'Missing naturalLanguageText for translate_nl_to_rules'
					);
				}
				logger.debug(
					`[MCP Tool][${clientId}][${toolCorrelationId}] Calling mcrService.translateNLToRulesDirect for ${tool_name}. Text: "${input.naturalLanguageText.substring(0, 50)}..."`
				);
				const nlToRulesResult = await mcrService.translateNLToRulesDirect(
					input.naturalLanguageText
				);
				resultData = {
					success: nlToRulesResult.success,
					rules: nlToRulesResult.rules,
					rawOutput: nlToRulesResult.rawOutput,
					message: nlToRulesResult.message,
				};
				if (!nlToRulesResult.success) {
					logger.warn(
						`[MCP Tool][${clientId}][${toolCorrelationId}] ${tool_name} failed. Message: ${resultData.message}`
					);
					throw new ApiError(
						400,
						resultData.message || 'NL to Rules translation failed',
						'NL_TO_RULES_TOOL_FAILED'
					);
				}
				break;

			case 'translate_rules_to_nl':
				if (!input || !input.prologRules) {
					logger.warn(
						`[MCP Tool][${clientId}][${toolCorrelationId}] Invalid input for ${tool_name}: prologRules missing.`
					);
					throw new ApiError(
						400,
						'Missing prologRules for translate_rules_to_nl'
					);
				}
				logger.debug(
					`[MCP Tool][${clientId}][${toolCorrelationId}] Calling mcrService.translateRulesToNLDirect for ${tool_name}. Style: ${input.style || 'conversational'}, Rules: "${input.prologRules.substring(0, 50)}..."`
				);
				const rulesToNlResult = await mcrService.translateRulesToNLDirect(
					input.prologRules,
					input.style || 'conversational'
				);
				resultData = {
					success: rulesToNlResult.success,
					explanation: rulesToNlResult.explanation,
					message: rulesToNlResult.message,
				};
				if (!rulesToNlResult.success) {
					logger.warn(
						`[MCP Tool][${clientId}][${toolCorrelationId}] ${tool_name} failed. Message: ${resultData.message}`
					);
					throw new ApiError(
						400,
						resultData.message || 'Rules to NL translation failed',
						'RULES_TO_NL_TOOL_FAILED'
					);
				}
				break;

			case 'query_session':
				if (!input || !input.sessionId || !input.naturalLanguageQuestion) {
					logger.warn(
						`[MCP Tool][${clientId}][${toolCorrelationId}] Invalid input for ${tool_name}: sessionId or naturalLanguageQuestion missing.`
					);
					throw new ApiError(
						400,
						'Missing sessionId or naturalLanguageQuestion for query_session'
					);
				}
				logger.debug(
					`[MCP Tool][${clientId}][${toolCorrelationId}] Calling mcrService.querySessionWithNL for ${tool_name}. Session: ${input.sessionId}, Question: "${input.naturalLanguageQuestion.substring(0, 50)}..."`
				);
				const queryResult = await mcrService.querySessionWithNL(
					input.sessionId,
					input.naturalLanguageQuestion
					// Note: MCP query_session tool doesn't currently expose queryOptions like dynamicOntology or style.
					// If needed, the MCP tool schema and this call would need to be updated.
				);
				resultData = {
					success: queryResult.success,
					answer: queryResult.answer,
				};
				if (!queryResult.success) {
					const errorType =
						queryResult.message &&
						queryResult.message.includes('Session not found')
							? 'SESSION_NOT_FOUND_TOOL'
							: 'QUERY_TOOL_FAILED';
					const statusCode = errorType === 'SESSION_NOT_FOUND_TOOL' ? 404 : 500; // Default to 500 for other query failures
					logger.warn(
						`[MCP Tool][${clientId}][${toolCorrelationId}] ${tool_name} failed. Message: ${queryResult.message}, Error type: ${errorType}`
					);
					throw new ApiError(
						statusCode,
						queryResult.message || 'Query tool failed',
						errorType
					);
				}
				break;

			default:
				logger.warn(
					`[MCP Tool][${clientId}][${toolCorrelationId}] Unknown tool invoked: ${tool_name}`
				);
				throw new ApiError(
					404,
					`Tool not found: ${tool_name}`,
					'TOOL_NOT_FOUND'
				);
		}

		// Sensitive data (like full rule sets or long NL answers) is in resultData.
		// The sendSseEvent function already has logic to summarize 'output' for general logging.
		// For more detailed logging of specific tool outputs, one could add it here conditionally.
		logger.info(
			`[MCP Tool][${clientId}][${toolCorrelationId}] Successfully invoked ${tool_name}. OriginalMsgID: ${originalMessageId}`
		);
		sendWebSocketMessage(
			ws,
			'mcp.tool_result',
			{
				tool_name, // No longer sending invocation_id inside payload if it's top-level
				output: resultData,
			},
			originalMessageId, // Respond with the original messageId
			toolCorrelationId, // Use the specific tool correlation ID
			invocation_id // Pass invocation_id for the top-level field
		);
	} catch (error) {
		logger.error(
			`[MCP Tool][${clientId}][${toolCorrelationId}] Error invoking tool ${tool_name}: ${error.message}. OriginalMsgID: ${originalMessageId}`,
			{ error: error.stack } // Log stack for all errors from tools
		);
		const isApiError = error instanceof ApiError;
		sendWebSocketMessage(
			ws,
			'mcp.tool_error',
			{
				tool_name, // No longer sending invocation_id inside payload if it's top-level
				error: {
					message: error.message,
					code: isApiError ? error.errorCode : 'TOOL_EXECUTION_ERROR',
					details: isApiError ? error.details : undefined,
				},
			},
			originalMessageId, // Respond with the original messageId
			toolCorrelationId, // Use the specific tool correlation ID
			invocation_id // Pass invocation_id for the top-level field
		);
	}
}

module.exports = {
	handleMcpSocketMessage, // Export the new handler
	mcrTools, // Export mcrTools if needed by websocketHandlers for an initial "tools_updated" on generic MCP connect
};
