// ui/src/apiService.test.js
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import apiServiceInstance from './apiService'; // Testing the singleton instance
import { io } from 'socket.io-client'; // Import to access the mock

const TEST_WS_URL = 'ws://localhost:1234/test';
const TEST_HTTP_URL = 'http://localhost:1234/test'; // socket.io-client uses http/https, path should be preserved

describe('ApiService with socket.io-client mock', () => {
  let mockSocket;

  beforeEach(() => {
    // Reset the singleton's state for clean tests
    // Disconnect if a socket instance exists from a previous test
    if (apiServiceInstance.socket) {
      apiServiceInstance.disconnect();
    }
    apiServiceInstance.socket = null;
    apiServiceInstance.connectPromise = null;
    apiServiceInstance.eventListeners.clear();
    apiServiceInstance.pendingMessages.clear();
    apiServiceInstance.explicitlyClosed = false;
    apiServiceInstance.serverUrl = null;

    // The io function itself is mocked by vi.mock in setupTests.js
    // We call io() here to ensure a mock socket instance is created for apiService to use.
    // However, apiService.connect() is what actually calls io(), so we don't call it here.
    // We will get the mock instance after apiService.connect() is called.

    // Clear any history from the mock `io` function itself
    if (io.mockClear) { // io is a vi.fn() due to vi.mock
        io.mockClear();
    }

    // Clear the global mock socket instance if setupTests.js provides a helper
    if (io.clearMockSocketInstance) {
        io.clearMockSocketInstance();
    }
  });

  afterEach(() => {
    // Ensure any timers are cleaned up if they were mocked in specific test suites
    vi.useRealTimers();
    // Disconnect the service after each test to clean up
    apiServiceInstance.disconnect();
    if (io.clearMockSocketInstance) {
        io.clearMockSocketInstance(); // Clear the shared mock instance
    }
  });

  describe('Connection and Disconnection', () => {
    it('should connect to the socket.io server and convert ws:// URL', async () => {
      const connectPromise = apiServiceInstance.connect(TEST_WS_URL);
      // apiService.connect calls io(url), which is mocked. Get the instance.
      mockSocket = io.getMockSocketInstance();
      expect(mockSocket).toBeDefined();

      // Check if io was called with the correct, transformed URL
      expect(io).toHaveBeenCalledWith(TEST_HTTP_URL, expect.any(Object));

      // Simulate successful connection by triggering the 'connect' event on the mock socket
      mockSocket._simulateServerEvent('connect');

      await expect(connectPromise).resolves.toBeUndefined();
      expect(apiServiceInstance.isConnected()).toBe(true);
      expect(apiServiceInstance.serverUrl).toBe(TEST_HTTP_URL);
    });

    it('should handle connection error', async () => {
      const connectPromise = apiServiceInstance.connect(TEST_WS_URL);
      mockSocket = io.getMockSocketInstance();
      expect(mockSocket).toBeDefined();

      const error = new Error('Connection failed');
      mockSocket._simulateConnectError(error);

      await expect(connectPromise).rejects.toThrow(`Socket.IO connection error: ${error.message}`);
      expect(apiServiceInstance.isConnected()).toBe(false);
    });

    it('should disconnect from the socket.io server', async () => {
      const connectPromise = apiServiceInstance.connect(TEST_WS_URL);
      mockSocket = io.getMockSocketInstance();
      mockSocket._simulateServerEvent('connect'); // Successfully connect first
      await connectPromise;

      expect(apiServiceInstance.isConnected()).toBe(true);

      apiServiceInstance.disconnect();
      // The disconnect method on apiService should call socket.disconnect()
      expect(mockSocket.disconnect).toHaveBeenCalled();
      // Our mock socket's disconnect method also simulates the 'disconnect' event if it was connected.
      // apiService listens to this and updates its state.
      expect(apiServiceInstance.isConnected()).toBe(false);
      expect(apiServiceInstance.explicitlyClosed).toBe(true);
    });

    it('should not create a new connection if already connected', async () => {
      // First connection
      let connectPromise = apiServiceInstance.connect(TEST_WS_URL);
      mockSocket = io.getMockSocketInstance();
      mockSocket._simulateServerEvent('connect');
      await connectPromise;
      expect(apiServiceInstance.isConnected()).toBe(true);

      io.mockClear(); // Clear calls to io from the first connection attempt

      // Attempt second connection
      connectPromise = apiServiceInstance.connect(TEST_WS_URL);
      await expect(connectPromise).resolves.toBeUndefined(); // Should resolve immediately

      // io() should not have been called again because the existing connection is used
      expect(io).not.toHaveBeenCalled();
      expect(apiServiceInstance.isConnected()).toBe(true);
    });

    it('should return the existing promise if a connection attempt is already in progress', async () => {
        const promise1 = apiServiceInstance.connect(TEST_WS_URL); // First attempt
        mockSocket = io.getMockSocketInstance(); // Get the instance created by the first call
        expect(io).toHaveBeenCalledTimes(1); // io() constructor should have been called once
        expect(mockSocket).toBeDefined();

        // Do not simulate 'connect' yet, so it's "in progress"

        const promise2 = apiServiceInstance.connect(TEST_WS_URL); // Second attempt while first is in progress
        expect(promise2).toBe(promise1); // Key assertion: it's the same promise
        expect(io).toHaveBeenCalledTimes(1); // io() constructor should still only have been called once

        // Now, simulate the first connection succeeding
        mockSocket._simulateServerEvent('connect');

        // Both promises should now resolve
        await expect(promise1).resolves.toBeUndefined();
        await expect(promise2).resolves.toBeUndefined(); // As it's the same promise
        expect(apiServiceInstance.isConnected()).toBe(true);
      });
  });

  describe('Message Handling', () => {
    beforeEach(async () => {
      // Ensure connected before each message test
      const connectPromise = apiServiceInstance.connect(TEST_WS_URL);
      mockSocket = io.getMockSocketInstance();
      expect(mockSocket).toBeDefined();
      mockSocket._simulateServerEvent('connect'); // Simulate connection
      await connectPromise;
      expect(apiServiceInstance.isConnected()).toBe(true);
    });

    it('should send a message ("tool_invoke") and handle response', async () => {
      const toolName = 'test.tool';
      const input = { data: 'testData' };

      const responsePromise = apiServiceInstance.invokeTool(toolName, input);

      expect(mockSocket.emit).toHaveBeenCalledTimes(1);
      // Check the arguments of the first call to emit
      // First arg is event name ('message'), second is payload
      const emittedArgs = mockSocket.emit.mock.calls[0];
      expect(emittedArgs[0]).toBe('message');
      const sentMessage = emittedArgs[1];

      expect(sentMessage.type).toBe('tool_invoke');
      expect(sentMessage.messageId).toEqual(expect.any(String));
      expect(sentMessage.payload).toEqual({
        tool_name: toolName,
        input: input,
      });

      // Simulate server response via 'tool_result' event
      const mockResponsePayload = { success: true, data: 'response data' };
      const serverResponseMessage = {
        // type: 'tool_result', // This is the event name, not part of payload for this handler
        messageId: sentMessage.messageId, // Use the same messageId
        payload: mockResponsePayload,
      };
      // The apiService listens for 'tool_result'
      mockSocket._simulateServerEvent('tool_result', serverResponseMessage);

      await expect(responsePromise).resolves.toEqual(mockResponsePayload);
    });

    it('should reject promise if server response ("tool_result") indicates failure', async () => {
      const toolName = 'test.tool.fail';
      const input = { data: 'testData' };

      const responsePromise = apiServiceInstance.invokeTool(toolName, input);
      const sentMessage = mockSocket.emit.mock.calls[0][1]; // Get the payload of the emitted 'message'

      const mockResponsePayload = { success: false, message: 'Tool execution failed' };
      const serverResponseMessage = {
        messageId: sentMessage.messageId,
        payload: mockResponsePayload,
      };
      mockSocket._simulateServerEvent('tool_result', serverResponseMessage);

      await expect(responsePromise).rejects.toThrow('Tool execution failed');
    });

    it('should reject promise if server response ("tool_result") indicates failure with error field', async () => {
        const toolName = 'test.tool.fail.errorfield';
        const input = { data: 'testDataError' };

        const responsePromise = apiServiceInstance.invokeTool(toolName, input);
        const sentMessage = mockSocket.emit.mock.calls[0][1];

        const mockResponsePayload = { success: false, error: 'Tool execution failed with error field' };
        const serverResponseMessage = {
          messageId: sentMessage.messageId,
          payload: mockResponsePayload,
        };
        mockSocket._simulateServerEvent('tool_result', serverResponseMessage);

        await expect(responsePromise).rejects.toThrow('Tool execution failed with error field');
      });

    it('should reject promise if server sends no payload message/error on failure for "tool_result"', async () => {
        const toolName = 'test.tool.fail.nopayloadmsg';
        const responsePromise = apiServiceInstance.invokeTool(toolName, {});
        const sentMessage = mockSocket.emit.mock.calls[0][1];
        const serverResponseMessage = {
          messageId: sentMessage.messageId,
          payload: { success: false } // No message or error field
        };
        mockSocket._simulateServerEvent('tool_result', serverResponseMessage);
        await expect(responsePromise).rejects.toThrow('Tool invocation failed'); // Default error
      });

    it('should notify generic listeners for "kb_updated" events', () => {
      const listener = vi.fn();
      apiServiceInstance.addMessageListener(listener); // Listens via '*'

      const kbUpdatePayload = { data: 'kb was updated' };
      mockSocket._simulateServerEvent('kb_updated', kbUpdatePayload);

      // Generic listener receives { type: eventType, payload: data }
      expect(listener).toHaveBeenCalledWith({ type: 'kb_updated', payload: kbUpdatePayload });
    });

    it('should notify specific listeners for "kb_updated" events', () => {
        const specificListener = vi.fn();
        apiServiceInstance.addEventListener('kb_updated', specificListener);

        const kbUpdatePayload = { data: 'specific kb update' };
        mockSocket._simulateServerEvent('kb_updated', kbUpdatePayload);

        expect(specificListener).toHaveBeenCalledWith(kbUpdatePayload);
      });

    it('should remove message listener (generic via "*")', () => {
      const listener = vi.fn();
      apiServiceInstance.addMessageListener(listener);
      apiServiceInstance.removeMessageListener(listener); // Removes the '*' listener

      mockSocket._simulateServerEvent('kb_updated', { data: 'another update' });
      expect(listener).not.toHaveBeenCalled();
    });

    it('should remove specific event listener', () => {
        const specificListener = vi.fn();
        apiServiceInstance.addEventListener('kb_updated', specificListener);
        apiServiceInstance.removeEventListener('kb_updated', specificListener);

        mockSocket._simulateServerEvent('kb_updated', { data: 'specific update no listener' });
        expect(specificListener).not.toHaveBeenCalled();
      });


    it('should reject sendMessage if not connected', async () => {
      // Disconnect explicitly, then try to send.
      // First, ensure it was connected
      expect(apiServiceInstance.isConnected()).toBe(true);
      // Now, simulate a disconnect event from the server *after* initial connection
      mockSocket._simulateServerEvent('disconnect', 'io server disconnect');
      expect(apiServiceInstance.isConnected()).toBe(false);

      await expect(apiServiceInstance.invokeTool('test.tool', {}))
        .rejects
        .toThrow('Socket.IO is not connected.');
    });

     it('should handle MCP specific message structure for sendMessage', async () => {
      const actionName = 'mcp.action';
      const mcpPayload = { data: 'mcpData' };

      const responsePromise = apiServiceInstance.sendMessage('mcp', actionName, mcpPayload);

      expect(mockSocket.emit).toHaveBeenCalledTimes(1);
      const emittedArgs = mockSocket.emit.mock.calls[0];
      expect(emittedArgs[0]).toBe('message');
      const sentMessage = emittedArgs[1];

      expect(sentMessage.action).toBe(actionName); // MCP uses 'action' directly
      expect(sentMessage.messageId).toEqual(expect.any(String));
      // expect(sentMessage.type).toBeUndefined(); // Type might not be in top-level for MCP as per apiService.js logic
      expect(sentMessage.payload).toEqual(mcpPayload); // Payload is not nested under 'input' for mcp

      // Simulate server response (assuming it still comes as 'tool_result' or similar)
      const mockResponsePayload = { success: true, data: 'mcp response' };
      const serverResponseMessage = {
        messageId: sentMessage.messageId,
        payload: mockResponsePayload,
      };
      mockSocket._simulateServerEvent('tool_result', serverResponseMessage);

      await expect(responsePromise).resolves.toEqual(mockResponsePayload);
    });
  });

  describe('Reconnection and Event Handling', () => {
    // socket.io-client handles reconnection automatically.
    // These tests will focus on how ApiService reacts to socket.io events like 'disconnect' and 'connect_error'
    // rather than trying to mock the complex timer-based reconnection logic of socket.io itself.

    it('should notify "connection_status" listeners on "disconnect" event (e.g. server initiated)', async () => {
      const connectPromise = apiServiceInstance.connect(TEST_WS_URL);
      mockSocket = io.getMockSocketInstance();
      const statusListener = vi.fn();
      apiServiceInstance.addEventListener('connection_status', statusListener);

      mockSocket._simulateServerEvent('connect');
      await connectPromise;
      expect(apiServiceInstance.isConnected()).toBe(true);
      expect(statusListener).toHaveBeenCalledWith({ status: 'connected', url: TEST_HTTP_URL });
      statusListener.mockClear(); // Clear calls from initial connect

      // Simulate server disconnecting the client
      mockSocket._simulateServerEvent('disconnect', 'io server disconnect');

      expect(apiServiceInstance.isConnected()).toBe(false);
      expect(statusListener).toHaveBeenCalledWith({ status: 'disconnected_server', reason: 'io server disconnect' });
      // Check that pending messages are rejected
    });

    it('should notify "connection_status" listeners on "disconnect" event (explicit client disconnect)', async () => {
        const connectPromise = apiServiceInstance.connect(TEST_WS_URL);
        mockSocket = io.getMockSocketInstance();
        const statusListener = vi.fn();
        apiServiceInstance.addEventListener('connection_status', statusListener);

        mockSocket._simulateServerEvent('connect');
        await connectPromise;
        statusListener.mockClear();

        apiServiceInstance.disconnect(); // This calls mockSocket.disconnect()
                                       // which in turn simulates the 'disconnect' event with 'io client disconnect'

        expect(apiServiceInstance.isConnected()).toBe(false);
        expect(statusListener).toHaveBeenCalledWith({ status: 'disconnected_explicit', reason: 'io client disconnect' });
      });


    it('should notify "connection_status" listeners on "connect_error" event', async () => {
      const statusListener = vi.fn();
      apiServiceInstance.addEventListener('connection_status', statusListener);

      // Attempt to connect, it will create the mockSocket
      const connectPromise = apiServiceInstance.connect(TEST_WS_URL);
      mockSocket = io.getMockSocketInstance();

      const error = new Error('Network issue');
      mockSocket._simulateConnectError(error); // Simulate a connection error event

      try {
        await connectPromise;
      } catch (e) {
        // Expected rejection
      }

      expect(apiServiceInstance.isConnected()).toBe(false);
      // For an initial connect_error, the promise is rejected.
      // The status listener should be called for 'error' or 'reconnecting_error' depending on state.
      // In this case, it's the initial connect failing.
      expect(statusListener).toHaveBeenCalledWith({ status: 'error', message: 'Socket.IO connection error', error: error.message });
    });

    it('should reject pending messages when connection disconnects before response', async () => {
        const connectPromise = apiServiceInstance.connect(TEST_WS_URL);
        mockSocket = io.getMockSocketInstance();
        mockSocket._simulateServerEvent('connect');
        await connectPromise;
        expect(apiServiceInstance.isConnected()).toBe(true);

        const responsePromise = apiServiceInstance.invokeTool('test.tool', {});
        expect(apiServiceInstance.pendingMessages.size).toBe(1);

        // Simulate unexpected disconnect from server
        mockSocket._simulateServerEvent('disconnect', 'io server disconnect');

        await expect(responsePromise).rejects.toThrow('Socket.IO connection disconnected before response received.');
        expect(apiServiceInstance.pendingMessages.size).toBe(0);
      });

    it('should handle server emitting an "error" event', () => {
        apiServiceInstance.connect(TEST_WS_URL);
        mockSocket = io.getMockSocketInstance();
        mockSocket._simulateServerEvent('connect'); // Connect first

        const errorListener = vi.fn();
        apiServiceInstance.addEventListener('error', errorListener); // Generic error listener

        const serverErrorPayload = { code: 500, message: 'Server internal error' };
        mockSocket._simulateServerEvent('error', serverErrorPayload);

        expect(errorListener).toHaveBeenCalledWith(serverErrorPayload);
    });
  });
});
