import { describe, it, expect } from 'vitest';
import { MessageDisplay } from './MessageDisplay';

describe('MessageDisplay', () => {
	it('should render a message', () => {
		document.body.innerHTML = '<message-display></message-display>';
		const component = document.querySelector('message-display');
		component.addMessage('User', 'Test message');
		const shadowRoot = component.shadowRoot;
		const message = shadowRoot.querySelector('.message');
		expect(message.textContent).toContain('User: Test message');
	});
});
