import React, { useState } from 'react';
import PropTypes from 'prop-types';
import Modal from './Modal';
import './AssertionPanel.css';

const AssertionPanel = ({ assertion, onRetract, allAssertions }) => {
  const [showModal, setShowModal] = useState(false);

  const handleRetract = () => {
    onRetract(assertion);
  };

  const getEntities = (fact) => {
    const match = fact.match(/\(([^)]+)\)/);
    if (!match) return [];
    return match[1].split(',').map(e => e.trim());
  };

  const findRelatedAssertions = () => {
    const entities = getEntities(assertion);
    if (entities.length === 0) return [];

    return allAssertions.filter(otherAssertion => {
      if (otherAssertion === assertion) return false;
      const otherEntities = getEntities(otherAssertion);
      return otherEntities.some(otherEntity => entities.includes(otherEntity));
    });
  };

  const relatedAssertions = findRelatedAssertions();

  return (
    <>
      <div className="assertion-panel">
        <span className="assertion-label">{assertion}</span>
        <div className="assertion-actions">
          <button onClick={() => setShowModal(true)} className="related-btn" disabled={relatedAssertions.length === 0}>
            Related ({relatedAssertions.length})
          </button>
          <button onClick={handleRetract} className="delete-btn">X</button>
        </div>
      </div>
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Related Assertions">
        {relatedAssertions.length > 0 ? (
          <ul>
            {relatedAssertions.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        ) : (
          <p>No related assertions found.</p>
        )}
      </Modal>
    </>
  );
};

AssertionPanel.propTypes = {
  assertion: PropTypes.string.isRequired,
  onRetract: PropTypes.func.isRequired,
  allAssertions: PropTypes.arrayOf(PropTypes.string).isRequired,
};

export default AssertionPanel;
