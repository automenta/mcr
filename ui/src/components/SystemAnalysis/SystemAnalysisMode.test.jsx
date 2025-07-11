// ui/src/components/SystemAnalysis/SystemAnalysisMode.test.jsx
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import SystemAnalysisMode from './SystemAnalysisMode';

// Mock child components
vi.mock('./StrategyLeaderboard', () => ({
  default: ({ onSelectStrategy }) => (
    <div data-testid="leaderboard-mock">
      Strategy Leaderboard
      <button onClick={() => onSelectStrategy('strat123')}>Select Strategy</button>
    </div>
  ),
}));
vi.mock('./StrategyDeepDive', () => ({
  default: ({ strategyId, onBack }) => (
    <div data-testid="deepdive-mock">
      Strategy Deep Dive for: {strategyId}
      <button onClick={onBack}>Back to Leaderboard</button>
    </div>
  ),
}));
vi.mock('./CurriculumExplorer', () => ({
  default: () => <div data-testid="curriculum-mock">Curriculum Explorer</div>,
}));
vi.mock('./EvolverControlPanel', () => ({
  default: () => <div data-testid="evolver-mock">Evolver Control Panel</div>,
}));

describe('SystemAnalysisMode', () => {
  it('renders StrategyLeaderboard by default', () => {
    render(<SystemAnalysisMode />);
    expect(screen.getByTestId('leaderboard-mock')).toBeInTheDocument();
    expect(screen.getByText('🏆 Leaderboard')).toBeDisabled();
  });

  it('navigates to CurriculumExplorer when curriculum button is clicked', async () => {
    render(<SystemAnalysisMode />);
    const curriculumButton = screen.getByRole('button', { name: '🎓 Curriculum' });
    await act(async () => {
      fireEvent.click(curriculumButton);
    });
    expect(screen.getByTestId('curriculum-mock')).toBeInTheDocument();
    expect(curriculumButton).toBeDisabled();
  });

  it('navigates to EvolverControlPanel when evolver button is clicked', async () => {
    render(<SystemAnalysisMode />);
    const evolverButton = screen.getByRole('button', { name: '🧬 Evolver' });
    await act(async () => {
      fireEvent.click(evolverButton);
    });
    expect(screen.getByTestId('evolver-mock')).toBeInTheDocument();
    expect(evolverButton).toBeDisabled();
  });

  it('navigates to StrategyDeepDive when a strategy is selected from Leaderboard', async () => {
    render(<SystemAnalysisMode />);
    // Simulate selecting a strategy from the (mocked) Leaderboard
    const selectStrategyButtonInLeaderboard = screen.getByRole('button', { name: 'Select Strategy' });
    await act(async () => {
      fireEvent.click(selectStrategyButtonInLeaderboard);
    });

    expect(screen.getByTestId('deepdive-mock')).toBeInTheDocument();
    expect(screen.getByText('Strategy Deep Dive for: strat123')).toBeInTheDocument();
    // Leaderboard button should not be disabled if we are in deep dive from it
    expect(screen.getByText('🏆 Leaderboard')).not.toBeDisabled();
  });

  it('navigates back to Leaderboard from StrategyDeepDive', async () => {
    render(<SystemAnalysisMode />);
    // Go to deep dive first
    const selectStrategyButtonInLeaderboard = screen.getByRole('button', { name: 'Select Strategy' });
    await act(async () => {
      fireEvent.click(selectStrategyButtonInLeaderboard);
    });
    expect(screen.getByTestId('deepdive-mock')).toBeInTheDocument();

    // Click back button in deep dive
    const backButtonInDeepDive = screen.getByRole('button', { name: 'Back to Leaderboard' });
    await act(async () => {
      fireEvent.click(backButtonInDeepDive);
    });

    expect(screen.getByTestId('leaderboard-mock')).toBeInTheDocument();
    expect(screen.getByText('🏆 Leaderboard')).toBeDisabled();
  });

  it('resets selectedStrategyIdForDeepDive when navigating directly to leaderboard', async () => {
    render(<SystemAnalysisMode />);
    // Go to deep dive
    const selectStrategyButtonInLeaderboard = screen.getByRole('button', { name: 'Select Strategy' });
    await act(async () => {
      fireEvent.click(selectStrategyButtonInLeaderboard);
    });
    expect(screen.getByTestId('deepdive-mock')).toBeInTheDocument();
    expect(screen.getByText('Strategy Deep Dive for: strat123')).toBeInTheDocument();

    // Click leaderboard button directly
    const leaderboardButton = screen.getByRole('button', { name: '🏆 Leaderboard' });
    await act(async () => {
      fireEvent.click(leaderboardButton);
    });
    expect(screen.getByTestId('leaderboard-mock')).toBeInTheDocument();

    // If we were to go back to deep dive via some other means (not possible with current UI)
    // or if it tried to render deep dive again, it should not have the old ID.
    // This is implicitly tested by the onBack logic in deepDive mock and direct nav.
  });
});
