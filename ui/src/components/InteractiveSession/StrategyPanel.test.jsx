// ui/src/components/InteractiveSession/StrategyPanel.test.jsx
import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import StrategyPanel from './StrategyPanel';
import apiService from '../../apiService';

vi.mock('../../apiService');
vi.mock('../Modal', () => ({
  default: ({ isOpen, onClose, title, children }) => isOpen ? (
    <div data-testid="modal-mock">
      <h2>{title}</h2>
      <button onClick={onClose}>Close Modal</button>
      {children}
    </div>
  ) : null,
}));

// Mock global alert
global.alert = vi.fn();
// Cache-busting comment
describe('StrategyPanel', () => {
  const mockAddMessageToHistory = vi.fn();
  const mockSetActiveStrategy = vi.fn();
  const defaultProps = {
    sessionId: 'test-sid',
    activeStrategy: null,
    setActiveStrategy: mockSetActiveStrategy,
    isMcrSessionActive: true,
    isWsServiceConnected: true,
    addMessageToHistory: mockAddMessageToHistory,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    apiService.invokeTool.mockImplementation(async (toolName, params) => {
      if (toolName === 'strategy.list') return { success: true, data: [] };
      if (toolName === 'strategy.setActive') return { success: true, data: { activeStrategyId: params.strategyId } };
      return { success: true, data: {} };
    });
  });

  it('renders panel title, list button and active strategy display', async () => {
    await act(async () => {
      render(<StrategyPanel {...defaultProps} activeStrategy="current-active-strat" />);
    });
    expect(screen.getByText('🛠️ Strategies')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '🔄 List Strategies' })).toBeInTheDocument();
    const activeStrategyDisplay = screen.getByText(/🎯 Active:/);
    expect(activeStrategyDisplay).toBeInTheDocument();
    expect(activeStrategyDisplay.querySelector('strong')).toHaveTextContent('current-active-strat');
  });

  it('lists strategies on mount if session is active', async () => {
    const strategiesData = [{ id: 's1', name: 'Strategy Alpha', description: 'Alpha desc' }];
    apiService.invokeTool.mockImplementation(async (toolName) =>
      toolName === 'strategy.list' ? { success: true, data: strategiesData } : { success: true, data: {} }
    );
    await act(async () => {
      render(<StrategyPanel {...defaultProps} />);
    });
    await waitFor(() => expect(screen.getByText('Strategy Alpha')).toBeInTheDocument());
    expect(apiService.invokeTool).toHaveBeenCalledWith('strategy.list');
  });

  it('displays "No strategies found" when list is empty and session active', async () => {
    apiService.invokeTool.mockResolvedValue({ success: true, data: [] });
    await act(async () => {
      render(<StrategyPanel {...defaultProps} />);
    });
    await waitFor(() => expect(screen.getByText(/No strategies found/i)).toBeInTheDocument());
  });


  it('can view strategy details in a modal', async () => {
    const strategyData = { id: 's1', name: 'Strategy Alpha', description: 'Alpha strategy description.', definition: { some: 'detail' }};
    apiService.invokeTool.mockResolvedValueOnce({ success: true, data: [strategyData] }); // For list

    await act(async () => {
      render(<StrategyPanel {...defaultProps} />);
    });
    await waitFor(() => screen.getByText('Strategy Alpha'));

    const viewButton = screen.getByRole('button', { name: '👁️ View' });
    await act(async () => {
      fireEvent.click(viewButton);
    });

    await waitFor(() => expect(screen.getByTestId('modal-mock')).toBeInTheDocument());
    expect(screen.getByText('🛠️ Strategy: Strategy Alpha')).toBeInTheDocument();
    expect(screen.getByText(strategyData.description)).toBeInTheDocument();

    const modalContent = screen.getByTestId('modal-mock');
    const preElement = modalContent.querySelector('pre');
    expect(preElement).toBeInTheDocument();
    expect(preElement.textContent).toBe(JSON.stringify(strategyData.definition, null, 2));
  });

  it('can set an active strategy', async () => {
    const strategiesData = [
      { id: 's1', name: 'Strategy Alpha' },
      { id: 's2', name: 'Strategy Beta' }
    ];
    apiService.invokeTool.mockImplementation(async (toolName, params) => {
      if (toolName === 'strategy.list') return { success: true, data: strategiesData };
      if (toolName === 'strategy.setActive' && params.strategyId === 's2') {
        return { success: true, data: { activeStrategyId: 's2' } };
      }
      return { success: true, data: {} };
    });

    await act(async () => {
      render(<StrategyPanel {...defaultProps} activeStrategy="s1" />);
    });
    await waitFor(() => screen.getByText('Strategy Beta'));

    const strategyBetaItem = screen.getByText('Strategy Beta').closest('li');
    const setButton = strategyBetaItem.querySelector('button[title="Set as Active Strategy"]');

    await act(async () => {
      fireEvent.click(setButton);
    });

    expect(apiService.invokeTool).toHaveBeenCalledWith('strategy.setActive', { strategyId: 's2' });
    expect(mockSetActiveStrategy).toHaveBeenCalledWith('s2');
    expect(mockAddMessageToHistory).toHaveBeenCalledWith(expect.objectContaining({
      text: '✅ Strategy set to s2'
    }));
  });

  it('shows "✅ Active" for the currently active strategy and disables its set button', async () => {
    const strategiesData = [{ id: 's1', name: 'Strategy Alpha' }];
    apiService.invokeTool.mockResolvedValueOnce({ success: true, data: strategiesData });

    await act(async () => {
      render(<StrategyPanel {...defaultProps} activeStrategy="s1" />);
    });
    await waitFor(() => screen.getByText('Strategy Alpha'));

    const strategyAlphaItem = screen.getByText('Strategy Alpha').closest('li');
    const setButton = strategyAlphaItem.querySelector('button[title="Set as Active Strategy"]');
    expect(setButton).toHaveTextContent('✅ Active');
    expect(setButton).toBeDisabled();
  });

  it('disables buttons if MCR session is not active', async () => {
    await act(async () => {
      render(<StrategyPanel {...defaultProps} isMcrSessionActive={false} />);
    });
    expect(screen.getByRole('button', {name: '🔄 List Strategies'})).toBeDisabled();
  });

  it('disables buttons if WebSocket service is not connected', async () => {
    await act(async () => {
      render(<StrategyPanel {...defaultProps} isWsServiceConnected={false} />);
    });
    expect(screen.getByRole('button', {name: '🔄 List Strategies'})).toBeDisabled();
  });

  it('handles API error when listing strategies', async () => {
    apiService.invokeTool.mockResolvedValueOnce({ success: false, message: 'Failed to list strategies' });
    await act(async () => {
      render(<StrategyPanel {...defaultProps} />);
    });
    await waitFor(() => expect(mockAddMessageToHistory).toHaveBeenCalledWith(expect.objectContaining({
        text: "❌ Error listing strategies: Failed to list strategies"
    })));
  });
});
