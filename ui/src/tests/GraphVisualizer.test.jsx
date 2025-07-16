import React from 'react';
import { render, screen } from '@testing-library/react';
import GraphVisualizer from '../components/GraphVisualizer';

// Mock the ResizeObserver
const ResizeObserverMock = vi.fn(() => ({
	observe: vi.fn(),
	unobserve: vi.fn(),
	disconnect: vi.fn(),
}));

// Stub the global ResizeObserver
vi.stubGlobal('ResizeObserver', ResizeObserverMock);

describe('GraphVisualizer', () => {
	const mockData = {
		nodes: [
			{ id: '1', data: { label: 'Node 1' }, position: { x: 0, y: 0 } },
			{ id: '2', data: { label: 'Node 2' }, position: { x: 100, y: 100 } },
		],
		edges: [{ id: 'e1-2', source: '1', target: '2' }],
	};

	it('renders without crashing', () => {
		const { container } = render(<GraphVisualizer data={mockData} />);
		expect(container).toBeInTheDocument();
	});

	it('renders the correct number of nodes', () => {
		render(<GraphVisualizer data={mockData} />);
		const nodes = screen.getAllByText(/Node/);
		expect(nodes.length).toBe(2);
	});

	it('matches snapshot', () => {
		const { asFragment } = render(<GraphVisualizer data={mockData} />);
		expect(asFragment()).toMatchSnapshot();
	});
});
