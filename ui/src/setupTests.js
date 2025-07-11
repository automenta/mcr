// ui/src/setupTests.js
import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock WebSocket globally for all tests
const WebSocketMock = vi.fn(function() {
  this.addEventListener = vi.fn();
  this.removeEventListener = vi.fn();
  this.send = vi.fn();
  this.close = vi.fn(function() { // Mock close to update readyState and call onclose
    this.readyState = WebSocketMock.CLOSED;
    if (typeof this.onclose === 'function') {
      // Simulate a clean closure event object, ensuring 'target' is present
      const event = {
        wasClean: true,
        code: 1000,
        reason: 'Normal closure',
        type: 'close',
        target: this // Add the WebSocket instance as the target
      };
      this.onclose(event);
    }
  });
  this.onopen = null;
  this.onmessage = null;
  this.onerror = null;
  this.onclose = null;
  // Default readyState, tests can override this on the instance:
  // e.g. mockWsInstance.readyState = WebSocketMock.OPEN;
  this.readyState = WebSocketMock.CONNECTING;
  return this;
});

// Assign static constants to the mock constructor
WebSocketMock.CONNECTING = 0;
WebSocketMock.OPEN = 1;
WebSocketMock.CLOSING = 2;
WebSocketMock.CLOSED = 3;

global.WebSocket = WebSocketMock;

// You can add other global mocks or setup here if needed
// For example, mocking localStorage or other browser APIs:
// global.localStorage = {
//   getItem: vi.fn(),
//   setItem: vi.fn(),
//   removeItem: vi.fn(),
//   clear: vi.fn(),
// };

// Clean up after each test
// import { cleanup } from '@testing-library/react';
// afterEach(() => {
//   cleanup(); // This is often done automatically by testing libraries, but explicit can be good.
// });
