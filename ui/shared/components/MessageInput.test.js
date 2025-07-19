import { describe, it, expect, vi } from 'vitest';
import { MessageInput } from './MessageInput';

describe('MessageInput', () => {
  it('should dispatch a send event on button click', () => {
    document.body.innerHTML = '<message-input></message-input>';
    const component = document.querySelector('message-input');
    const spy = vi.fn();
    component.addEventListener('send', spy);
    component.shadowRoot.querySelector('button').click();
    expect(spy).toHaveBeenCalled();
  });

  it('should dispatch a send event on enter key', () => {
    document.body.innerHTML = '<message-input></message-input>';
    const component = document.querySelector('message-input');
    const spy = vi.fn();
    component.addEventListener('send', spy);
    component.shadowRoot.querySelector('input').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(spy).toHaveBeenCalled();
  });
});
