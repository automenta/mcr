import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTrash, faShareAlt } from '@fortawesome/free-solid-svg-icons';
import './AssertionPanel.css';

const AssertionPanel = ({ assertion, onRetract }) => {
  return (
    <div className="assertion-panel">
      <div className="assertion-label">{assertion}</div>
      <div className="assertion-actions">
        <button onClick={onRetract} title="Retract Assertion">
          <FontAwesomeIcon icon={faTrash} />
        </button>
        <button title="Related Assertions">
          <FontAwesomeIcon icon={faShareAlt} />
        </button>
      </div>
    </div>
  );
};

export default AssertionPanel;
