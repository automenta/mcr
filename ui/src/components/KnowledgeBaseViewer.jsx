import React from 'react';
import useStore from '../store';

const KnowledgeBaseViewer = () => {
  const { currentKb, newFactsInLastUpdate } = useStore();

  return (
    <div style={{ border: '1px solid #ccc', padding: '10px', marginTop: '10px', minHeight: '200px', backgroundColor: '#f9f9f9', color: '#333' }}>
      <h3>Live Knowledge Base</h3>
      {newFactsInLastUpdate && newFactsInLastUpdate.length > 0 && (
        <div style={{ marginBottom: '10px', padding: '5px', border: '1px solid green', backgroundColor: '#e6ffe6' }}>
          <p><strong>New facts added:</strong></p>
          <pre style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word', fontSize: '0.85em' }}>
            {newFactsInLastUpdate.join('\n')}
          </pre>
        </div>
      )}
      {currentKb ? (
        <pre style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word', fontSize: '0.85em', maxHeight: '500px', overflowY: 'auto' }}>
          {currentKb}
        </pre>
      ) : (
        <p>Knowledge base is empty or not loaded.</p>
      )}
    </div>
  );
};

export default KnowledgeBaseViewer;
