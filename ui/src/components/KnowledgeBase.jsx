import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTrash, faClipboard, faProjectDiagram } from '@fortawesome/free-solid-svg-icons';
import apiService from '../apiService';
import './KnowledgeBase.css';

const KnowledgeBase = ({ currentKb, sessionId }) => {
  const [copyStatus, setCopyStatus] = useState('');

  const parseKb = (kb) => {
    if (!kb) return [];
    return kb.split('\n').filter(line => line.trim() !== '' && !line.startsWith(':-'));
  };

  const assertions = parseKb(currentKb);

  const handleCopyKb = () => {
    if (navigator.clipboard && currentKb) {
      navigator.clipboard.writeText(currentKb)
        .then(() => {
          setCopyStatus('Copied!');
          setTimeout(() => setCopyStatus(''), 2000);
        })
        .catch(err => {
          setCopyStatus('Failed!');
          setTimeout(() => setCopyStatus(''), 2000);
          console.error("Failed to copy KB:", err);
        });
    }
  };

  const handleDelete = async (assertion) => {
    try {
      await apiService.invokeTool('reason.retract', { sessionId, fact: assertion });
    } catch (error) {
      console.error('Failed to retract assertion:', error);
    }
  };

  const handleRelated = (assertion) => {
    alert(`Related assertions for: ${assertion}`);
  };

  return (
    <div className="knowledge-base">
      <div className="kb-header">
        <h3>Knowledge Base</h3>
        <button onClick={handleCopyKb} title="Copy full KB to clipboard">
          <FontAwesomeIcon icon={faClipboard} /> {copyStatus}
        </button>
      </div>
      <div className="kb-content">
        {assertions.length > 0 ? (
          <ul className="assertion-list">
            {assertions.map((assertion, index) => (
              <li key={index} className="assertion-item">
                <span className="assertion-text">{assertion}</span>
                <div className="assertion-actions">
                  <button onClick={() => handleRelated(assertion)} title="Show related">
                    <FontAwesomeIcon icon={faProjectDiagram} />
                  </button>
                  <button onClick={() => handleDelete(assertion)} title="Retract assertion">
                    <FontAwesomeIcon icon={faTrash} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p>The Knowledge Base is empty.</p>
        )}
      </div>
    </div>
  );
};

export default KnowledgeBase;
