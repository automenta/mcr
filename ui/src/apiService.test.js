// ui/src/apiService.test.js
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import apiServiceInstance from './apiService'; // Testing the singleton instance

const TEST_URL = 'ws://localhost:1234/test';

describe('ApiService', () => {
  let WebSocketMock;

  beforeEach(() => {
    // Reset the singleton's state if necessary, or create new instance if not a true singleton.
    // For this service, we might need to manually reset some of its internal state for clean tests.
    apiServiceInstance.disconnect(); // Ensure it's disconnected before each test
    apiServiceInstance.messageListeners.clear();
    apiServiceInstance.pendingMessages.clear();
    apiServiceInstance.reconnectAttempts = 0;
    apiServiceInstance.explicitlyClosed = false;
    apiServiceInstance.serverUrl = null;

    // Get the mock constructor from global (setupTests.js)
    WebSocketMock = global.WebSocket;
    // Clear mock call history before each test
    WebSocketMock.mockClear();
    // Reset the instances array for a cleaner state for instance-based assertions
    WebSocketMock.mock.instances.length = 0;

    // Instead of trying to clear instance mocks here,
    // we rely on getting the fresh instance in each test after `connect()` is called.
    // The global mock's functions (like send, close) are new vi.fn() for each new WebSocket instance
    // as defined in setupTests.js, so they are inherently "cleared" for new instances.
  });

  afterEach(() => {
    vi.useRealTimers(); // Clean up timers if any were mocked
  });

  describe('Connection and Disconnection', () => {
    it('should connect to the WebSocket server', async () => {
      const connectPromise = apiServiceInstance.connect(TEST_URL);

      // Simulate successful WebSocket connection
      // The mock instance is created when `new WebSocket()` is called in connect()
      const mockWsInstance = WebSocketMock.mock.instances[0];
      expect(mockWsInstance).toBeDefined();

      // Trigger onopen
      mockWsInstance.onopen();

      await expect(connectPromise).resolves.toBeUndefined();
      expect(apiServiceInstance.isConnected()).toBe(true);
      expect(WebSocketMock).toHaveBeenCalledWith(TEST_URL);
    });

    it('should handle connection error', async () => {
      const connectPromise = apiServiceInstance.connect(TEST_URL);
      const mockWsInstance = WebSocketMock.mock.instances[0];
      expect(mockWsInstance).toBeDefined();

      const errorEvent = new Event('error');
      // Trigger onerror
      mockWsInstance.onerror(errorEvent);

      await expect(connectPromise).rejects.toThrow(); // Or specific error
      expect(apiServiceInstance.isConnected()).toBe(false);
    });

    it('should disconnect from the WebSocket server', async () => {
      const connectPromise = apiServiceInstance.connect(TEST_URL);
      const mockWsInstance = WebSocketMock.mock.instances[0];
      mockWsInstance.onopen();
      await connectPromise; // Ensure connection is established

      apiServiceInstance.disconnect();
      expect(mockWsInstance.close).toHaveBeenCalled();
      expect(apiServiceInstance.isConnected()).toBe(false);
      expect(apiServiceInstance.explicitlyClosed).toBe(true);
    });

    it('should not connect if already connected', async () => {
      // First connection
      let connectPromise = apiServiceInstance.connect(TEST_URL);
      let mockWsInstance = WebSocketMock.mock.instances[0];
      mockWsInstance.onopen();
      await connectPromise;
      expect(apiServiceInstance.isConnected()).toBe(true);
      WebSocketMock.mockClear(); // Clear calls from the first connection

      // Attempt second connection
      connectPromise = apiServiceInstance.connect(TEST_URL);
      await expect(connectPromise).resolves.toBeUndefined(); // Should resolve immediately
      expect(WebSocketMock).not.toHaveBeenCalled(); // Should not create a new WebSocket
      expect(apiServiceInstance.isConnected()).toBe(true);
    });

    it('should reject if connection attempt is already in progress', async () => {
        apiServiceInstance.connect(TEST_URL); // First attempt, don't await, don't trigger onopen
        expect(WebSocketMock).toHaveBeenCalledTimes(1);
        const mockWsInstance = WebSocketMock.mock.instances[0];
        mockWsInstance.readyState = WebSocket.CONNECTING; // Simulate it's trying to connect

        // Manually set the internal socket to the mock instance to simulate connection in progress
        apiServiceInstance.socket = mockWsInstance;


        await expect(apiServiceInstance.connect(TEST_URL)).rejects.toThrow('Connection attempt already in progress.');
        expect(WebSocketMock).toHaveBeenCalledTimes(1); // Still only one actual WebSocket attempt
    });
  });

  describe('Message Handling', () => {
    beforeEach(async () => {
      // Ensure connected before each message test
      const connectPromise = apiServiceInstance.connect(TEST_URL);
      const mockWsInstance = WebSocketMock.mock.instances[0];
      mockWsInstance.onopen();
      await connectPromise;
    });

    it('should send a message and handle response', async () => {
      const mockWsInstance = WebSocketMock.mock.instances[0];
      const toolName = 'test.tool';
      const input = { data: 'testData' };
      const expectedMessageId = expect.stringMatching(/^msg-\d{13}-\w{7}$/);

      const responsePromise = apiServiceInstance.invokeTool(toolName, input);

      expect(mockWsInstance.send).toHaveBeenCalledWith(JSON.stringify({
        type: 'tool_invoke',
        messageId: expectedMessageId,
        payload: {
          tool_name: toolName,
          input: input,
        },
      }));

      // Simulate server response
      const mockResponsePayload = { success: true, data: 'response data' };
      const sentMessage = JSON.parse(mockWsInstance.send.mock.calls[0][0]);
      const serverResponseMessage = {
        messageId: sentMessage.messageId,
        payload: mockResponsePayload,
      };
      mockWsInstance.onmessage({ data: JSON.stringify(serverResponseMessage) });

      await expect(responsePromise).resolves.toEqual(mockResponsePayload);
    });

    it('should reject promise if server response indicates failure', async () => {
      const mockWsInstance = WebSocketMock.mock.instances[0];
      const toolName = 'test.tool.fail';
      const input = { data: 'testData' };

      const responsePromise = apiServiceInstance.invokeTool(toolName, input);

      const mockResponsePayload = { success: false, message: 'Tool execution failed' };
      const sentMessage = JSON.parse(mockWsInstance.send.mock.calls[0][0]);
      const serverResponseMessage = {
        messageId: sentMessage.messageId,
        payload: mockResponsePayload,
      };
      mockWsInstance.onmessage({ data: JSON.stringify(serverResponseMessage) });

      await expect(responsePromise).rejects.toEqual(mockResponsePayload);
    });

    it('should reject promise if server sends no payload on failure', async () => {
        const mockWsInstance = WebSocketMock.mock.instances[0];
        const toolName = 'test.tool.fail.nopayload';

        const responsePromise = apiServiceInstance.invokeTool(toolName, {});

        const sentMessage = JSON.parse(mockWsInstance.send.mock.calls[0][0]);
        const serverResponseMessage = {
          messageId: sentMessage.messageId,
          // No payload, implies success:false from onmessage handler
        };
        mockWsInstance.onmessage({ data: JSON.stringify(serverResponseMessage) });

        await expect(responsePromise).rejects.toThrow('Request failed with no payload');
      });

    it('should notify listeners on incoming messages not matching a pending request', () => {
      const mockWsInstance = WebSocketMock.mock.instances[0];
      const listener = vi.fn();
      apiServiceInstance.addMessageListener(listener);

      const serverPushMessage = { type: 'server_event', data: 'something happened' };
      mockWsInstance.onmessage({ data: JSON.stringify(serverPushMessage) });

      expect(listener).toHaveBeenCalledWith(serverPushMessage);
    });

    it('should remove message listener', () => {
      const mockWsInstance = WebSocketMock.mock.instances[0];
      const listener = vi.fn();
      apiServiceInstance.addMessageListener(listener);
      apiServiceInstance.removeMessageListener(listener);

      const serverPushMessage = { type: 'server_event', data: 'something happened' };
      mockWsInstance.onmessage({ data: JSON.stringify(serverPushMessage) });

      expect(listener).not.toHaveBeenCalled();
    });

    it('should reject sendMessage if not connected', async () => {
      apiServiceInstance.disconnect(); // Ensure disconnected
      const mockWsInstance = WebSocketMock.mock.instances[0];
      if (mockWsInstance) mockWsInstance.readyState = WebSocket.CLOSED;


      await expect(apiServiceInstance.invokeTool('test.tool', {}))
        .rejects
        .toThrow('WebSocket is not connected.');
    });
     it('should handle MCP specific message structure for sendMessage', async () => {
      const mockWsInstance = WebSocketMock.mock.instances[0];
      const actionName = 'mcp.action';
      const payload = { data: 'mcpData' };
      const expectedMessageId = expect.stringMatching(/^msg-\d{13}-\w{7}$/);

      // Use the generic sendMessage for MCP type
      const responsePromise = apiServiceInstance.sendMessage('mcp', actionName, payload);

      expect(mockWsInstance.send).toHaveBeenCalledWith(JSON.stringify({
        type: 'mcp',
        messageId: expectedMessageId,
        action: actionName, // MCP specific
        payload: payload,   // MCP specific
      }));

      // Simulate server response
      const mockResponsePayload = { success: true, data: 'mcp response' };
      const sentMessage = JSON.parse(mockWsInstance.send.mock.calls[0][0]);
      const serverResponseMessage = {
        messageId: sentMessage.messageId,
        payload: mockResponsePayload,
      };
      mockWsInstance.onmessage({ data: JSON.stringify(serverResponseMessage) });

      await expect(responsePromise).resolves.toEqual(mockResponsePayload);
    });
  });

  describe('Reconnection Logic', () => {
    const MAX_RECONNECT_ATTEMPTS = 5; // As defined in apiService.js (should ideally be configurable or imported)
    const RECONNECT_INTERVAL = 3000; // As defined in apiService.js

    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.runOnlyPendingTimers();
      vi.useRealTimers();
    });

    it('should attempt to reconnect on unexpected close', async () => {
      let connectPromise = apiServiceInstance.connect(TEST_URL);
      let mockWsInstance = WebSocketMock.mock.instances[0];
      mockWsInstance.onopen(); // Initial connection success
      await connectPromise;

      expect(apiServiceInstance.isConnected()).toBe(true);
      WebSocketMock.mockClear(); // Clear initial connect call

      // Simulate unexpected close
      mockWsInstance.onclose({ wasClean: false, code: 1006, reason: 'Server down' });
      expect(apiServiceInstance.isConnected()).toBe(false);

      // Should schedule a reconnect
      expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), RECONNECT_INTERVAL);

      // Fast-forward time to trigger reconnect attempt
      vi.advanceTimersByTime(RECONNECT_INTERVAL);

      // New WebSocket instance should be created for reconnect
      expect(WebSocketMock).toHaveBeenCalledTimes(1);
      const newMockWsInstance = WebSocketMock.mock.instances[0]; // This will be the new instance
      expect(newMockWsInstance).toBeDefined();
      expect(newMockWsInstance).not.toBe(mockWsInstance); // Ensure it's a new instance

      // Simulate successful reconnection
      newMockWsInstance.onopen();

      // Wait for the connect promise inside handleReconnect to resolve (microtask)
      await vi.waitFor(() => expect(apiServiceInstance.isConnected()).toBe(true));
      expect(apiServiceInstance.reconnectAttempts).toBe(0); // Resets on success
    });

    it('should stop reconnecting after MAX_RECONNECT_ATTEMPTS', async () => {
      let connectPromise = apiServiceInstance.connect(TEST_URL);
      let mockWsInstance = WebSocketMock.mock.instances[0];
      mockWsInstance.onopen(); // Initial connection success
      await connectPromise;
      expect(apiServiceInstance.isConnected()).toBe(true);

      // Simulate the first unexpected close on the initial instance
      mockWsInstance.onclose({ wasClean: false, code: 1006, reason: 'Connection lost' });
      expect(apiServiceInstance.isConnected()).toBe(false);
      expect(apiServiceInstance.reconnectAttempts).toBe(1); // First attempt initiated

      // Loop for subsequent MAX_RECONNECT_ATTEMPTS failures.
      // The first reconnect attempt is already triggered by the onclose above.
      // WebSocketMock.mock.instances[0] is mockWsInstance (initial)
      // WebSocketMock.mock.instances[1] will be the first reconnect attempt's instance
      for (let i = 0; i < MAX_RECONNECT_ATTEMPTS; i++) {
        // Check that setTimeout was called for the current attempt (or the first one if i=0)
        expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), RECONNECT_INTERVAL);
        vi.advanceTimersByTime(RECONNECT_INTERVAL); // Trigger the connect() call within handleReconnect

        // After advancing timer, a new WebSocket connection attempt should have been made.
        // Total instances: 1 (initial) + (i+1) (reconnect attempts so far)
        expect(WebSocketMock.mock.instances.length).toBe(1 + (i + 1));
        const currentAttemptInstance = WebSocketMock.mock.instances[i + 1]; // Get the instance for the current reconnect attempt
        expect(currentAttemptInstance).toBeDefined();

        // Simulate failure for this reconnect attempt
        currentAttemptInstance.onerror(new Event('error'));
        currentAttemptInstance.onclose({ wasClean: false, code: 1006, reason: `Retry ${i + 1} failed` });

        if (i < MAX_RECONNECT_ATTEMPTS - 1) { // If not the last attempt
          expect(apiServiceInstance.reconnectAttempts).toBe(i + 2); // Incremented for the next attempt
        } else { // Last attempt
          expect(apiServiceInstance.reconnectAttempts).toBe(MAX_RECONNECT_ATTEMPTS); // Maxed out
        }
      }

      // After MAX_RECONNECT_ATTEMPTS, it should log an error and not try again
      expect(apiServiceInstance.reconnectAttempts).toBe(MAX_RECONNECT_ATTEMPTS);

      // Clear previous setTimeout mocks and any pending timers
      vi.clearAllTimers();

      // Try to advance time again, no new setTimeout should have been scheduled
      vi.advanceTimersByTime(RECONNECT_INTERVAL);
      expect(setTimeout).not.toHaveBeenCalled();
      // Total WebSocket instances: 1 (initial) + MAX_RECONNECT_ATTEMPTS (failed attempts)
      expect(WebSocketMock.mock.instances.length).toBe(1 + MAX_RECONNECT_ATTEMPTS);
      // Check for the "Max reconnect attempts reached" log (requires spying on console.error)
      // This will be covered when refactoring error feedback.
    });

    it('should not attempt to reconnect if explicitly closed', () => {
      // const connectPromise = apiServiceInstance.connect(TEST_URL); // connectPromise was unused
      apiServiceInstance.connect(TEST_URL);
      const mockWsInstance = WebSocketMock.mock.instances[0];
      mockWsInstance.onopen();

      apiServiceInstance.disconnect(); // Explicitly close
      expect(mockWsInstance.close).toHaveBeenCalled();
      expect(apiServiceInstance.explicitlyClosed).toBe(true);

      // Simulate the close event that follows an explicit closure
      mockWsInstance.onclose({ wasClean: true, code: 1000, reason: 'Client closed' });

      expect(setTimeout).not.toHaveBeenCalled();
      expect(apiServiceInstance.reconnectAttempts).toBe(0);
    });

    it('should reject pending messages when connection closes unexpectedly', async () => {
        const connectPromise = apiServiceInstance.connect(TEST_URL);
        const mockWsInstance = WebSocketMock.mock.instances[0];
        mockWsInstance.onopen();
        await connectPromise;

        const responsePromise = apiServiceInstance.invokeTool('test.tool', {});
        expect(apiServiceInstance.pendingMessages.size).toBe(1);

        // Simulate unexpected close
        mockWsInstance.onclose({ wasClean: false, code: 1006, reason: 'Server down' });

        await expect(responsePromise).rejects.toThrow('WebSocket connection closed before response received.');
        expect(apiServiceInstance.pendingMessages.size).toBe(0);
    });
  });
});
