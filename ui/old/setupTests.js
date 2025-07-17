import { expect, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import * as matchers from '@testing-library/jest-dom/matchers';
import { vi } from 'vitest';

// extends Vitest's expect method with methods from react-testing-library
expect.extend(matchers);

// runs a cleanup after each test case (e.g. clearing jsdom)
afterEach(() => {
	cleanup();
});

const MockResizeObserver = vi.fn(() => ({
	observe: vi.fn(),
	unobserve: vi.fn(),
	disconnect: vi.fn(),
}));

vi.stubGlobal('ResizeObserver', MockResizeObserver);

// Mock react-dom/client to ensure consistent rendering environment
vi.mock('react-dom/client', async importOriginal => {
	const actual = await importOriginal();
	return {
		...actual,
		createRoot: vi.fn(element => ({
			render: vi.fn(children => {
				// This is a simplified mock. In a real scenario, you might want to render to a test DOM element.
				// For now, we just prevent the actual rendering to avoid issues.
				// console.log('Mocked createRoot render called', element, children);
			}),
			unmount: vi.fn(),
		})),
	};
});
