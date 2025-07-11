// ui/src/setupTests.js
import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock WebSocket globally for all tests
global.WebSocket = vi.fn(() => ({
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  send: vi.fn(),
  close: vi.fn(),
  onopen: vi.fn(),
  onmessage: vi.fn(),
  onerror: vi.fn(),
  onclose: vi.fn(),
  readyState: WebSocket.OPEN, // Default to open, tests can override
}));

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
