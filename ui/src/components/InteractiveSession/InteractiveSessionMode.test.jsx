// ui/src/components/InteractiveSession/InteractiveSessionMode.test.jsx
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import InteractiveSessionMode from './InteractiveSessionMode';

// Mock child components
vi.mock('./LeftSidebar', () => ({
  default: (props) => <div data-testid="left-sidebar-mock">{JSON.stringify(props)}</div>,
}));
vi.mock('./MainInteraction', () => ({
  default: (props) => <div data-testid="main-interaction-mock">{JSON.stringify(props)}</div>,
}));
vi.mock('./RightSidebar', () => ({
  default: (props) => <div data-testid="right-sidebar-mock">{JSON.stringify(props)}</div>,
}));

describe('InteractiveSessionMode', () => {
  const defaultProps = {
    sessionId: 'test-sid',
    setSessionId: vi.fn(),
    activeStrategy: 'strategy-1',
    setActiveStrategy: vi.fn(),
    currentKb: 'fact(a). fact(b).',
    setCurrentKb: vi.fn(),
    connectSession: vi.fn(),
    disconnectSession: vi.fn(),
    isMcrSessionActive: true,
    isWsServiceConnected: true,
    addMessageToHistory: vi.fn(),
    chatHistory: [{ type: 'user', text: 'Hello' }],
    fetchActiveStrategy: vi.fn(),
    fetchCurrentKb: vi.fn(),
  };

  it('renders all child components', () => {
    render(<InteractiveSessionMode {...defaultProps} />);
    expect(screen.getByTestId('left-sidebar-mock')).toBeInTheDocument();
    expect(screen.getByTestId('main-interaction-mock')).toBeInTheDocument();
    expect(screen.getByTestId('right-sidebar-mock')).toBeInTheDocument();
  });

  it('passes correct props to LeftSidebar', () => {
    render(<InteractiveSessionMode {...defaultProps} />);
    const leftSidebar = screen.getByTestId('left-sidebar-mock');
    const props = JSON.parse(leftSidebar.textContent);

    expect(props.sessionId).toBe(defaultProps.sessionId);
    expect(props.activeStrategy).toBe(defaultProps.activeStrategy);
    // Check for functions by their presence (mocked functions are just empty objects in JSON)
    expect(props).toHaveProperty('setActiveStrategy');
    expect(props).toHaveProperty('connectSession');
    expect(props).toHaveProperty('disconnectSession');
    expect(props.isMcrSessionActive).toBe(defaultProps.isMcrSessionActive);
    expect(props.isWsServiceConnected).toBe(defaultProps.isWsServiceConnected);
    expect(props).toHaveProperty('addMessageToHistory');
  });

  it('passes correct props to MainInteraction', () => {
    render(<InteractiveSessionMode {...defaultProps} />);
    const mainInteraction = screen.getByTestId('main-interaction-mock');
    const props = JSON.parse(mainInteraction.textContent);

    expect(props.sessionId).toBe(defaultProps.sessionId);
    expect(props.isMcrSessionActive).toBe(defaultProps.isMcrSessionActive);
    expect(props.isWsServiceConnected).toBe(defaultProps.isWsServiceConnected);
    expect(props).toHaveProperty('addMessageToHistory');
    expect(props.chatHistory).toEqual(defaultProps.chatHistory);
  });

  it('passes correct props to RightSidebar', () => {
    render(<InteractiveSessionMode {...defaultProps} />);
    const rightSidebar = screen.getByTestId('right-sidebar-mock');
    const props = JSON.parse(rightSidebar.textContent);

    expect(props.knowledgeBase).toBe(defaultProps.currentKb);
    expect(props.isMcrSessionActive).toBe(defaultProps.isMcrSessionActive);
    expect(props.sessionId).toBe(defaultProps.sessionId);
    expect(props).toHaveProperty('fetchCurrentKb');
    expect(props).toHaveProperty('addMessageToHistory');
    expect(props).toHaveProperty('setCurrentKb');
  });

  // Regarding potentially unused props:
  // - setSessionId: Not directly passed to children here. App.jsx uses it in connectSession.
  // - fetchActiveStrategy: Not directly passed to children here.
  // If these props are truly unused by this component or its direct children,
  // they could be removed from InteractiveSessionMode's prop list,
  // but that depends on whether App.jsx needs to pass them *through* this component
  // for deeper children not directly rendered by InteractiveSessionMode.
  // For now, the test just confirms what IS passed.
});
