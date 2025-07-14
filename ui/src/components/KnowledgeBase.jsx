import React from 'react';
import AssertionPanel from './AssertionPanel';
import apiService from '../apiService';
import './KnowledgeBase.css';

const KnowledgeBase = ({ currentKb, sessionId }) => {
  const assertions = currentKb.split('\n').filter(line => line.trim() !== '');

  const handleRetract = async (assertion) => {
    try {
      await apiService.invokeTool('mcr.retract', { sessionId, assertion });
    } catch (error) {
      console.error('Failed to retract assertion:', error);
    }
  };

  return (
    <div className="knowledge-base">
      <div className="kb-header">
        <h3>Knowledge Base</h3>
      </div>
      <div className="kb-content">
        {assertions.map((assertion, index) => (
          <AssertionPanel
            key={index}
            assertion={assertion}
            onRetract={() => handleRetract(assertion)}
          />
        ))}
      </div>
    </div>
  );
};

export default KnowledgeBase;
