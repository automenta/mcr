import React from 'react';
import AssertionPanel from './AssertionPanel';
import './KnowledgeBase.css';

const KnowledgeBase = ({ sessionId, currentKb, fetchCurrentKb }) => {
  const assertions = currentKb
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map((line, index) => ({ id: index, text: line }));

  return (
    <div className="knowledge-base">
      <h3>Knowledge Base</h3>
      <div className="kb-content">
        {assertions.map(assertion => (
          <AssertionPanel
            key={assertion.id}
            sessionId={sessionId}
            assertion={assertion}
            fetchCurrentKb={fetchCurrentKb}
          />
        ))}
      </div>
    </div>
  );
};

export default KnowledgeBase;
