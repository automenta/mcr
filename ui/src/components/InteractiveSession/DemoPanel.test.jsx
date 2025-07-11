// ui/src/components/InteractiveSession/DemoPanel.test.jsx
import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import DemoPanel from './DemoPanel';
import apiService from '../../apiService';

vi.mock('../../apiService');

// Mock global alert
global.alert = vi.fn();

describe('DemoPanel', () => {
  const mockAddMessageToHistory = vi.fn();
  const defaultProps = {
    sessionId: 'test-sid',
    isMcrSessionActive: true,
    isWsServiceConnected: true,
    addMessageToHistory: mockAddMessageToHistory,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    apiService.invokeTool.mockImplementation(async (toolName, _params) => { // Prefixed params
      if (toolName === 'demo.list') return { success: true, data: [] };
      if (toolName === 'demo.run') return { success: true, data: { trace: 'Demo run trace' }, message: "Demo run success" };
      return { success: true, data: {} };
    });
  });

  it('renders panel title and list button', () => {
    render(<DemoPanel {...defaultProps} />);
    expect(screen.getByText('🚀 Demos')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '🔄 List Demos' })).toBeInTheDocument();
  });

  it('lists demos on mount if session is active', async () => {
    const demosData = [{ id: 'demo1', name: 'First Demo', description: 'A cool demo.' }];
    apiService.invokeTool.mockImplementation(async (toolName) =>
      toolName === 'demo.list' ? { success: true, data: demosData } : { success: true, data: {} }
    );
    render(<DemoPanel {...defaultProps} />);
    await waitFor(() => expect(screen.getByText('First Demo')).toBeInTheDocument());
    expect(screen.getByText('A cool demo.')).toBeInTheDocument();
    expect(apiService.invokeTool).toHaveBeenCalledWith('demo.list');
  });

  it('displays "No demos found" when list is empty and session active', async () => {
    apiService.invokeTool.mockResolvedValue({ success: true, data: [] });
    render(<DemoPanel {...defaultProps} />);
    await waitFor(() => expect(screen.getByText(/No demos found/i)).toBeInTheDocument());
  });

  it('can run a demo', async () => {
    const demosData = [{ id: 'demo1', name: 'First Demo' }];
    apiService.invokeTool.mockImplementation(async (toolName, params) => {
      if (toolName === 'demo.list') return { success: true, data: demosData };
      if (toolName === 'demo.run' && params.demoId === 'demo1') {
        return { success: true, data: { log: "Demo output" }, message: "Demo completed" };
      }
      return { success: true, data: {} };
    });

    render(<DemoPanel {...defaultProps} />);
    await waitFor(() => screen.getByText('First Demo'));

    const runButton = screen.getByRole('button', { name: '▶️ Run' });
    await act(async () => {
      fireEvent.click(runButton);
    });

    expect(apiService.invokeTool).toHaveBeenCalledWith('demo.run', { demoId: 'demo1', sessionId: defaultProps.sessionId });
    expect(mockAddMessageToHistory).toHaveBeenCalledWith(expect.objectContaining({
      type: 'system',
      text: '🚀 Attempting to run demo: demo1...'
    }));
    expect(mockAddMessageToHistory).toHaveBeenCalledWith(expect.objectContaining({
      type: 'mcr',
      isDemo: true,
      text: expect.stringContaining("Demo 'demo1' run attempt completed. Success: true. Demo completed")
    }));
  });

  it('alerts and does not run demo if session not active when trying to run', async () => {
    const demosData = [{ id: 'demo1', name: 'First Demo' }];
    apiService.invokeTool.mockResolvedValueOnce({ success: true, data: demosData }); // For demo.list

    render(<DemoPanel {...defaultProps} isMcrSessionActive={false} sessionId={null} />);
    await waitFor(() => screen.getByText('First Demo'));

    const runButton = screen.getByRole('button', { name: '▶️ Run' });
    await act(async () => {
      fireEvent.click(runButton);
    });

    expect(global.alert).toHaveBeenCalledWith("Connect to a session and ensure WebSocket is active first.");
    expect(apiService.invokeTool).not.toHaveBeenCalledWith('demo.run', expect.anything());
  });

  it('disables buttons if MCR session is not active', async () => {
    render(<DemoPanel {...defaultProps} isMcrSessionActive={false} />);
    await act(async () => {});
    expect(screen.getByRole('button', {name: '🔄 List Demos'})).toBeDisabled();
  });

  it('disables buttons if WebSocket service is not connected', async () => {
    render(<DemoPanel {...defaultProps} isWsServiceConnected={false} />);
    await act(async () => {});
    expect(screen.getByRole('button', {name: '🔄 List Demos'})).toBeDisabled();
  });

  it('handles API error when listing demos', async () => {
    apiService.invokeTool.mockResolvedValueOnce({ success: false, message: 'Failed to list demos' });
    render(<DemoPanel {...defaultProps} />);
    await waitFor(() => expect(mockAddMessageToHistory).toHaveBeenCalledWith(expect.objectContaining({
        text: "Error listing demos: Failed to list demos"
    })));
  });
});
