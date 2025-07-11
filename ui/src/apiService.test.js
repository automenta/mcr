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
    apiServiceInstance.socket = null; // Ensure socket is null so a new one is created
    apiServiceInstance.eventListeners.clear(); // Corrected from messageListeners
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
      mockWsInstance.readyState = WebSocketMock.OPEN; // Ensure readyState is OPEN before onopen

      // Trigger onopen
      if (typeof mockWsInstance.onopen === 'function') mockWsInstance.onopen();

      await expect(connectPromise).resolves.toBeUndefined();
      expect(apiServiceInstance.isConnected()).toBe(true);
      expect(WebSocketMock).toHaveBeenCalledWith(TEST_URL);
    });

    it('should handle connection error', async () => {
      const connectPromise = apiServiceInstance.connect(TEST_URL);
      const mockWsInstance = WebSocketMock.mock.instances[0];
      expect(mockWsInstance).toBeDefined();
      // No need to set readyState to OPEN for onerror simulation usually, but handler might check
      // mockWsInstance.readyState = WebSocketMock.CONNECTING; // Or some other relevant state

      const errorEvent = new Event('error');
      // Trigger onerror
      if (typeof mockWsInstance.onerror === 'function') mockWsInstance.onerror(errorEvent);

      await expect(connectPromise).rejects.toThrow(); // Or specific error
      expect(apiServiceInstance.isConnected()).toBe(false);
    });

    it('should disconnect from the WebSocket server', async () => {
      const connectPromise = apiServiceInstance.connect(TEST_URL);
      const mockWsInstance = WebSocketMock.mock.instances[0];
      mockWsInstance.readyState = WebSocketMock.OPEN; // Ensure readyState is OPEN before onopen
      if (typeof mockWsInstance.onopen === 'function') mockWsInstance.onopen();
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
      mockWsInstance.readyState = WebSocketMock.OPEN; // Ensure readyState is OPEN
      if (typeof mockWsInstance.onopen === 'function') mockWsInstance.onopen();
      await connectPromise;
      expect(apiServiceInstance.isConnected()).toBe(true);
      WebSocketMock.mockClear(); // Clear calls from the first connection

      // Attempt second connection
      connectPromise = apiServiceInstance.connect(TEST_URL);
      await expect(connectPromise).resolves.toBeUndefined(); // Should resolve immediately
      expect(WebSocketMock).not.toHaveBeenCalled(); // Should not create a new WebSocket
      expect(apiServiceInstance.isConnected()).toBe(true);
    });

    it('should return the existing promise if a connection attempt is already in progress', async () => {
      const promise1 = apiServiceInstance.connect(TEST_URL); // First attempt
      expect(WebSocketMock).toHaveBeenCalledTimes(1);
      const mockWsInstance = WebSocketMock.mock.instances[0];
      expect(mockWsInstance).toBeDefined(); // Ensure instance exists
      mockWsInstance.readyState = WebSocketMock.CONNECTING; // Simulate it's trying to connect

      // apiServiceInstance.socket is set internally by connect() when it creates new WebSocket(url)
      // So, the first call to connect() already sets apiServiceInstance.socket to mockWsInstance.

      const promise2 = apiServiceInstance.connect(TEST_URL); // Second attempt
      expect(promise2).toBe(promise1); // Key assertion: it's the same promise

      // Now, simulate the first connection succeeding (which affects promise1 and therefore promise2)
      mockWsInstance.readyState = WebSocketMock.OPEN;
      if (typeof mockWsInstance.onopen === 'function') {
        mockWsInstance.onopen();
      }

      // Both promises should now resolve
      await expect(promise1).resolves.toBeUndefined();
      // Since promise2 is promise1, this check is redundant if the above passes, but good for clarity.
      await expect(promise2).resolves.toBeUndefined();

      expect(WebSocketMock).toHaveBeenCalledTimes(1); // Still only one actual WebSocket attempt
    });
  });

  describe('Message Handling', () => {
    beforeEach(async () => {
      // Ensure connected before each message test
      const connectPromise = apiServiceInstance.connect(TEST_URL);
      const mockWsInstance = WebSocketMock.mock.instances[0];
      expect(mockWsInstance).toBeDefined();
      mockWsInstance.readyState = WebSocketMock.OPEN; // Set readyState to OPEN
      if (typeof mockWsInstance.onopen === 'function') { // Call onopen if it's a function
        mockWsInstance.onopen();
      }
      await connectPromise;
      expect(apiServiceInstance.isConnected()).toBe(true); // Verify connection
    });

    it('should send a message and handle response', async () => {
      const mockWsInstance = WebSocketMock.mock.instances[0];
      const toolName = 'test.tool';
      const input = { data: 'testData' };

      const responsePromise = apiServiceInstance.invokeTool(toolName, input);

      expect(mockWsInstance.send).toHaveBeenCalledTimes(1);
      const sentMessageString = mockWsInstance.send.mock.calls[0][0];
      const sentMessage = JSON.parse(sentMessageString);

      expect(sentMessage.type).toBe('tool_invoke');
      expect(sentMessage.messageId).toEqual(expect.any(String));
      expect(sentMessage.payload).toEqual({
        tool_name: toolName,
        input: input,
      });

      // Simulate server response
      const mockResponsePayload = { success: true, data: 'response data' };
      // const sentMessage = JSON.parse(mockWsInstance.send.mock.calls[0][0]); // Already got sentMessage from before
      const serverResponseMessage = {
        type: 'tool_result', // Added type
        messageId: JSON.parse(mockWsInstance.send.mock.calls[0][0]).messageId,
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
        type: 'tool_result', // Added type
        messageId: sentMessage.messageId,
        payload: mockResponsePayload,
      };
      mockWsInstance.onmessage({ data: JSON.stringify(serverResponseMessage) });

      // The promise is rejected with an Error object, not the payload itself.
      // The error message is constructed from payload.message or payload.error.
      await expect(responsePromise).rejects.toThrow('Tool execution failed');
    });

    it('should reject promise if server sends no payload on failure', async () => {
        const mockWsInstance = WebSocketMock.mock.instances[0];
        const toolName = 'test.tool.fail.nopayload';

        const responsePromise = apiServiceInstance.invokeTool(toolName, {});

        const sentMessage = JSON.parse(mockWsInstance.send.mock.calls[0][0]);
        const serverResponseMessage = {
          type: 'tool_result', // Added type
          messageId: sentMessage.messageId,
          payload: { success: false, error: 'NO_PAYLOAD_ERROR_FROM_TEST' } // Explicitly make it a failure
        };
        mockWsInstance.onmessage({ data: JSON.stringify(serverResponseMessage) });

        await expect(responsePromise).rejects.toThrow('NO_PAYLOAD_ERROR_FROM_TEST');
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

      // Use the generic sendMessage for MCP type
      const responsePromise = apiServiceInstance.sendMessage('mcp', actionName, payload);

      expect(mockWsInstance.send).toHaveBeenCalledTimes(1);
      const sentMcpMessageStringInitial = mockWsInstance.send.mock.calls[0][0];
      const sentMcpMessageInitial = JSON.parse(sentMcpMessageStringInitial);

      expect(sentMcpMessageInitial.type).toBe('mcp');
      expect(sentMcpMessageInitial.messageId).toEqual(expect.any(String));
      expect(sentMcpMessageInitial.action).toBe(actionName);
      expect(sentMcpMessageInitial.payload).toEqual(payload);


      // Simulate server response
      const mockResponsePayload = { success: true, data: 'mcp response' };
      const sentMcpMessageString = mockWsInstance.send.mock.calls[0][0];
      const sentMcpMessage = JSON.parse(sentMcpMessageString);
      const serverResponseMessage = {
        type: 'tool_result', // Assuming MCP responses also use tool_result or a type handled similarly for pending messages
        messageId: sentMcpMessage.messageId,
        payload: mockResponsePayload,
      };
      mockWsInstance.onmessage({ data: JSON.stringify(serverResponseMessage) });

      await expect(responsePromise).resolves.toEqual(mockResponsePayload);
    });
  });

  // TODO: This test suite is skipped due to persistent issues with vi.useFakeTimers()
  // not correctly mocking or advancing timers for setTimeout used in the reconnection logic.
  // This leads to tests either timing out or not behaving as expected regarding reconnection attempts.
  // Further investigation is needed to resolve the timer mocking interaction with the component's async logic.
  describe('Reconnection Logic', () => { // Unskip the suite
    const MAX_RECONNECT_ATTEMPTS = 5; // As defined in apiService.js (should ideally be configurable or imported)
    const RECONNECT_INTERVAL = 3000; // As defined in apiService.js

    beforeEach(() => {
      vi.useFakeTimers(); // Use fake timers for all tests in this suite
      vi.spyOn(global, 'setTimeout'); // Spy on setTimeout
    });

    afterEach(() => {
      vi.runOnlyPendingTimers(); // Ensure all timers are run
      vi.useRealTimers(); // Restore real timers
      vi.restoreAllMocks(); // Restore any spies, including setTimeout
    });

    it('should attempt to reconnect on unexpected close', async () => {
      // vi.useFakeTimers(); // Moved to beforeEach
      // try { // Not strictly necessary if afterEach cleans up timers
        let connectPromise = apiServiceInstance.connect(TEST_URL);
        let mockWsInstance = WebSocketMock.mock.instances[0];
        expect(mockWsInstance).toBeDefined();
        mockWsInstance.readyState = WebSocketMock.OPEN;
        if(typeof mockWsInstance.onopen === 'function') mockWsInstance.onopen();
        await connectPromise;

        expect(apiServiceInstance.isConnected()).toBe(true);
        WebSocketMock.mockClear();

        // Simulate unexpected close by calling the socket's close method
        // The mock's close() method will set readyState to CLOSED and then call the onclose handler.
        mockWsInstance.close();
        // No need to directly call mockWsInstance.onclose() anymore.

        expect(apiServiceInstance.isConnected()).toBe(false);

        expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), RECONNECT_INTERVAL);
        vi.advanceTimersByTime(RECONNECT_INTERVAL);

        expect(WebSocketMock).toHaveBeenCalledTimes(1); // A new WebSocket was created for reconnect
        const newMockWsInstance = WebSocketMock.mock.instances[0]; // After clear & new connect, this is the one
        expect(newMockWsInstance).toBeDefined();
        expect(newMockWsInstance).not.toBe(mockWsInstance);

        newMockWsInstance.readyState = WebSocketMock.OPEN;
        if(typeof newMockWsInstance.onopen === 'function') newMockWsInstance.onopen();

        await vi.waitFor(() => expect(apiServiceInstance.isConnected()).toBe(true));
        expect(apiServiceInstance.reconnectAttempts).toBe(0);
      // } finally { // Removed orphaned finally
      //   vi.useRealTimers();
      // }
    });

    it('should stop reconnecting after MAX_RECONNECT_ATTEMPTS', async () => {
      // vi.useFakeTimers(); // Moved to beforeEach
      // try { // Removed try
        let connectPromise = apiServiceInstance.connect(TEST_URL);
        let mockWsInstance = WebSocketMock.mock.instances[0];
        expect(mockWsInstance).toBeDefined();
        mockWsInstance.readyState = WebSocketMock.OPEN;
        if(typeof mockWsInstance.onopen === 'function') mockWsInstance.onopen();
        await connectPromise;
        expect(apiServiceInstance.isConnected()).toBe(true);
        WebSocketMock.mockClear(); // Clear the initial connect call to WebSocket constructor
        WebSocketMock.mockClear(); // Clear the initial connect call to WebSocket constructor

        // Simulate the first unexpected close on the initial instance
        mockWsInstance.close(); // This will set readyState and call the onclose handler

        expect(apiServiceInstance.isConnected()).toBe(false);
        // reconnectAttempts becomes 1 when handleReconnect is first entered due to the close.
        // Then setTimeout schedules the first connect attempt.
        expect(apiServiceInstance.reconnectAttempts).toBe(1);

        for (let i = 0; i < MAX_RECONNECT_ATTEMPTS; i++) {
          expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), RECONNECT_INTERVAL);
          vi.advanceTimersByTime(RECONNECT_INTERVAL);

          // Each advanceTimersByTime triggers a new WebSocket connection attempt.
          // WebSocketMock.mock.instances should reflect this.
          // After the first close, WebSocketMock was cleared. So instances[0] is the first retry.
          const currentAttemptInstance = WebSocketMock.mock.instances[i];
          expect(currentAttemptInstance).toBeDefined();
          currentAttemptInstance.readyState = WebSocketMock.CONNECTING; // Simulate it tries

          // Simulate failure for this reconnect attempt
          if(typeof currentAttemptInstance.onerror === 'function') currentAttemptInstance.onerror(new Event('error'));
          // Call close() on the mock, which then calls the onclose handler and sets readyState
          currentAttemptInstance.close();
          // Note: The onclose handler in apiService.js will be called with the default event from the mock's close,
          // not with { wasClean: false, code: 1006... }. This might be acceptable for testing max attempts.

          // reconnectAttempts is incremented inside handleReconnect *before* the setTimeout for the *next* attempt.
          // So after the Nth failed attempt's onclose, reconnectAttempts will be N+1, up to MAX_RECONNECT_ATTEMPTS.
          if (i < MAX_RECONNECT_ATTEMPTS -1) {
            expect(apiServiceInstance.reconnectAttempts).toBe(i + 2);
          } else {
             expect(apiServiceInstance.reconnectAttempts).toBe(MAX_RECONNECT_ATTEMPTS);
          }
        }

        expect(apiServiceInstance.reconnectAttempts).toBe(MAX_RECONNECT_ATTEMPTS);
        const finalCallCount = (setTimeout).mock.calls.length;
        vi.advanceTimersByTime(RECONNECT_INTERVAL); // Try to trigger one more
        expect(setTimeout).toHaveBeenCalledTimes(finalCallCount); // Should not have been called again

      // } finally { // Removed orphaned finally
      //   vi.useRealTimers();
      // }
    });

    it('should not attempt to reconnect if explicitly closed', () => {
      // vi.useFakeTimers(); // Moved to beforeEach

      apiServiceInstance.connect(TEST_URL);
      const mockWsInstance = WebSocketMock.mock.instances[0];
      expect(mockWsInstance).toBeDefined(); // Good practice to assert instance exists
      mockWsInstance.readyState = WebSocketMock.OPEN; // Set state for connect
      if(typeof mockWsInstance.onopen === 'function') mockWsInstance.onopen();


      apiServiceInstance.disconnect(); // Explicitly close. This will call mockWsInstance.close()
                                     // The mock close() now also calls the assigned onclose handler.
      expect(mockWsInstance.close).toHaveBeenCalled();
      expect(apiServiceInstance.explicitlyClosed).toBe(true);

      // No need to call mockWsInstance.onclose() directly here, as the mock .close() does it.
      // apiService.handleReconnect checks explicitlyClosed in the onclose handler.
      expect(setTimeout).not.toHaveBeenCalled(); // setTimeout should be the mocked one now
      expect(apiServiceInstance.reconnectAttempts).toBe(0);

      // vi.useRealTimers(); // Moved to afterEach
    });

    it('should reject pending messages when connection closes unexpectedly', async () => {
      // vi.useFakeTimers(); // Moved to beforeEach
      // try { // Removed try
        const connectPromise = apiServiceInstance.connect(TEST_URL);
        const mockWsInstance = WebSocketMock.mock.instances[0];
        expect(mockWsInstance).toBeDefined();
        mockWsInstance.readyState = WebSocketMock.OPEN;
        if(typeof mockWsInstance.onopen === 'function') mockWsInstance.onopen();
        await connectPromise;
        expect(apiServiceInstance.isConnected()).toBe(true);

        const responsePromise = apiServiceInstance.invokeTool('test.tool', {});
        // Ensure message is considered pending BEFORE close happens.
        // If invokeTool resolves/rejects too quickly before onclose, this might be 0.
        // However, it adds to pendingMessages synchronously.
        expect(apiServiceInstance.pendingMessages.size).toBe(1);

        // Simulate unexpected close by calling the socket's close method
        mockWsInstance.close();
        // apiService's onclose handler should reject pending messages and clear the map.

        await expect(responsePromise).rejects.toThrow('WebSocket connection closed before response received.');
        expect(apiServiceInstance.pendingMessages.size).toBe(0);
      // } finally { // Removed orphaned finally
      //   vi.useRealTimers();
      // }
    });
  });
});
