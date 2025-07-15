import React, { useState, useEffect } from 'react';
import apiService from '../apiService';
import GraphVisualizer from './GraphVisualizer';

const mockNlData = {
  nodes: [
    { id: '1', data: { label: 'Hello' }, type: 'custom' },
    { id: '2', data: { label: 'World' }, type: 'custom' },
  ],
  edges: [{ id: 'e1-2', source: '1', target: '2' }],
};

const mockReasoningData = {
  nodes: [
    { id: '1', data: { label: 'Step 1' }, type: 'custom' },
    { id: '2', data: { label: 'Step 2' }, type: 'custom' },
    { id: '3', data: { label: 'Step 3' }, type: 'custom' },
  ],
  edges: [
    { id: 'e1-2', source: '1', target: '2' },
    { id: 'e2-3', source: '2', target: '3' },
  ],
};

const mockKbData = {
  nodes: [
    { id: '1', data: { label: 'Socrates' }, type: 'custom' },
    { id: '2', data: { label: 'is a' }, type: 'custom' },
    { id: '3', data: { label: 'Man' }, type: 'custom' },
  ],
  edges: [
    { id: 'e1-2', source: '1', target: '2' },
    { id: 'e2-3', source: '2', target: '3' },
  ],
};

const mockEvolutionData = {
  nodes: [
    { id: '1', data: { label: 'Strategy A' }, type: 'custom' },
    { id: '2', data: { label: 'Strategy B' }, type: 'custom' },
  ],
  edges: [{ id: 'e1-2', source: '1', target: '2' }],
};

const Sidebar = () => {
  const [sessions, setSessions] = useState([]);
  const [activeTab, setActiveTab] = useState('nl');

  useEffect(() => {
    const fetchSessions = async () => {
      try {
        const response = await apiService.invokeTool('session.list');
        if (response.success && Array.isArray(response.data)) {
          setSessions(response.data);
        }
      } catch (error) {
        console.error('Error fetching sessions:', error);
      }
    };

    fetchSessions();
  }, []);

  const getTabData = () => {
    switch (activeTab) {
      case 'nl':
        return { data: mockNlData, layout: 'grid' };
      case 'reasoning':
        return { data: mockReasoningData, layout: 'dagre' };
      case 'kb':
        return { data: mockKbData, layout: 'dagre' };
      case 'evolution':
        return { data: mockEvolutionData, layout: 'grid' };
      default:
        return { data: { nodes: [], edges: [] }, layout: 'grid' };
    }
  };

  const { data, layout } = getTabData();

  return (
    <div style={{ width: '250px', borderRight: '1px solid #ccc', padding: '1rem', display: 'flex', flexDirection: 'column', height: '100%' }}>
      <h3>Sessions</h3>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, overflowY: 'auto', flex: 1 }}>
        {sessions.map((session) => (
          <li key={session.id} style={{ padding: '0.5rem', borderBottom: '1px solid #eee' }}>{session.id}</li>
        ))}
      </ul>
      <hr />
      <h3>Context</h3>
      <div style={{ display: 'flex', justifyContent: 'space-around' }}>
        <button onClick={() => setActiveTab('nl')}>NL</button>
        <button onClick={() => setActiveTab('reasoning')}>Reasoning</button>
        <button onClick={() => setActiveTab('kb')}>KB</button>
        <button onClick={() => setActiveTab('evolution')}>Evolution</button>
      </div>
      <div style={{ marginTop: '1rem', flex: 2, height: '300px' }}>
        <GraphVisualizer data={data} layout={layout} />
      </div>
      <hr />
      <h3>Config</h3>
      <div>
        {/* Config toggles will go here */}
      </div>
    </div>
  );
};

export default Sidebar;
