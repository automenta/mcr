// ui/src/apiService.test.js
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import apiServiceInstance from './apiService'; // Testing the singleton instance

const TEST_WS_URL = 'ws://localhost:1234/test';

// Mock WebSocket class
class MockWebSocket {
  constructor(url) {
    this.url = url;
    this.readyState = MockWebSocket.CONNECTING;
    this.onopen = null;
    this.onmessage = null;
    this.onclose = null;
    this.onerror = null;
    this.sentMessages = [];
    this.close = vi.fn(this.close); // Mock the close method
  }

  send(message) {
    this.sentMessages.push(message);
  }

  close(code = 1000, reason = 'Normal closure') { // Default arguments for close
    this.readyState = MockWebSocket.CLOSING;
    setTimeout(() => {
      this.readyState = MockWebSocket.CLOSED;
      if (this.onclose) this.onclose({ code, reason });
    }, 10);
  }

  // Helper methods to simulate events from the server
  _simulateOpen() {
    this.readyState = MockWebSocket.OPEN;
    if (this.onopen) this.onopen();
  }

  _simulateMessage(data) {
    if (this.onmessage) this.onmessage({ data });
  }

  _simulateClose(code = 1000, reason = 'Normal closure') {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) this.onclose({ code, reason });
  }

  _simulateError(error) {
    if (this.onerror) this.onerror(error);
  }
}

MockWebSocket.CONNECTING = 0;
MockWebSocket.OPEN = 1;
MockWebSocket.CLOSING = 2;
MockWebSocket.CLOSED = 3;

// Mock the global WebSocket object
const originalWebSocket = global.WebSocket;

