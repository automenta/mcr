import React, { useState, useEffect } from 'react';
import apiService from '../../apiService'; // Adjusted path

const StrategyLeaderboard = ({ onSelectStrategy }) => {
  const [leaderboardData, setLeaderboardData] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchLeaderboard = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await apiService.invokeTool('analysis.get_strategy_leaderboard');
      if (response.success) {
        setLeaderboardData(response.data || []);
      } else {
        setError(response.message || 'Failed to fetch leaderboard data.');
        setLeaderboardData([]);
      }
    } catch (err) {
      setError(err.message || 'An unexpected error occurred.');
      setLeaderboardData([]);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchLeaderboard(); // Fetch on component mount
  }, []);

  return (
    <div>
      <h4>🏆 Strategy Leaderboard</h4>
      <button onClick={fetchLeaderboard} disabled={isLoading}>
        {isLoading ? '⏳ Loading...' : '🔄 Refresh Leaderboard'}
      </button>
      {error && <p style={{ color: 'red' }}>Error: {error}</p>}
      {isLoading && !leaderboardData.length && <p>⏳ Loading data...</p>}
      {!isLoading && !leaderboardData.length && !error && <p>🤷 No leaderboard data available.</p>}
      {leaderboardData.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Strategy Name</th>
              <th>Strategy ID</th>
              <th>Evaluations</th>
              <th>Success Rate</th>
              <th>Avg Latency (ms)</th>
              <th>Avg Cost ($)</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {leaderboardData.map((row, index) => (
              <tr key={row.strategyId || index}>
                <td>{row.strategyName}</td>
                <td>{row.strategyId}</td>
                <td>{row.evaluations}</td>
                <td>{typeof row.successRate === 'number' ? row.successRate.toFixed(3) : 'N/A'}</td>
                <td>{typeof row.avgLatencyMs === 'number' ? row.avgLatencyMs.toFixed(0) : 'N/A'}</td>
                <td>{typeof row.avgCost === 'number' ? row.avgCost.toFixed(5) : 'N/A'}</td>
                <td>
                  <button onClick={() => onSelectStrategy(row.strategyId)}>👁️ Details</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default StrategyLeaderboard;
