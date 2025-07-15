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
  const [useLtn, setUseLtn] = useState(false);

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

  const handleLtnToggle = async () => {
    const newLtnState = !useLtn;
    setUseLtn(newLtnState);
    try {
      await apiService.invokeTool('config.set', { key: 'USE_LTN', value: newLtnState });
    } catch (error) {
      console.error('Error setting LTN config:', error);
    }
  };

  const getTabData = () => {
    switch (activeTab) {
      case 'nl':
        return mockNlData;
      case 'reasoning':
        return mockReasoningData;
      case 'kb':
        return mockKbData;
      case 'evolution':
        return mockEvolutionData;
      default:
        return { nodes: [], edges: [] };
    }
  };

  return (
    <div style={{ width: '250px', borderRight: '1px solid #ccc', padding: '1rem' }}>
      <h3>Sessions</h3>
      <ul>
        {sessions.map((session) => (
          <li key={session.id}>{session.id}</li>
        ))}
      </ul>
      <hr />
      <h3>Context</h3>
      <div>
        <button onClick={() => setActiveTab('nl')}>NL</button>
        <button onClick={() => setActiveTab('reasoning')}>Reasoning</button>
        <button onClick={() => setActiveTab('kb')}>KB</button>
        <button onClick={() => setActiveTab('evolution')}>Evolution</button>
      </div>
      <div style={{ marginTop: '1rem', height: '300px' }}>
        <GraphVisualizer data={getTabData()} layout="grid" size="small" />
      </div>
      <hr />
      <h3>Config</h3>
      <div>
        <label>
          <input type="checkbox" checked={useLtn} onChange={handleLtnToggle} />
          Enable LTN
        </label>
      </div>
    </div>
  );
};

export default Sidebar;
