const React = require('react');
const { Box, Text, render, useApp, useInput } = require('ink');
const { useEffect, useState, useCallback } = require('react');
const dbModule = require('../database'); // To interact with the database
const logger = require('../logger'); // For logging errors
const SelectInput = require('ink-select-input').default;
const Spinner = require('ink-spinner').default;

const App = () => {
    const { exit } = useApp();
    const [loadingMessage, setLoadingMessage] = useState('Initializing...');
    const [error, setError] = useState(null);

    const [uniqueStrategies, setUniqueStrategies] = useState([]); // [{label: hash, value: hash}]
    const [selectedStrategyHash, setSelectedStrategyHash] = useState(null);
    const [strategyRuns, setStrategyRuns] = useState([]);
    const [selectedRun, setSelectedRun] = useState(null); // For detailed view

    const [view, setView] = useState('main'); // main, listStrategies, viewStrategyRuns, viewRunDetails, dashboard
    const [dashboardData, setDashboardData] = useState(null);

    // Initial data fetch (strategies and dashboard stats)
    useEffect(() => {
        async function fetchStrategies() {
            setLoadingMessage('Fetching unique strategies...');
            try {
                await dbModule.initDb();
                const rows = await dbModule.queryPerformanceResults(
                    "SELECT DISTINCT strategy_hash FROM performance_results ORDER BY timestamp DESC"
                );
                if (rows && rows.length > 0) {
                    setUniqueStrategies(rows.map(r => ({ label: r.strategy_hash, value: r.strategy_hash })));
                    setLoadingMessage('');
                } else {
                    setLoadingMessage('No strategies found in performance_results database.');
                }
            } catch (err) {
                logger.error('[EvaluatorTUI] Error fetching strategies:', err);
                setError(`Error fetching strategies: ${err.message}`);
                setLoadingMessage('');
            }
        }
        fetchStrategies();
    }, []);

    // Fetch runs for a selected strategy
    useEffect(() => {
        if (selectedStrategyHash && view === 'viewStrategyRuns') {
            async function fetchStrategyRuns() {
                setLoadingMessage(`Fetching runs for strategy ${selectedStrategyHash.substring(0, 10)}...`);
                setStrategyRuns([]); // Clear previous runs
                try {
                    await dbModule.initDb();
                    const rows = await dbModule.queryPerformanceResults(
                        "SELECT id, example_id, llm_model_id, metrics, cost, latency_ms, timestamp, raw_output FROM performance_results WHERE strategy_hash = ? ORDER BY timestamp DESC LIMIT 20", // Limit for now
                        [selectedStrategyHash]
                    );
                    if (rows && rows.length > 0) {
                        setStrategyRuns(rows.map(row => ({
                            ...row,
                            metrics: JSON.parse(row.metrics || '{}'),
                            cost: JSON.parse(row.cost || '{}')
                        })));
                        setLoadingMessage('');
                    } else {
                        setLoadingMessage(`No runs found for strategy ${selectedStrategyHash.substring(0, 10)}...`);
                    }
                } catch (err) {
                    logger.error(`[EvaluatorTUI] Error fetching runs for strategy ${selectedStrategyHash}:`, err);
                    setError(`Error fetching runs: ${err.message}`);
                    setLoadingMessage('');
                }
            }
            fetchStrategyRuns();
        }
    }, [selectedStrategyHash, view]);

    useInput((input, key) => {
        if (key.escape) {
            if (view === 'viewRunDetails') {
                setSelectedRun(null);
                setView('viewStrategyRuns');
            } else if (view === 'viewStrategyRuns') {
                setSelectedStrategyHash(null);
                setStrategyRuns([]);
                setView('listStrategies');
            } else {
                exit();
            }
        }
        if (input === 'q' && view !== 'listStrategies' && view !== 'viewStrategyRuns' && view !== 'viewRunDetails') { // Allow 'q' to exit if not in a selection mode
            exit();
        }
    });

    const handleStrategySelect = (item) => {
        setSelectedStrategyHash(item.value);
        setView('viewStrategyRuns');
    };

    const handleRunSelect = (item) => { // item here is the full run object
        setSelectedRun(item);
        setView('viewRunDetails');
    };

    if (error) {
        return <Box padding={1}><Text color="red">Error: {error} (Press Esc to try to go back or Ctrl+C to exit)</Text></Box>;
    }

    if (loadingMessage) {
        return <Box padding={1}><Spinner type="dots" /> <Text>{loadingMessage}</Text></Box>;
    }

    return (
        <Box flexDirection="column" padding={1} width="100%">
            <Box borderStyle="round" paddingX={1} marginBottom={1} width="100%">
                <Text bold>MCR Performance Dashboard & Database Explorer</Text>
                <Box flexGrow={1} />
                <Text>(Press 'Esc' to go back, Ctrl+C to exit)</Text>
            </Box>

            {view === 'listStrategies' && (
                <Box flexDirection="column">
                    <Text bold>Select a Strategy Hash to View Runs:</Text>
                    {uniqueStrategies.length > 0 ? (
                        <SelectInput items={uniqueStrategies} onSelect={handleStrategySelect} />
                    ) : (
                        <Text>No strategies found.</Text>
                    )}
                </Box>
            )}

            {view === 'viewStrategyRuns' && selectedStrategyHash && (
                <Box flexDirection="column">
                    <Text bold>Runs for Strategy: {selectedStrategyHash}</Text>
                    <Text italic>(Showing last 20 runs. Select a run to see details.)</Text>
                    {strategyRuns.length > 0 ? (
                        // Creating a selectable list for runs
                        <SelectInput
                            items={strategyRuns.map(run => ({
                                label: `ID: ${run.id} | Example: ${run.example_id} | LLM: ${run.llm_model_id} | Latency: ${run.latency_ms}ms | Time: ${run.timestamp}`,
                                value: run.id // Use unique run ID as value
                            }))}
                            onSelect={(selectedItem) => {
                                const fullRun = strategyRuns.find(r => r.id === selectedItem.value);
                                if (fullRun) handleRunSelect(fullRun);
                            }}
                        />
                    ) : (
                        <Text>No runs to display for this strategy.</Text>
                    )}
                </Box>
            )}

            {view === 'viewRunDetails' && selectedRun && (
                <Box flexDirection="column" borderStyle="single" padding={1}>
                    <Text bold>Run ID: {selectedRun.id}</Text>
                    <Text>Strategy Hash: {selectedStrategyHash}</Text>
                    <Text>Example ID: {selectedRun.example_id}</Text>
                    <Text>LLM Model: {selectedRun.llm_model_id || 'N/A'}</Text>
                    <Text>Timestamp: {selectedRun.timestamp}</Text>
                    <Text>Latency: {selectedRun.latency_ms} ms</Text>
                    <Box marginTop={1}>
                        <Text bold>Metrics:</Text>
                        {Object.entries(selectedRun.metrics).map(([key, value]) => (
                            <Text key={key}>  {key}: {String(value)}</Text>
                        ))}
                    </Box>
                    <Box marginTop={1}>
                        <Text bold>Cost:</Text>
                        {selectedRun.cost ? Object.entries(selectedRun.cost).map(([key, value]) => (
                            <Text key={key}>  {key}: {String(value)}</Text>
                        )) : <Text> N/A</Text>}
                    </Box>
                     <Box marginTop={1} flexDirection="column">
                        <Text bold>Raw Output:</Text>
                        <Box borderStyle="round" padding={1} width="100%">
                           <Text>{String(selectedRun.raw_output).substring(0, 1000) + (String(selectedRun.raw_output).length > 1000 ? '...' : '')}</Text>
                        </Box>
                    </Box>
                </Box>
            )}
        </Box>
    );
};

const runEvaluatorTui = () => {
    const { unmount } = render(React.createElement(App));
    // Ink handles Ctrl+C for unmounting by default.
    // We need to ensure the DB connection is closed on exit.
    // The App component's useEffect cleanup handles this.
};

module.exports = { runEvaluatorTui };
