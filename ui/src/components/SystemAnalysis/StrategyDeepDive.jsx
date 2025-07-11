import React, { useState, useEffect } from 'react';
import apiService from '../../apiService'; // Adjusted path

const StrategyDeepDive = ({ strategyId, onBack }) => {
  const [details, setDetails] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!strategyId) return;
    const fetchDetails = async () => {
      setIsLoading(true);
      setError(null);
      setDetails(null);
      try {
        const response = await apiService.invokeTool('analysis.get_strategy_details', { strategyId });
        if (response.success) {
          setDetails(response.data);
        } else {
          setError(response.message || `Failed to fetch details for ${strategyId}.`);
        }
      } catch (err) {
        setError(err.message || 'An unexpected error occurred.');
      }
      setIsLoading(false);
    };
    fetchDetails();
  }, [strategyId]);

  if (!strategyId) return <p>🤷 No strategy selected for deep dive.</p>;
  if (isLoading) return <p>⏳ Loading strategy details for {strategyId}...</p>;
  if (error) return <p style={{ color: 'red' }}>Error: {error}</p>;
  if (!details) return <p>🤷 No details found for strategy {strategyId}.</p>;

  return (
    <div>
      <button onClick={onBack} style={{marginBottom: '15px'}}>⬅️ Back to Leaderboard</button>
      <h3>🎯 Strategy Deep Dive: {details.definition?.name || strategyId}</h3>
      <p><strong>ID:</strong> {details.strategyId}</p>
      <p><strong>Hash:</strong> {details.hash}</p>

      <h4>📊 Summary Statistics</h4>
      <pre>{JSON.stringify(details.summary, null, 2)}</pre>

      <h4>📜 Definition</h4>
      <details>
        <summary>👁️ View Strategy JSON Definition</summary>
        <pre style={{maxHeight: '300px', overflow:'auto', border:'1px solid #ccc', padding:'10px', background:'#f9f9f9'}}>
          {JSON.stringify(details.definition, null, 2)}
        </pre>
      </details>

      <h4>📈 Performance Runs ({details.runs?.length || 0})</h4>
      {details.runs && details.runs.length > 0 ? (
        <div style={{maxHeight: '500px', overflowY: 'auto'}}>
          <table>
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Example ID</th>
                <th>LLM Model</th>
                <th>Latency (ms)</th>
                <th>Metrics</th>
                <th>Cost</th>
                <th>Raw Output</th>
              </tr>
            </thead>
            <tbody>
              {details.runs.map(run => (
                <tr key={run.id}>
                  <td>{new Date(run.timestamp).toLocaleString()}</td>
                  <td>{run.example_id}</td>
                  <td>{run.llm_model_id || 'N/A'}</td>
                  <td>{run.latency_ms}</td>
                  <td><pre>{JSON.stringify(run.metrics, null, 2)}</pre></td>
                  <td><pre>{JSON.stringify(run.cost, null, 2)}</pre></td>
                  <td><details><summary>👁️ View Output</summary><pre>{run.raw_output}</pre></details></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p>🤷 No performance runs found for this strategy hash.</p>}
    </div>
  );
};

export default StrategyDeepDive;
