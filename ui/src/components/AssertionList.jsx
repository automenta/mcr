import React from 'react';
import PropTypes from 'prop-types';
import AssertionPanel from './AssertionPanel';

const AssertionList = ({ currentKb, onRetract }) => {
  const parseKb = (kb) => {
    if (!kb) return [];
    // Filter out comments and empty lines
    return kb.split('\n').filter(line => line.trim() !== '' && !line.trim().startsWith('%'));
  };

  const assertions = parseKb(currentKb);

  return (
    <div className="assertion-list">
      {assertions.map((assertion, index) => (
        <AssertionPanel
          key={index}
          assertion={assertion}
          onRetract={onRetract}
          allAssertions={assertions}
        />
      ))}
    </div>
  );
};

AssertionList.propTypes = {
  currentKb: PropTypes.string.isRequired,
  onRetract: PropTypes.func.isRequired,
};

export default AssertionList;
