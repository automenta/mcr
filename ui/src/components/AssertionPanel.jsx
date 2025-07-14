import React from 'react';
import PropTypes from 'prop-types';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faQuestionCircle, faTimes } from '@fortawesome/free-solid-svg-icons';
import './AssertionPanel.css';

const AssertionPanel = ({ assertion, onRetract, onShowRelated }) => {
  return (
    <div className="assertion-panel">
      <span className="assertion-label">{assertion}</span>
      <div className="assertion-buttons">
        <button onClick={() => onShowRelated(assertion)} title="Show related">
          <FontAwesomeIcon icon={faQuestionCircle} />
        </button>
        <button onClick={() => onRetract(assertion)} title="Retract assertion">
          <FontAwesomeIcon icon={faTimes} />
        </button>
      </div>
    </div>
  );
};

AssertionPanel.propTypes = {
  assertion: PropTypes.string.isRequired,
  onRetract: PropTypes.func.isRequired,
  onShowRelated: PropTypes.func.isRequired,
};

export default AssertionPanel;
