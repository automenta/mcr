import React from 'react';

const StrategyDeepDive = ({ strategyId, onBack }) => {
  return (
    <div>
      <h3>Strategy Deep Dive: {strategyId}</h3>
      <p>Content for Strategy Deep Dive will go here.</p>
      <button onClick={onBack}>Back to Leaderboard</button>
    </div>
  );
};

export default StrategyDeepDive;
