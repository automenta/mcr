import React, { useState } from 'react';
import apiService from '../apiService';
import './AssertionPanel.css';

const AssertionPanel = ({ sessionId, assertion, fetchCurrentKb }) => {
  const [showRelated, setShowRelated] = useState(false);
  const [relatedAssertions, setRelatedAssertions] = useState([]);

  const handleRetract = async () => {
    try {
      await apiService.invokeTool('kb.retract', { sessionId, assertion: assertion.text });
      fetchCurrentKb(sessionId);
    } catch (error) {
      console.error('Failed to retract assertion:', error);
    }
  };

  const handleShowRelated = async () => {
    // This is a placeholder for the related assertions functionality
    setShowRelated(!showRelated);
    if (!showRelated) {
      // In the future, we would fetch related assertions from the backend
      setRelatedAssertions([
        { id: 1, text: 'related(assertion, a)' },
        { id: 2, text: 'related(assertion, b)' },
      ]);
    }
  };

  return (
    <div className="assertion-panel">
      <div className="assertion-label">{assertion.text}</div>
      <div className="assertion-actions">
        <button onClick={handleRetract}>X</button>
        <button onClick={handleShowRelated}>Related</button>
      </div>
      {showRelated && (
        <div className="related-assertions-popup">
          <h4>Related Assertions</h4>
          <ul>
            {relatedAssertions.map(related => (
              <li key={related.id}>{related.text}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default AssertionPanel;
