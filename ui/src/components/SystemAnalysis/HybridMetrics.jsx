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
  PieChart,
  Pie,
  Cell,
} from 'recharts';

const mockEmbeddingSimilarityData = [
  { name: '0.0-0.1', value: 5 },
  { name: '0.1-0.2', value: 10 },
  { name: '0.2-0.3', value: 15 },
  { name: '0.3-0.4', value: 25 },
  { name: '0.4-0.5', value: 30 },
  { name: '0.5-0.6', value: 40 },
  { name: '0.6-0.7', value: 50 },
  { name: '0.7-0.8', value: 60 },
  { name: '0.8-0.9', value: 70 },
  { name: '0.9-1.0', value: 80 },
];

const mockProbabilityDistributionData = [
  { name: 'Hypothesis 1', value: 0.9 },
  { name: 'Hypothesis 2', value: 0.8 },
  { name: 'Hypothesis 3', value: 0.7 },
  { name: 'Hypothesis 4', value: 0.6 },
];

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042'];

const HybridMetrics = () => {
  return (
    <div>
      <h2>Hybrid Metrics</h2>
      <div style={{ marginBottom: '50px' }}>
        <h3>Embedding Similarity Histogram</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={mockEmbeddingSimilarityData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Bar dataKey="value" fill="#8884d8" />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div>
        <h3>Probability Distribution</h3>
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={mockProbabilityDistributionData}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={({ name, percent }) =>
                `${name}: ${(percent * 100).toFixed(0)}%`
              }
              outerRadius={80}
              fill="#8884d8"
              dataKey="value"
            >
              {mockProbabilityDistributionData.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={COLORS[index % COLORS.length]}
                />
              ))}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default HybridMetrics;
