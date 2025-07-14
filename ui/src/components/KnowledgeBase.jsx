import React from 'react';
import PropTypes from 'prop-types';
import AssertionPanel from './AssertionPanel';
import './KnowledgeBase.css';

const KnowledgeBase = ({ sessionId, currentKb, addMessageToHistory }) => {
  const assertions = currentKb
    ? currentKb.split('\n').filter((line) => line.trim() !== '')
    : [];

  const handleRetract = async (assertionToRetract) => {
    if (!sessionId) {
      addMessageToHistory({
        type: 'system',
        text: '⚠️ Cannot retract: Not connected to a session.',
      });
      return;
    }

    const currentAssertions = currentKb
      .split('\n')
      .filter((line) => line.trim() !== '');
    const newKbContent = currentAssertions
      .filter((a) => a !== assertionToRetract)
      .join('\n');

    try {
      addMessageToHistory({
        type: 'system',
        text: `Attempting to retract: ${assertionToRetract}`,
      });
      const response = await apiService.invokeTool('session.set_kb', {
        sessionId: sessionId,
        kbContent: newKbContent,
      });

      if (response.success) {
        addMessageToHistory({
          type: 'system',
          text: `✅ Retracted successfully.`,
        });
        // The KB will be updated via the kb_updated websocket message, so no need to set it here.
      } else {
        addMessageToHistory({
          type: 'system',
          text: `❌ Failed to retract: ${response.message}`,
        });
      }
    } catch (error) {
      addMessageToHistory({
        type: 'system',
        text: `❌ Exception during retraction: ${error.message}`,
      });
    }
  };

  const handleShowRelated = (assertion) => {
    console.log(`Showing related for: ${assertion}`);
    // Placeholder for future implementation
  };

  return (
    <div className="knowledge-base">
      <div className="kb-header">
        <h3>Knowledge Base</h3>
      </div>
      <div className="kb-content">
        {assertions.length > 0 ? (
          assertions.map((assertion, index) => (
            <AssertionPanel
              key={index}
              assertion={assertion}
              onRetract={handleRetract}
              onShowRelated={handleShowRelated}
            />
          ))
        ) : (
          <div className="kb-empty-message">Knowledge Base is empty.</div>
        )}
      </div>
    </div>
  );
};

KnowledgeBase.propTypes = {
  sessionId: PropTypes.string,
  currentKb: PropTypes.string,
  addMessageToHistory: PropTypes.func.isRequired,
};

export default KnowledgeBase;
