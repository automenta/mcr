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
  it('renders without crashing', () => {
    const mockData = {
      nodes: [{ id: '1', data: { label: 'Node 1' }, position: { x: 0, y: 0 } }],
      edges: [],
    };
    render(<GraphVisualizer data={mockData} />);
    expect(screen.getByText('Node 1')).toBeInTheDocument();
  });
});
