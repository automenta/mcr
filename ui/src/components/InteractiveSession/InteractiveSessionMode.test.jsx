// ui/src/components/InteractiveSession/InteractiveSessionMode.test.jsx
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest'; // Added beforeEach
import InteractiveSessionMode from './InteractiveSessionMode';

// Mock child components
vi.mock('./LeftSidebar', () => {
  const MockComponent = vi.fn((props) => <div data-testid="left-sidebar-mock" data-props={JSON.stringify(props)} />);
  return { default: MockComponent };
});
vi.mock('./MainInteraction', () => {
  const MockComponent = vi.fn((props) => <div data-testid="main-interaction-mock" data-props={JSON.stringify(props)} />);
  return { default: MockComponent };
});
vi.mock('./RightSidebar', () => {
  const MockComponent = vi.fn((props) => <div data-testid="right-sidebar-mock" data-props={JSON.stringify(props)} />);
  return { default: MockComponent };
});

// Import AFTER mocks
import LeftSidebar from './LeftSidebar';
import MainInteraction from './MainInteraction';
import RightSidebar from './RightSidebar';

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
    // fetchActiveStrategy: vi.fn(), // This was correctly identified as unused
    fetchCurrentKb: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks(); // Clear mocks before each test
  });

  it('renders all child components', () => {
    render(<InteractiveSessionMode {...defaultProps} />);
    expect(screen.getByTestId('left-sidebar-mock')).toBeInTheDocument();
    expect(screen.getByTestId('main-interaction-mock')).toBeInTheDocument();
    expect(screen.getByTestId('right-sidebar-mock')).toBeInTheDocument();

    expect(LeftSidebar).toHaveBeenCalledTimes(1);
    expect(MainInteraction).toHaveBeenCalledTimes(1);
    expect(RightSidebar).toHaveBeenCalledTimes(1);
  });

  it('passes correct props to LeftSidebar', () => {
    render(<InteractiveSessionMode {...defaultProps} />);
    expect(LeftSidebar).toHaveBeenCalled();
    const props = vi.mocked(LeftSidebar).mock.lastCall[0];

    expect(props.sessionId).toBe(defaultProps.sessionId);
    expect(props.activeStrategy).toBe(defaultProps.activeStrategy);
    expect(props.setActiveStrategy).toEqual(expect.any(Function));
    expect(props.connectSession).toEqual(expect.any(Function));
    expect(props.disconnectSession).toEqual(expect.any(Function));
    expect(props.isMcrSessionActive).toBe(defaultProps.isMcrSessionActive);
    expect(props.isWsServiceConnected).toBe(defaultProps.isWsServiceConnected);
    expect(props.addMessageToHistory).toEqual(expect.any(Function));
  });

  it('passes correct props to MainInteraction', () => {
    render(<InteractiveSessionMode {...defaultProps} />);
    expect(MainInteraction).toHaveBeenCalled();
    const props = vi.mocked(MainInteraction).mock.lastCall[0];

    expect(props.sessionId).toBe(defaultProps.sessionId);
    expect(props.isMcrSessionActive).toBe(defaultProps.isMcrSessionActive);
    expect(props.isWsServiceConnected).toBe(defaultProps.isWsServiceConnected);
    expect(props.addMessageToHistory).toEqual(expect.any(Function));
    expect(props.chatHistory).toEqual(defaultProps.chatHistory);
  });

  it('passes correct props to RightSidebar', () => {
    render(<InteractiveSessionMode {...defaultProps} />);
    expect(RightSidebar).toHaveBeenCalled();
    const props = vi.mocked(RightSidebar).mock.lastCall[0];

    expect(props.knowledgeBase).toBe(defaultProps.currentKb);
    expect(props.isMcrSessionActive).toBe(defaultProps.isMcrSessionActive);
    expect(props.sessionId).toBe(defaultProps.sessionId);
    expect(props.fetchCurrentKb).toEqual(expect.any(Function));
    expect(props.addMessageToHistory).toEqual(expect.any(Function));
    expect(props.setCurrentKb).toEqual(expect.any(Function));
  });
});
