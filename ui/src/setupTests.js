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

// Mock socket.io-client
// Store the mock socket instance so tests can access it.
let currentMockSocketInstance = null;

// This is the actual implementation that creates and returns a mock socket.
const actualMockIoImplementation = (url, options) => {
  const newMockSocket = {
    url,
    options,
    connected: false,
    disconnected: true,
    listeners: new Map(),
    on: vi.fn((event, callback) => {
      if (!newMockSocket.listeners.has(event)) {
        newMockSocket.listeners.set(event, new Set());
      }
      newMockSocket.listeners.get(event).add(callback);
    }),
    off: vi.fn((event, callback) => {
      if (newMockSocket.listeners.has(event)) {
        newMockSocket.listeners.get(event).delete(callback);
      }
    }),
    emit: vi.fn(),
    connect: vi.fn(() => {
      newMockSocket.connected = true;
      newMockSocket.disconnected = false;
      const connectListeners = newMockSocket.listeners.get('connect');
      if (connectListeners) {
        connectListeners.forEach(cb => cb());
      }
      return newMockSocket;
    }),
    disconnect: vi.fn(() => { // This is called by apiService.disconnect()
      // const oldConnectedState = newMockSocket.connected; // Not strictly needed if we always fire event
      newMockSocket.connected = false;
      newMockSocket.disconnected = true;
      // Simulate the 'disconnect' event being emitted by the socket itself
      // The apiService listens for this.
      const disconnectListeners = newMockSocket.listeners.get('disconnect');
      if (disconnectListeners) {
          // socket.io provides a reason for disconnect. 'io client disconnect' is when client calls .disconnect()
          // This reason is then checked by apiService to determine if it was an explicit client disconnect or other.
          disconnectListeners.forEach(cb => cb('io client disconnect'));
      }
    }),
    _simulateServerEvent: (event, ...args) => {
      // When tests simulate server events, update mock's state accordingly for consistency
      if (event === 'connect') {
        newMockSocket.connected = true;
        newMockSocket.disconnected = false;
      } else if (event === 'disconnect') { // This would be for server-initiated disconnects
        newMockSocket.connected = false;
        newMockSocket.disconnected = true;
      }
      // Now, actually emit the event to listeners
      const eventListeners = newMockSocket.listeners.get(event);
      if (eventListeners) {
        eventListeners.forEach(cb => cb(...args));
      }
    },
    _simulateConnectError: (error) => {
      // If a connection error occurs, the socket is not connected.
      newMockSocket.connected = false;
      newMockSocket.disconnected = true;
      const errorListeners = newMockSocket.listeners.get('connect_error');
      if (errorListeners) {
        errorListeners.forEach(cb => cb(error));
      }
    },
    _clearMock: () => {
      newMockSocket.connected = false;
      newMockSocket.disconnected = true;
      newMockSocket.listeners.clear();
      ['on', 'off', 'emit', 'connect', 'disconnect'].forEach(method => {
        if (newMockSocket[method].mockClear) {
          newMockSocket[method].mockClear();
        }
      });
    }
  };
  currentMockSocketInstance = newMockSocket;
  return newMockSocket;
};

// Create a Vitest mock function that will wrap the actual implementation.
// This is what will be imported as `io` from 'socket.io-client'.
const mockedIoFunction = vi.fn(actualMockIoImplementation);

// Attach helper methods directly to the mocked `io` function.
mockedIoFunction.getMockSocketInstance = () => currentMockSocketInstance;
mockedIoFunction.clearMockSocketInstance = () => {
  if (currentMockSocketInstance) {
    currentMockSocketInstance._clearMock(); // Call the instance's clear method
  }
  currentMockSocketInstance = null;
};

// Perform the mock.
vi.mock('socket.io-client', () => ({
  io: mockedIoFunction, // Export the Vitest mock function which now has helper methods attached.
}));
