import React, { useState, useEffect } from 'react';
import apiService from '../apiService';

const StrategySelector = ({ activeStrategy, setActiveStrategy }) => {
  const [strategies, setStrategies] = useState([]);

  useEffect(() => {
    const fetchStrategies = async () => {
      try {
        const response = await apiService.invokeTool('strategy.list');
        if (response.success) {
          setStrategies(response.data);
        } else {
          console.error('Failed to fetch strategies:', response.message);
        }
      } catch (error) {
        console.error('Error fetching strategies:', error);
      }
    };
    fetchStrategies();
  }, []);

  const handleChange = async (event) => {
    const newStrategy = event.target.value;
    try {
      const response = await apiService.invokeTool('strategy.setActive', { strategyId: newStrategy });
      if (response.success) {
        setActiveStrategy(newStrategy);
      } else {
        console.error('Failed to set active strategy:', response.message);
      }
    } catch (error) {
      console.error('Error setting active strategy:', error);
    }
  };

  return (
    <div className="strategy-selector">
      <select value={activeStrategy || ''} onChange={handleChange}>
        <option value="" disabled>Select a strategy</option>
        {strategies.map((strategy) => (
          <option key={strategy.id} value={strategy.id}>
            {strategy.id}
          </option>
        ))}
      </select>
    </div>
  );
};

export default StrategySelector;
