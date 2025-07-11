import React, { useState, useEffect } from 'react';
import apiService from '../../apiService'; // Adjusted path

const EvolverControlPanel = () => {
  const [status, setStatus] = useState({ status: 'idle', message: 'Fetching status...' });
  const [logs, setLogs] = useState([]);
  const [isLoadingStatus, setIsLoadingStatus] = useState(false);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [error, setError] = useState(null);

  // Optimizer options
  const [iterations, setIterations] = useState(1);
  const [runBootstrap, setRunBootstrap] = useState(false);
  const [bootstrapOnly, setBootstrapOnly] = useState(false);
  const [evalCasesPath, setEvalCasesPath] = useState('src/evalCases'); // Default from optimizer.js

  const fetchStatus = async () => {
    setIsLoadingStatus(true);
    setError(null);
    try {
      const response = await apiService.invokeTool('evolution.get_status');
      if (response.success) {
        setStatus(response.data);
      } else {
        setError(response.message || 'Failed to fetch optimizer status.');
        setStatus({ status: 'error', message: response.message });
      }
    } catch (err) {
      setError(err.message || 'An unexpected error occurred fetching status.');
      setStatus({ status: 'error', message: err.message });
    }
    setIsLoadingStatus(false);
  };

  const fetchLogs = async () => {
    setIsLoadingLogs(true);
    // setError(null); // Keep general errors, clear only log-specific if needed
    try {
      const response = await apiService.invokeTool('evolution.get_optimizer_log');
      if (response.success) {
        setLogs(response.data?.logs || []);
      } else {
        //setError(response.message || 'Failed to fetch optimizer logs.');
        alert(`Error fetching logs: ${response.message}`); // Use alert for log errors for now
        setLogs([]);
      }
    } catch (err) {
      //setError(err.message || 'An unexpected error occurred fetching logs.');
      alert(`Error fetching logs: ${err.message}`);
      setLogs([]);
    }
    setIsLoadingLogs(false);
  };

  useEffect(() => {
    fetchStatus();
    fetchLogs();
    const intervalId = setInterval(() => {
      fetchStatus();
      fetchLogs(); // Also refresh logs periodically when panel is open
    }, 5000); // Refresh status and logs every 5 seconds
    return () => clearInterval(intervalId);
  }, []);

  const handleStartOptimizer = async () => {
    setError(null);
    const options = {
      iterations: parseInt(iterations, 10) || 1,
      runBootstrap,
      bootstrapOnly,
      evalCasesPath,
    };
    try {
      const response = await apiService.invokeTool('evolution.start_optimizer', { options });
      if (response.success) {
        alert(response.message || 'Optimizer started successfully.');
        fetchStatus(); // Refresh status immediately
      } else {
        setError(response.message || 'Failed to start optimizer.');
      }
    } catch (err) {
      setError(err.message || 'An unexpected error occurred while starting optimizer.');
    }
  };

  const handleStopOptimizer = async () => {
    setError(null);
    try {
      const response = await apiService.invokeTool('evolution.stop_optimizer');
      if (response.success) {
        alert(response.message || 'Optimizer stop signal sent.');
        fetchStatus(); // Refresh status
      } else {
        setError(response.message || 'Failed to stop optimizer.');
      }
    } catch (err) {
      setError(err.message || 'An unexpected error occurred while stopping optimizer.');
    }
  };

  const isOptimizerRunning = status?.status === 'running';

  return (
    <div>
      <h4>🧬 Evolver Control Panel</h4>
      {error && <p style={{ color: 'red' }}>Error: {error}</p>}

      <div>
        <h5>ℹ️ Status: {isLoadingStatus ? '⏳ Loading...' : `${status.status} (PID: ${status.pid || 'N/A'})`}</h5>
        <p>{status.message}</p>
        <button onClick={fetchStatus} disabled={isLoadingStatus}>🔄 Refresh Status</button>
      </div>
      <hr />
      <div>
        <h5>⚙️ Controls</h5>
        <label>Iterations: <input type="number" value={iterations} onChange={e => setIterations(e.target.value)} min="1" disabled={isOptimizerRunning} /></label><br/>
        <label><input type="checkbox" checked={runBootstrap} onChange={e => setRunBootstrap(e.target.checked)} disabled={isOptimizerRunning || bootstrapOnly} /> Run Bootstrap Before Iterations</label><br/>
        <label><input type="checkbox" checked={bootstrapOnly} onChange={e => { setBootstrapOnly(e.target.checked); if(e.target.checked) setRunBootstrap(true); }} disabled={isOptimizerRunning} /> Bootstrap Only (implies Run Bootstrap)</label><br/>
        <label>Eval Cases Path: <input type="text" value={evalCasesPath} onChange={e => setEvalCasesPath(e.target.value)} disabled={isOptimizerRunning} /></label><br/>

        <button onClick={handleStartOptimizer} disabled={isOptimizerRunning || isLoadingStatus}>▶️ Start Optimizer</button>
        <button onClick={handleStopOptimizer} disabled={!isOptimizerRunning || isLoadingStatus}>⏹️ Stop Optimizer</button>
      </div>
      <hr />
      <div>
        <h5>📜 Optimizer Logs</h5>
        <button onClick={fetchLogs} disabled={isLoadingLogs}>🔄 Refresh Logs</button>
        <pre style={{ maxHeight: '400px', overflowY: 'auto', border: '1px solid #ccc', padding: '10px', background: '#f0f0f0' }}>
          {logs.length > 0 ? logs.map(log => `[${new Date(log.timestamp).toLocaleTimeString()}] [${log.type}] ${log.message}`).join('\n') : '🤷 No logs available or fetched yet.'}
        </pre>
      </div>
    </div>
  );
};

export default EvolverControlPanel;
