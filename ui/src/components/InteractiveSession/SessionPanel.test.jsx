// ui/src/components/InteractiveSession/SessionPanel.test.jsx
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import SessionPanel from './SessionPanel';

describe('SessionPanel', () => {
  const mockConnectSession = vi.fn();
  const mockDisconnectSession = vi.fn();

  const defaultProps = {
    initialSessionId: null,
    connectSession: mockConnectSession,
    disconnectSession: mockDisconnectSession,
    isMcrSessionActive: false,
    isWsServiceConnected: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders connect input and button when not in MCR session', () => {
    render(<SessionPanel {...defaultProps} />);
    expect(screen.getByPlaceholderText('Session ID (optional)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '🟢 Connect' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '🔴 Disconnect' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Active Session:/)).not.toBeInTheDocument();
  });

  it('renders disconnect button and active session ID when in MCR session', () => {
    render(<SessionPanel {...defaultProps} initialSessionId="sid-xyz" isMcrSessionActive={true} />);
    expect(screen.getByPlaceholderText('Session ID (optional)')).toBeDisabled();
    expect(screen.getByRole('button', { name: '🔴 Disconnect' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '🟢 Connect' })).not.toBeInTheDocument();
    expect(screen.getByText('🔑 Active Session: sid-xyz')).toBeInTheDocument();
  });

  it('calls connectSession with the typed session ID when connect button is clicked', async () => {
    render(<SessionPanel {...defaultProps} />);
    const input = screen.getByPlaceholderText('Session ID (optional)');
    const connectButton = screen.getByRole('button', { name: '🟢 Connect' });

    await act(async () => {
      fireEvent.change(input, { target: { value: 'test-session-id' } });
      fireEvent.click(connectButton);
    });

    expect(mockConnectSession).toHaveBeenCalledWith('test-session-id');
  });

  it('calls connectSession with no arguments if session ID input is empty', async () => {
    render(<SessionPanel {...defaultProps} />);
    const connectButton = screen.getByRole('button', { name: '🟢 Connect' });

    await act(async () => {
      fireEvent.click(connectButton);
    });
    expect(mockConnectSession).toHaveBeenCalledWith();
  });

  it('calls connectSession with no arguments if session ID input is only whitespace', async () => {
    render(<SessionPanel {...defaultProps} />);
    const input = screen.getByPlaceholderText('Session ID (optional)');
    const connectButton = screen.getByRole('button', { name: '🟢 Connect' });

    await act(async () => {
      fireEvent.change(input, { target: { value: '   ' } });
      fireEvent.click(connectButton);
    });
    expect(mockConnectSession).toHaveBeenCalledWith(); // connectSession() handles trimming or creating new
  });


  it('calls disconnectSession when disconnect button is clicked', async () => {
    render(<SessionPanel {...defaultProps} initialSessionId="sid-xyz" isMcrSessionActive={true} />);
    const disconnectButton = screen.getByRole('button', { name: '🔴 Disconnect' });

    await act(async () => {
      fireEvent.click(disconnectButton);
    });
    expect(mockDisconnectSession).toHaveBeenCalled();
  });

  it('disables connect button and input if WS not connected AND not in MCR session', () => {
    // Test when not in MCR session
    render(<SessionPanel {...defaultProps} isWsServiceConnected={false} />);
    expect(screen.getByPlaceholderText('Session ID (optional)')).toBeDisabled();
    expect(screen.getByRole('button', { name: '🟢 Connect' })).toBeDisabled();
  });

  it('disables disconnect button and input if WS not connected AND in MCR session', () => {
    // Test when in MCR session
    render(
      <SessionPanel
        {...defaultProps}
        initialSessionId="sid-xyz"
        isMcrSessionActive={true}
        isWsServiceConnected={false}
      />
    );
    expect(screen.getByPlaceholderText('Session ID (optional)')).toBeDisabled();
    expect(screen.getByRole('button', { name: '🔴 Disconnect' })).toBeDisabled();
  });

  it('updates input field when initialSessionId prop changes', () => {
    const { rerender } = render(<SessionPanel {...defaultProps} initialSessionId="first-id" />);
    const input = screen.getByPlaceholderText('Session ID (optional)');
    expect(input.value).toBe('first-id');

    rerender(<SessionPanel {...defaultProps} initialSessionId="second-id" />);
    expect(input.value).toBe('second-id');

    rerender(<SessionPanel {...defaultProps} initialSessionId={null} />);
    expect(input.value).toBe('');
  });
});