describe('ApiService with native WebSocket mock', () => {
  let wsInstance;

  beforeEach(() => {
    // Reset the singleton's state for clean tests
    apiServiceInstance.disconnect(); // Ensure any existing connection is closed
    apiServiceInstance.ws = null;
    apiServiceInstance.connectPromise = null;
    apiServiceInstance.eventListeners.clear();
    apiServiceInstance.pendingMessages.clear();
    apiServiceInstance.reconnectAttempts = 0;
    apiServiceInstance.explicitlyClosed = false;
    apiServiceInstance.serverUrl = null;

    // Replace global WebSocket with our mock and capture the instance
    global.WebSocket = vi.fn((url) => {
      wsInstance = new MockWebSocket(url);
      return wsInstance;
    });

    vi.useFakeTimers(); // Use fake timers for controlling setTimeout/setInterval
  });

  afterEach(() => {
    // Restore original WebSocket
    global.WebSocket = originalWebSocket;
    vi.useRealTimers(); // Restore real timers
    // Ensure any pending reconnections are cleared
    apiServiceInstance.disconnect();
  });

  describe('Connection and Disconnection', () => {
    it('should connect to the WebSocket server', async () => {
      const connectPromise = apiServiceInstance.connect(TEST_WS_URL);
      expect(global.WebSocket).toHaveBeenCalledWith(TEST_WS_URL);
      expect(wsInstance).toBeDefined();

      vi.advanceTimersByTime(0); // Allow apiService to set up its onopen handler
      wsInstance._simulateOpen(); // Explicitly simulate open
      vi.advanceTimersByTime(10); // Advance timers to trigger onopen in apiService

      await expect(connectPromise).resolves.toBeUndefined();
      expect(apiServiceInstance.isConnected()).toBe(true);
      expect(apiServiceInstance.serverUrl).toBe(TEST_WS_URL);
    });

    it('should handle connection error', async () => {
      const connectPromise = apiServiceInstance.connect(TEST_WS_URL);
      // wsInstance is set by the global.WebSocket mock when connect() is called
      expect(wsInstance).toBeDefined();

      const error = new Error('Connection failed');
      wsInstance._simulateError(error);
      wsInstance._simulateClose(1006, 'abnormal closure'); // Error typically leads to close

      await expect(connectPromise).rejects.toThrow(`WebSocket connection error: ${error.message}`);
      expect(apiServiceInstance.isConnected()).toBe(false);
    });

    it('should disconnect from the WebSocket server', async () => {
      const connectPromise = apiServiceInstance.connect(TEST_WS_URL);
      vi.advanceTimersByTime(0); // Allow apiService to set up its onopen handler
      wsInstance._simulateOpen(); // Simulate open
      vi.advanceTimersByTime(10); // Advance timers to trigger onopen in apiService
      await connectPromise;

      expect(apiServiceInstance.isConnected()).toBe(true);

      apiServiceInstance.disconnect();
      expect(wsInstance.readyState).toBe(MockWebSocket.CLOSING);
      vi.advanceTimersByTime(10); // Simulate close

      expect(wsInstance.close).toHaveBeenCalled();
      expect(apiServiceInstance.isConnected()).toBe(false);
      expect(apiServiceInstance.explicitlyClosed).toBe(true);
    });

    it('should not create a new connection if already connected', async () => {
      // First connection
      let connectPromise = apiServiceInstance.connect(TEST_WS_URL);
      vi.advanceTimersByTime(0); // Allow apiService to set up its onopen handler
      wsInstance._simulateOpen(); // Simulate open
      vi.advanceTimersByTime(10); // Advance timers to trigger onopen in apiService
      await connectPromise;
      expect(apiServiceInstance.isConnected()).toBe(true);

      global.WebSocket.mockClear(); // Clear calls to WebSocket constructor

      // Attempt second connection
      connectPromise = apiServiceInstance.connect(TEST_WS_URL);
      await expect(connectPromise).resolves.toBeUndefined(); // Should resolve immediately

      // WebSocket constructor should not have been called again
      expect(global.WebSocket).not.toHaveBeenCalled();
      expect(apiServiceInstance.isConnected()).toBe(true);
    });

    it('should return the existing promise if a connection attempt is already in progress', async () => {
        const promise1 = apiServiceInstance.connect(TEST_WS_URL); // First attempt
        expect(global.WebSocket).toHaveBeenCalledTimes(1); // WebSocket constructor should have been called once

        const promise2 = apiServiceInstance.connect(TEST_WS_URL); // Second attempt while first is in progress
        expect(promise2).toBe(promise1); // Key assertion: it's the same promise
        expect(global.WebSocket).toHaveBeenCalledTimes(1); // WebSocket constructor should still only have been called once

        vi.advanceTimersByTime(0); // Allow apiService to set up its onopen handler
        wsInstance._simulateOpen(); // Simulate open for the first connection
        vi.advanceTimersByTime(10); // Now, simulate the first connection succeeding

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
      vi.advanceTimersByTime(0); // Allow apiService to set up its onopen handler
      wsInstance._simulateOpen(); // Simulate open
      vi.advanceTimersByTime(10); // Advance timers to trigger onopen in apiService
      await connectPromise;
      expect(apiServiceInstance.isConnected()).toBe(true);
    });

    it('should send a message ("tool_invoke") and handle response', async () => {
      const toolName = 'test.tool';
      const input = { data: 'testData' };

      const responsePromise = apiServiceInstance.invokeTool(toolName, input);

      expect(wsInstance.send).toHaveBeenCalledTimes(1);
      const sentMessage = JSON.parse(wsInstance.sentMessages[0]);

      expect(sentMessage.type).toBe('tool_invoke');
      expect(sentMessage.messageId).toEqual(expect.any(String));
      expect(sentMessage.payload).toEqual({
        tool_name: toolName,
        input: input,
      });

      // Simulate server response via onmessage
      const mockResponsePayload = { success: true, data: 'response data' };
      const serverResponseMessage = {
        type: 'tool_result',
        messageId: sentMessage.messageId, // Use the same messageId
        payload: mockResponsePayload,
      };
      wsInstance._simulateMessage(JSON.stringify(serverResponseMessage));

      await expect(responsePromise).resolves.toEqual(mockResponsePayload);
    });

    it('should reject promise if server response ("tool_result") indicates failure', async () => {
      const toolName = 'test.tool.fail';
      const input = { data: 'testData' };

      const responsePromise = apiServiceInstance.invokeTool(toolName, input);
      const sentMessage = JSON.parse(wsInstance.sentMessages[0]);

      const mockResponsePayload = { success: false, message: 'Tool execution failed' };
      const serverResponseMessage = {
        type: 'tool_result',
        messageId: sentMessage.messageId,
        payload: mockResponsePayload,
      };
      wsInstance._simulateMessage(JSON.stringify(serverResponseMessage));

      await expect(responsePromise).rejects.toThrow('Tool execution failed');
    });

    it('should reject promise if server response ("tool_result") indicates failure with error field', async () => {
        const toolName = 'test.tool.fail.errorfield';
        const input = { data: 'testDataError' };

        const responsePromise = apiServiceInstance.invokeTool(toolName, input);
        const sentMessage = JSON.parse(wsInstance.sentMessages[0]);

        const mockResponsePayload = { success: false, error: 'Tool execution failed with error field' };
        const serverResponseMessage = {
          type: 'tool_result',
          messageId: sentMessage.messageId,
          payload: mockResponsePayload,
        };
        wsInstance._simulateMessage(JSON.stringify(serverResponseMessage));

        await expect(responsePromise).rejects.toThrow('Tool execution failed with error field');
      });

    it('should reject promise if server sends no payload message/error on failure for "tool_result"', async () => {
        const toolName = 'test.tool.fail.nopayloadmsg';
        const responsePromise = apiServiceInstance.invokeTool(toolName, {});
        const sentMessage = JSON.parse(wsInstance.sentMessages[0]);
        const serverResponseMessage = {
          type: 'tool_result',
          messageId: sentMessage.messageId,
          payload: { success: false } // No message or error field
        };
        wsInstance._simulateMessage(JSON.stringify(serverResponseMessage));
        await expect(responsePromise).rejects.toThrow('Tool invocation failed'); // Default error
      });

    it('should notify generic listeners for "kb_updated" events', () => {
      const listener = vi.fn();
      apiServiceInstance.addMessageListener(listener); // Listens via '*'

      const kbUpdatePayload = { data: 'kb was updated' };
      const serverMessage = { type: 'kb_updated', payload: kbUpdatePayload };
      wsInstance._simulateMessage(JSON.stringify(serverMessage));

      // Generic listener receives { type: eventType, payload: data }
      expect(listener).toHaveBeenCalledWith({ type: 'kb_updated', payload: kbUpdatePayload });
    });

    it('should notify specific listeners for "kb_updated" events', () => {
        const specificListener = vi.fn();
        apiServiceInstance.addEventListener('kb_updated', specificListener);

        const kbUpdatePayload = { data: 'specific kb update' };
        const serverMessage = { type: 'kb_updated', payload: kbUpdatePayload };
        wsInstance._simulateMessage(JSON.stringify(serverMessage));

        expect(specificListener).toHaveBeenCalledWith(kbUpdatePayload);
      });

    it('should remove message listener (generic via "*")', () => {
      const listener = vi.fn();
      apiServiceInstance.addMessageListener(listener);
      apiServiceInstance.removeMessageListener(listener); // Removes the '*' listener

      const serverMessage = { type: 'kb_updated', payload: { data: 'another update' } };
      wsInstance._simulateMessage(JSON.stringify(serverMessage));
      expect(listener).not.toHaveBeenCalled();
    });

    it('should remove specific event listener', () => {
        const specificListener = vi.fn();
        apiServiceInstance.addEventListener('kb_updated', specificListener);
        apiServiceInstance.removeEventListener('kb_updated', specificListener);

        const serverMessage = { type: 'kb_updated', payload: { data: 'specific update no listener' } };
        wsInstance._simulateMessage(JSON.stringify(serverMessage));
        expect(specificListener).not.toHaveBeenCalled();
      });

    it('should reject sendMessage if not connected', async () => {
      // Disconnect explicitly, then try to send.
      // First, ensure it was connected
      expect(apiServiceInstance.isConnected()).toBe(true);
      // Now, simulate a disconnect event from the server *after* initial connection
      wsInstance._simulateClose(1000, 'explicit close');
      vi.advanceTimersByTime(10); // Allow close to propagate
      expect(apiServiceInstance.isConnected()).toBe(false);

      await expect(apiServiceInstance.invokeTool('test.tool', {}))
        .rejects
        .toThrow('WebSocket is not connected.');
    });

     it('should handle MCP specific message structure for sendMessage', async () => {
      const actionName = 'mcp.action';
      const mcpPayload = { data: 'mcpData' };

      const responsePromise = apiServiceInstance.sendMessage('mcp', actionName, mcpPayload);

      expect(wsInstance.send).toHaveBeenCalledTimes(1);
      const sentMessage = JSON.parse(wsInstance.sentMessages[0]);

      expect(sentMessage.action).toBe(actionName); // MCP uses 'action' directly
      expect(sentMessage.messageId).toEqual(expect.any(String));
      expect(sentMessage.payload).toEqual(mcpPayload); // Payload is not nested under 'input' for mcp

      // Simulate server response (assuming it still comes as 'tool_result' or similar)
      const mockResponsePayload = { success: true, data: 'mcp response' };
      const serverResponseMessage = {
        type: 'tool_result',
        messageId: sentMessage.messageId,
        payload: mockResponsePayload,
      };
      wsInstance._simulateMessage(JSON.stringify(serverResponseMessage));

      await expect(responsePromise).resolves.toEqual(mockResponsePayload);
    });
  });

  describe('Reconnection and Event Handling', () => {
    it('should notify "connection_status" listeners on "close" event (e.g. server initiated) and attempt reconnect', async () => {
      const connectPromise = apiServiceInstance.connect(TEST_WS_URL);
      vi.advanceTimersByTime(0); // Allow apiService to set up its onopen handler
      wsInstance._simulateOpen(); // Simulate open
      vi.advanceTimersByTime(10); // Advance timers to trigger onopen in apiService
      await connectPromise;

      const statusListener = vi.fn();
      apiServiceInstance.addEventListener('connection_status', statusListener);

      statusListener.mockClear(); // Clear calls from initial connect

      // Simulate server closing the connection unexpectedly
      wsInstance._simulateClose(1006, 'abnormal closure');
      vi.advanceTimersByTime(10); // Allow close to propagate

      expect(apiServiceInstance.isConnected()).toBe(false);
      expect(statusListener).toHaveBeenCalledWith({ status: 'reconnecting', attempt: 1, maxAttempts: 10 });

      // Simulate successful reconnection after delay
      vi.advanceTimersByTime(3000); // Advance by RECONNECT_INTERVAL_MS
      // A new WebSocket instance will be created and its onopen will fire
      expect(global.WebSocket).toHaveBeenCalledTimes(2); // Original + 1 reconnect
      wsInstance = MockWebSocket.instance; // Get the new instance
      vi.advanceTimersByTime(10); // Simulate open for the new instance

      expect(apiServiceInstance.isConnected()).toBe(true);
      expect(statusListener).toHaveBeenCalledWith({ status: 'connected', url: TEST_WS_URL });
    });

    it('should notify "connection_status" listeners on "close" event (explicit client disconnect)', async () => {
        const connectPromise = apiServiceInstance.connect(TEST_WS_URL);
        vi.advanceTimersByTime(0); // Allow apiService to set up its onopen handler
        wsInstance._simulateOpen(); // Simulate open
        vi.advanceTimersByTime(10); // Advance timers to trigger onopen in apiService
        await connectPromise;

        const statusListener = vi.fn();
        apiServiceInstance.addEventListener('connection_status', statusListener);

        statusListener.mockClear();

        apiServiceInstance.disconnect(); // This calls ws.close()
        vi.advanceTimersByTime(10); // Simulate close

        expect(apiServiceInstance.isConnected()).toBe(false);
        expect(statusListener).toHaveBeenCalledWith({ status: 'disconnected_explicit', reason: 'Normal closure' });
      });

    it('should notify "connection_status" listeners on "error" event', async () => {
      const statusListener = vi.fn();
      apiServiceInstance.addEventListener('connection_status', statusListener);

      // Attempt to connect, it will create the mockWebSocket
      apiServiceInstance.connect(TEST_WS_URL);

      const error = new Error('Network issue');
      wsInstance._simulateError(error); // Simulate an error event
      wsInstance._simulateClose(1006, 'abnormal closure'); // Error typically leads to close
      vi.advanceTimersByTime(10); // Allow close to propagate

      // For an initial connect_error, the promise is rejected.
      // The status listener should be called for 'error' and then 'reconnecting'
      expect(statusListener).toHaveBeenCalledWith({ status: 'error', message: error.message, error: expect.any(Error) });
      expect(statusListener).toHaveBeenCalledWith({ status: 'reconnecting', attempt: 1, maxAttempts: 10 });
    });

    it('should reject pending messages when connection disconnects before response', async () => {
        const connectPromise = apiServiceInstance.connect(TEST_WS_URL);
        wsInstance._simulateOpen(); // Simulate open
        vi.advanceTimersByTime(10); // Advance timers to trigger onopen in apiService
        await connectPromise;
        expect(apiServiceInstance.isConnected()).toBe(true);

        const responsePromise = apiServiceInstance.invokeTool('test.tool', {});
        expect(apiServiceInstance.pendingMessages.size).toBe(1);

        // Simulate unexpected disconnect from server
        wsInstance._simulateClose(1006, 'abnormal closure');
        vi.advanceTimersByTime(10); // Allow close to propagate

        await expect(responsePromise).rejects.toThrow('WebSocket connection disconnected before response received.');
        expect(apiServiceInstance.pendingMessages.size).toBe(0);
      });

    it('should handle server emitting an "error" event', () => {
        apiServiceInstance.connect(TEST_WS_URL);
        wsInstance._simulateOpen(); // Simulate open
        vi.advanceTimersByTime(10); // Advance timers to trigger onopen in apiService

        const errorListener = vi.fn();
        apiServiceInstance.addEventListener('error', errorListener); // Generic error listener

        const serverErrorPayload = { code: 500, message: 'Server internal error' };
        const serverMessage = { type: 'error', payload: serverErrorPayload };
        wsInstance._simulateMessage(JSON.stringify(serverMessage));

        expect(errorListener).toHaveBeenCalledWith(serverErrorPayload);
    });

    it('should stop reconnecting after max attempts', async () => {
        apiServiceInstance.connect(TEST_WS_URL);
        wsInstance._simulateOpen(); // Simulate open
        vi.advanceTimersByTime(10); // Advance timers to trigger onopen in apiService

        const statusListener = vi.fn();
        apiServiceInstance.addEventListener('connection_status', statusListener);
        statusListener.mockClear();

        // Simulate multiple disconnects leading to max attempts
        for (let i = 1; i <= 10; i++) {
            // Simulate close on the current wsInstance
            wsInstance._simulateClose(1006, 'abnormal closure');
            vi.advanceTimersByTime(10); // Allow close to propagate

            if (i < 10) {
                expect(statusListener).toHaveBeenCalledWith({ status: 'reconnecting', attempt: i, maxAttempts: 10 });
                statusListener.mockClear(); // Clear for next iteration

                vi.advanceTimersByTime(3000); // Advance for next reconnect attempt
                // After vi.advanceTimersByTime(3000), apiService.connect() is called,
                // which creates a NEW MockWebSocket instance.
                // The global.WebSocket mock ensures wsInstance is updated.
                // So, wsInstance now refers to the new mock.
                wsInstance._simulateOpen(); // Simulate open for the new instance
                vi.advanceTimersByTime(10); // Advance timers for the new onopen
            }
        }

        // After max attempts, it should report failed_max_attempts
        expect(statusListener).toHaveBeenCalledWith({ status: 'failed_max_attempts', message: 'Max reconnect attempts reached.' });
        expect(apiServiceInstance.isConnected()).toBe(false);
        expect(global.WebSocket).toHaveBeenCalledTimes(11); // Original + 10 reconnect attempts
    });
  });
});
