// ui/src/components/InteractiveSession/LeftSidebar.test.jsx
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import LeftSidebar from './LeftSidebar';
import apiService from '../../apiService'; // Mocked via setup

// Mock child components & allow prop inspection
vi.mock('../../apiService');

vi.mock('./SessionPanel', () => {
  const MockComponent = vi.fn((props) => <div data-testid="session-panel-mock" data-props={JSON.stringify(props)} />);
  return { default: MockComponent };
});
vi.mock('./OntologyPanel', () => {
  const MockComponent = vi.fn((props) => <div data-testid="ontology-panel-mock" data-props={JSON.stringify(props)} />);
  return { default: MockComponent };
});
vi.mock('./DemoPanel', () => {
  const MockComponent = vi.fn((props) => <div data-testid="demo-panel-mock" data-props={JSON.stringify(props)} />);
  return { default: MockComponent };
});
vi.mock('./StrategyPanel', () => {
  const MockComponent = vi.fn((props) => <div data-testid="strategy-panel-mock" data-props={JSON.stringify(props)} />);
  return { default: MockComponent };
});
vi.mock('../DirectAssertionEditor', () => {
  const MockComponent = vi.fn((props) => <div data-testid="direct-assertion-editor-mock" data-props={JSON.stringify(props)} />);
  return { default: MockComponent };
});

// These are no longer directly used by LeftSidebar, but keep mocks simple if they were indirectly pulled
vi.mock('../Modal', () => ({ default: () => null }));
vi.mock('../PrologCodeViewer', () => ({ default: () => null }));

// Import AFTER mocks
import SessionPanel from './SessionPanel';
import OntologyPanel from './OntologyPanel';
import DemoPanel from './DemoPanel';
import StrategyPanel from './StrategyPanel';
import DirectAssertionEditor from '../DirectAssertionEditor';


describe('LeftSidebar', () => {
  const mockAddMessageToHistory = vi.fn();
  const mockSetActiveStrategy = vi.fn();
  const mockConnectSession = vi.fn();
  const mockDisconnectSession = vi.fn();

  const defaultProps = {
    sessionId: null,
    activeStrategy: null,
    setActiveStrategy: mockSetActiveStrategy,
    connectSession: mockConnectSession,
    disconnectSession: mockDisconnectSession,
    isMcrSessionActive: false,
    isWsServiceConnected: true,
    addMessageToHistory: mockAddMessageToHistory,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders main sections and child panels', () => {
    render(<LeftSidebar {...defaultProps} />);
    expect(screen.getByText('⚙️ Config & Context')).toBeInTheDocument();
    expect(screen.getByTestId('session-panel-mock')).toBeInTheDocument();
    expect(screen.getByTestId('ontology-panel-mock')).toBeInTheDocument();
    expect(screen.getByTestId('demo-panel-mock')).toBeInTheDocument();
    expect(screen.getByTestId('strategy-panel-mock')).toBeInTheDocument();
    expect(screen.getByTestId('direct-assertion-editor-mock')).toBeInTheDocument();

    expect(SessionPanel).toHaveBeenCalledTimes(1);
    expect(OntologyPanel).toHaveBeenCalledTimes(1);
    expect(DemoPanel).toHaveBeenCalledTimes(1);
    expect(StrategyPanel).toHaveBeenCalledTimes(1);
    expect(DirectAssertionEditor).toHaveBeenCalledTimes(1);
  });

  it('passes correct props to SessionPanel', () => {
    render(<LeftSidebar {...defaultProps} sessionId="test-sid-for-panel" />);
    expect(SessionPanel).toHaveBeenCalled();
    const props = vi.mocked(SessionPanel).mock.lastCall[0];

    expect(props.initialSessionId).toBe("test-sid-for-panel");
    expect(props.connectSession).toEqual(expect.any(Function));
    expect(props.disconnectSession).toEqual(expect.any(Function));
    expect(props.isMcrSessionActive).toBe(defaultProps.isMcrSessionActive);
    expect(props.isWsServiceConnected).toBe(defaultProps.isWsServiceConnected);
  });

  it('passes correct props to OntologyPanel', () => {
    render(<LeftSidebar {...defaultProps} sessionId="test-sid-for-ontology" />);
    expect(OntologyPanel).toHaveBeenCalled();
    const props = vi.mocked(OntologyPanel).mock.lastCall[0];

    expect(props.sessionId).toBe("test-sid-for-ontology");
    expect(props.isMcrSessionActive).toBe(defaultProps.isMcrSessionActive);
    expect(props.isWsServiceConnected).toBe(defaultProps.isWsServiceConnected);
    expect(props.addMessageToHistory).toEqual(expect.any(Function));
  });

  it('passes correct props to DemoPanel', () => {
    render(<LeftSidebar {...defaultProps} sessionId="test-sid-for-demo" />);
    expect(DemoPanel).toHaveBeenCalled();
    const props = vi.mocked(DemoPanel).mock.lastCall[0];

    expect(props.sessionId).toBe("test-sid-for-demo");
    expect(props.isMcrSessionActive).toBe(defaultProps.isMcrSessionActive);
    expect(props.isWsServiceConnected).toBe(defaultProps.isWsServiceConnected);
    expect(props.addMessageToHistory).toEqual(expect.any(Function));
  });

  it('passes correct props to StrategyPanel', () => {
    render(<LeftSidebar {...defaultProps} sessionId="test-sid-for-strategy" activeStrategy="current-strat" />);
    expect(StrategyPanel).toHaveBeenCalled();
    const props = vi.mocked(StrategyPanel).mock.lastCall[0];

    expect(props.sessionId).toBe("test-sid-for-strategy");
    expect(props.activeStrategy).toBe("current-strat");
    expect(props.setActiveStrategy).toEqual(expect.any(Function));
    expect(props.isMcrSessionActive).toBe(defaultProps.isMcrSessionActive);
    expect(props.isWsServiceConnected).toBe(defaultProps.isWsServiceConnected);
    expect(props.addMessageToHistory).toEqual(expect.any(Function));
  });
});
