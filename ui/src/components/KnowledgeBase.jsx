import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faClipboard } from '@fortawesome/free-solid-svg-icons';
import PrologCodeViewer from './PrologCodeViewer';
import './KnowledgeBase.css';

const KnowledgeBase = ({ currentKb }) => {
  const [copyStatus, setCopyStatus] = useState('');

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

  return (
    <div className="knowledge-base">
      <div className="kb-header">
        <h3>Knowledge Base</h3>
        <button onClick={handleCopyKb} title="Copy full KB to clipboard">
          <FontAwesomeIcon icon={faClipboard} /> {copyStatus}
        </button>
      </div>
      <div className="kb-content">
        <PrologCodeViewer code={currentKb} />
      </div>
    </div>
  );
};

export default KnowledgeBase;
