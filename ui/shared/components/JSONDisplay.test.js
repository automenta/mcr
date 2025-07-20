import { describe, it, expect } from 'vitest';
import { JSONDisplay } from './JSONDisplay';

describe('JSONDisplay', () => {
	it('should render the title and data', () => {
		document.body.innerHTML =
			'<json-display title="Test Title"></json-display>';
		const component = document.querySelector('json-display');
		component.update({ foo: 'bar' });
		const shadowRoot = component.shadowRoot;
		const title = shadowRoot.querySelector('h3');
		const content = shadowRoot.querySelector('div');
		expect(title.textContent).toBe('Test Title');
		expect(content.textContent).toContain('foo');
		expect(content.textContent).toContain('bar');
	});
});
