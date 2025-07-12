import React from 'react';
import PrologCodeViewer from './PrologCodeViewer';
import './KnowledgeBase.css';

const KnowledgeBase = ({ currentKb }) => {
  return (
    <div className="knowledge-base">
      <h3>Knowledge Base</h3>
      <PrologCodeViewer code={currentKb} />
    </div>
  );
};

export default KnowledgeBase;
