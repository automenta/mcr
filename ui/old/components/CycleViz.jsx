import React from 'react';
import {
	BarChart,
	Bar,
	XAxis,
	YAxis,
	CartesianGrid,
	Tooltip,
	Legend,
	ResponsiveContainer,
} from 'recharts';
import './CycleViz.css';

const CycleViz = ({ debugInfo }) => {
	if (!debugInfo) return null;

	const { loopInfo, probabilities, nlToLogicLoopHistory } = debugInfo;

	return (
		<div className="cycle-viz">
			<h4>Refinement Loop Details</h4>
			{loopInfo && <p>Loop Iterations: {loopInfo.nlToLogicLoopIterations}</p>}
			{probabilities && (
				<div>
					<p>Probabilities:</p>
					<ResponsiveContainer width="100%" height={100}>
						<BarChart
							data={probabilities.map((p, i) => ({
								name: `H${i}`,
								probability: p,
							}))}
						>
							<CartesianGrid strokeDasharray="3 3" />
							<XAxis dataKey="name" />
							<YAxis />
							<Tooltip />
							<Legend />
							<Bar dataKey="probability" fill="#8884d8" />
						</BarChart>
					</ResponsiveContainer>
				</div>
			)}
			{nlToLogicLoopHistory && nlToLogicLoopHistory.length > 0 && (
				<div className="loop-history">
					<h5>Loop History</h5>
					{nlToLogicLoopHistory.map((item, index) => (
						<div key={index} className="loop-history-item">
							<p>
								<strong>Iteration {item.iteration}:</strong> {item.error}
							</p>
						</div>
					))}
				</div>
			)}
		</div>
	);
};

export default CycleViz;
