import React from 'react';

const HybridMetrics = ({ metrics }) => {
  if (!metrics) {
    return null;
  }

  return (
    <div style={{ marginTop: '1rem', padding: '0.5rem', border: '1px solid #ccc' }}>
      <h5>Hybrid Metrics</h5>
      <div>
        <h6>Embedding Similarity</h6>
        <p>Histogram will be displayed here.</p>
      </div>
      <div>
        <h6>Probability Distribution</h6>
        <p>Distribution chart will be displayed here.</p>
      </div>
    </div>
  );
};

const StrategyLeaderboard = ({ onSelectStrategy, hybridMetrics }) => {
  return (
    <div>
      <h3>Strategy Leaderboard</h3>
      <p>Content for Strategy Leaderboard will go here.</p>
      {/* Example button to simulate selecting a strategy */}
      <button onClick={() => onSelectStrategy('exampleStrategyId')}>
        View Example Strategy Deep Dive
      </button>
      <HybridMetrics metrics={hybridMetrics} />
    </div>
  );
};

export default StrategyLeaderboard;
