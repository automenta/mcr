import { describe, it, expect, vi } from 'vitest';
import { Repl } from './Repl';
import { MessageDisplay } from './MessageDisplay';
import { MessageInput } from './MessageInput';

vi.mock('../services/McrConnection.js', () => ({
  McrConnection: class {
    constructor() {
      this.connectionPromise = Promise.resolve();
    }
    invoke = vi.fn();
    subscribe = vi.fn();
    unsubscribe = vi.fn();
  },
}));

describe('Repl', () => {
  it('should render the component', () => {
    document.body.innerHTML = '<repl-repl></repl-repl>';
    const component = document.querySelector('repl-repl');
    const shadowRoot = component.shadowRoot;
    const messageDisplay = shadowRoot.querySelector('message-display');
    const messageInput = shadowRoot.querySelector('message-input');
    expect(messageDisplay).toBeDefined();
    expect(messageInput).toBeDefined();
  });
});
