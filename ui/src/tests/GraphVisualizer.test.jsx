import React from 'react';
import { render } from '@testing-library/react';
import GraphVisualizer from '../components/GraphVisualizer';

describe('GraphVisualizer', () => {
  it('renders without crashing', () => {
    const mockData = {
      nodes: [
        { id: '1', data: { label: 'Node 1' }, type: 'custom' },
        { id: '2', data: { label: 'Node 2' }, type: 'custom' },
      ],
      edges: [{ id: 'e1-2', source: '1', target: '2' }],
    };
    render(<GraphVisualizer data={mockData} />);
  });
});
