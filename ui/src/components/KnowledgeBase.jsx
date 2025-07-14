import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faClipboard } from '@fortawesome/free-solid-svg-icons';
import AssertionList from './AssertionList';
import apiService from '../apiService';
import './KnowledgeBase.css';

const KnowledgeBase = ({ sessionId, currentKb, addMessageToHistory, fetchCurrentKb }) => {
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

  const handleRetract = async (assertion) => {
    if (!sessionId) {
      addMessageToHistory({ type: 'system', text: '⚠️ Cannot retract assertion: No active session.' });
      return;
    }
    const ruleToRetract = `retract(${assertion}).`;
    try {
      addMessageToHistory({ type: 'system', text: `Attempting to retract: ${assertion}` });
      const response = await apiService.invokeTool('session.assert_rules', {
        sessionId,
        rules: ruleToRetract,
      });

      if (response.success) {
        addMessageToHistory({ type: 'system', text: `✅ Assertion retracted successfully.` });
        fetchCurrentKb(sessionId); // Refresh the KB from the server
      } else {
        addMessageToHistory({ type: 'system', text: `❌ Failed to retract assertion: ${response.message}` });
      }
    } catch (error) {
      addMessageToHistory({ type: 'system', text: `❌ Exception while retracting assertion: ${error.message}` });
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
        <AssertionList currentKb={currentKb} onRetract={handleRetract} />
      </div>
    </div>
  );
};

KnowledgeBase.propTypes = {
  sessionId: PropTypes.string,
  currentKb: PropTypes.string.isRequired,
  addMessageToHistory: PropTypes.func.isRequired,
  fetchCurrentKb: PropTypes.func.isRequired,
};

export default KnowledgeBase;
