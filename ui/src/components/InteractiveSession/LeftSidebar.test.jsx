// ui/src/components/InteractiveSession/LeftSidebar.test.jsx
import React from 'react';
import { render, screen } from '@testing-library/react'; // Removed fireEvent, act, waitFor
import { describe, it, expect, vi, beforeEach } from 'vitest'; // Removed afterEach
import LeftSidebar from './LeftSidebar';
import apiService from '../../apiService'; // Added apiService import back

// Mock child components & apiService
vi.mock('../../apiService'); // This mock will still apply
vi.mock('./SessionPanel', () => ({
  default: (props) => <div data-testid="session-panel-mock">{JSON.stringify(props)}</div>,
}));
vi.mock('./OntologyPanel', () => ({
  default: (props) => <div data-testid="ontology-panel-mock">{JSON.stringify(props)}</div>,
}));
vi.mock('./DemoPanel', () => ({
  default: (props) => <div data-testid="demo-panel-mock">{JSON.stringify(props)}</div>,
}));
vi.mock('./StrategyPanel', () => ({ // Mock StrategyPanel
  default: (props) => <div data-testid="strategy-panel-mock">{JSON.stringify(props)}</div>,
}));

vi.mock('../Modal', () => ({ // Modal is no longer directly used by LeftSidebar
  default: () => null, // Basic mock as it's not expected to be rendered by LeftSidebar
  // The following was an erroneous duplication:
  // <div data-testid="modal-mock">
  //   <h2>{title}</h2>
  //   <button onClick={onClose}>Close Modal</button>
  //   {children}
  // </div>
  // ) : null,
}));

vi.mock('../PrologCodeViewer', () => ({
  default: ({ code, title }) => <div data-testid="prolog-viewer-mock">{title}: {code}</div>,
}));

vi.mock('../DirectAssertionEditor', () => ({
  default: (props) => <div data-testid="direct-assertion-editor-mock">{JSON.stringify(props)}</div>,
}));


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
    isWsServiceConnected: true, // Assume WS is connected for most tests unless specified
    addMessageToHistory: mockAddMessageToHistory,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock implementations for apiService
    apiService.invokeTool.mockImplementation(async (toolName, params) => {
      if (toolName === 'ontology.list') return { success: true, data: [] };
      if (toolName === 'demo.list') return { success: true, data: [] };
      if (toolName === 'strategy.list') return { success: true, data: [] };
      if (toolName === 'ontology.get') return { success: true, data: { name: params.name, rules: "// Some rules" } };
      if (toolName === 'strategy.setActive') return { success: true, data: { activeStrategyId: params.strategyId } };
      return { success: true, data: {} };
    });
  });

  it('renders main sections and SessionPanel', () => {
    render(<LeftSidebar {...defaultProps} />);
    expect(screen.getByText('⚙️ Config & Context')).toBeInTheDocument();
    expect(screen.getByTestId('session-panel-mock')).toBeInTheDocument();
    expect(screen.getByTestId('ontology-panel-mock')).toBeInTheDocument();
    expect(screen.getByTestId('demo-panel-mock')).toBeInTheDocument();
    // expect(screen.getByText('🛠️ Strategies')).toBeInTheDocument(); // Title now in StrategyPanel
    expect(screen.getByTestId('strategy-panel-mock')).toBeInTheDocument();
    expect(screen.getByTestId('direct-assertion-editor-mock')).toBeInTheDocument();
  });

  it('passes correct props to SessionPanel', () => {
    render(<LeftSidebar {...defaultProps} sessionId="test-sid-for-panel" />);
    const sessionPanel = screen.getByTestId('session-panel-mock');
    const props = JSON.parse(sessionPanel.textContent);

    expect(props.initialSessionId).toBe("test-sid-for-panel");
    expect(props).toHaveProperty('connectSession');
    expect(props).toHaveProperty('disconnectSession');
    expect(props.isMcrSessionActive).toBe(defaultProps.isMcrSessionActive);
    expect(props.isWsServiceConnected).toBe(defaultProps.isWsServiceConnected);
  });

  it('passes correct props to OntologyPanel', () => {
    render(<LeftSidebar {...defaultProps} sessionId="test-sid-for-ontology" />);
    const ontologyPanel = screen.getByTestId('ontology-panel-mock');
    const props = JSON.parse(ontologyPanel.textContent);

    expect(props.sessionId).toBe("test-sid-for-ontology");
    expect(props.isMcrSessionActive).toBe(defaultProps.isMcrSessionActive);
    expect(props.isWsServiceConnected).toBe(defaultProps.isWsServiceConnected);
    expect(props).toHaveProperty('addMessageToHistory');
  });

  it('passes correct props to DemoPanel', () => {
    render(<LeftSidebar {...defaultProps} sessionId="test-sid-for-demo" />);
    const demoPanel = screen.getByTestId('demo-panel-mock');
    const props = JSON.parse(demoPanel.textContent);

    expect(props.sessionId).toBe("test-sid-for-demo");
    expect(props.isMcrSessionActive).toBe(defaultProps.isMcrSessionActive);
    expect(props.isWsServiceConnected).toBe(defaultProps.isWsServiceConnected);
    expect(props).toHaveProperty('addMessageToHistory');
  });

  it('passes correct props to StrategyPanel', () => {
    render(<LeftSidebar {...defaultProps} sessionId="test-sid-for-strategy" activeStrategy="current-strat" />);
    const strategyPanel = screen.getByTestId('strategy-panel-mock');
    const props = JSON.parse(strategyPanel.textContent);

    expect(props.sessionId).toBe("test-sid-for-strategy");
    expect(props.activeStrategy).toBe("current-strat");
    expect(props).toHaveProperty('setActiveStrategy');
    expect(props.isMcrSessionActive).toBe(defaultProps.isMcrSessionActive);
    expect(props.isWsServiceConnected).toBe(defaultProps.isWsServiceConnected);
    expect(props).toHaveProperty('addMessageToHistory');
  });

  // describe('Session Management Panel', () => { // These tests are moved to SessionPanel.test.jsx
    // it('shows connect button when not in MCR session', () => {
    //   render(<LeftSidebar {...defaultProps} isMcrSessionActive={false} />);
    //   expect(screen.getByRole('button', { name: '🟢 Connect' })).toBeInTheDocument();
    //   expect(screen.queryByRole('button', { name: '🔴 Disconnect' })).not.toBeInTheDocument();
    // });

    // it('shows disconnect button when in MCR session', () => {
    //   render(<LeftSidebar {...defaultProps} sessionId="sid-123" isMcrSessionActive={true} />);
    //   expect(screen.getByRole('button', { name: '🔴 Disconnect' })).toBeInTheDocument();
    //   expect(screen.queryByRole('button', { name: '🟢 Connect' })).not.toBeInTheDocument();
    //   expect(screen.getByText('🔑 Active Session: sid-123')).toBeInTheDocument();
    // });

    // it('calls connectSession with typed session ID', async () => {
    //   render(<LeftSidebar {...defaultProps} isMcrSessionActive={false} />);
    //   const input = screen.getByPlaceholderText('Session ID (optional)');
    //   const connectButton = screen.getByRole('button', { name: '🟢 Connect' });

    //   await act(async () => {
    //     fireEvent.change(input, { target: { value: 'my-session' } });
    //     fireEvent.click(connectButton);
    //   });
    //   expect(mockConnectSession).toHaveBeenCalledWith('my-session');
    // });

    // it('calls connectSession (for new session) if session ID is empty', async () => {
    //   render(<LeftSidebar {...defaultProps} isMcrSessionActive={false} />);
    //   const connectButton = screen.getByRole('button', { name: '🟢 Connect' });
    //   await act(async () => {
    //     fireEvent.click(connectButton);
    //   });
    //   expect(mockConnectSession).toHaveBeenCalledWith(); // No argument
    // });


    // it('calls disconnectSession when disconnect button is clicked', async () => {
    //   render(<LeftSidebar {...defaultProps} sessionId="sid-123" isMcrSessionActive={true} />);
    //   const disconnectButton = screen.getByRole('button', { name: '🔴 Disconnect' });
    //   await act(async () => {
    //     fireEvent.click(disconnectButton);
    //   });
    //   expect(mockDisconnectSession).toHaveBeenCalled();
    // });

    // it('disables connect/disconnect if WebSocket service is not connected', () => {
    //   render(<LeftSidebar {...defaultProps} isMcrSessionActive={false} isWsServiceConnected={false} />);
    //   expect(screen.getByRole('button', { name: '🟢 Connect' })).toBeDisabled();

    //   render(<LeftSidebar {...defaultProps} sessionId="sid-123" isMcrSessionActive={true} isWsServiceConnected={false} />);
    //   expect(screen.getByRole('button', { name: '🔴 Disconnect' })).toBeDisabled();
    // });
  // });

  // describe('Ontologies Panel', () => { // These tests are moved to OntologyPanel.test.jsx
    // it('lists ontologies when MCR session is active', async () => {
    //   const ontologiesData = [{ id: 'ont1', name: 'Family' }];
    //   apiService.invokeTool.mockImplementation(async (toolName) =>
    //     toolName === 'ontology.list' ? { success: true, data: ontologiesData } : { success: true, data: {} }
    //   );
    //   render(<LeftSidebar {...defaultProps} sessionId="sid-123" isMcrSessionActive={true} />);

    //   // The useEffect lists ontologies on mount if active. Let's wait for it.
    //   await waitFor(() => expect(screen.getByText('Family')).toBeInTheDocument());
    //   expect(apiService.invokeTool).toHaveBeenCalledWith('ontology.list', { includeRules: false });
    // });

    // it('can view ontology details in a modal', async () => {
    //   const ontologiesData = [{ id: 'ont1', name: 'Family' }];
    //   const ontologyRules = "parent(john, mary).";
    //   apiService.invokeTool.mockImplementation(async (toolName, params) => {
    //     if (toolName === 'ontology.list') return { success: true, data: ontologiesData };
    //     if (toolName === 'ontology.get' && params.name === 'Family') return { success: true, data: { name: 'Family', rules: ontologyRules } };
    //     return { success: true, data: {} };
    //   });

    //   render(<LeftSidebar {...defaultProps} sessionId="sid-123" isMcrSessionActive={true} />);
    //   await waitFor(() => screen.getByText('Family')); // Ensure ontology is listed

    //   const viewButton = screen.getAllByRole('button', { name: '👁️ View' })[0];
    //   await act(async () => {
    //     fireEvent.click(viewButton);
    //   });

    //   await waitFor(() => expect(screen.getByTestId('modal-mock')).toBeInTheDocument());
    //   expect(screen.getByText('📚 Ontology: Family')).toBeInTheDocument();
    //   expect(screen.getByTestId('prolog-viewer-mock')).toHaveTextContent(`Family: ${ontologyRules}`);
    // });

    // it('can load ontology to session', async () => {
    //     const ontologiesData = [{ id: 'ont1', name: 'Family' }];
    //     const ontologyRules = "parent(john, mary).";
    //     apiService.invokeTool.mockImplementation(async (toolName, params) => {
    //         if (toolName === 'ontology.list') return { success: true, data: ontologiesData };
    //         if (toolName === 'ontology.get' && params.name === 'Family') return { success: true, data: { name: 'Family', rules: ontologyRules } };
    //         if (toolName === 'session.assert_rules' && params.sessionId === 'sid-123' && params.rules === ontologyRules) return { success: true, data: {} };
    //         return { success: true, data: {} };
    //     });

    //     render(<LeftSidebar {...defaultProps} sessionId="sid-123" isMcrSessionActive={true} />);
    //     await waitFor(() => screen.getByText('Family'));

    //     const loadButton = screen.getAllByRole('button', { name: '➕ Load' })[0];
    //     await act(async () => {
    //         fireEvent.click(loadButton);
    //     });

    //     expect(apiService.invokeTool).toHaveBeenCalledWith('ontology.get', { name: 'Family', includeRules: true });
    //     expect(apiService.invokeTool).toHaveBeenCalledWith('session.assert_rules', { sessionId: 'sid-123', rules: ontologyRules });
    //     expect(mockAddMessageToHistory).toHaveBeenCalledWith(expect.objectContaining({
    //         text: expect.stringContaining("Ontology 'Family' rules asserted successfully")
    //     }));
    // });
  // });

  // describe('Strategies Panel', () => { // These tests are moved to StrategyPanel.test.jsx
    // it('lists strategies and shows active strategy', async () => {
    //   const strategiesData = [{ id: 'strat1', name: 'Strategy One' }, { id: 'strat2', name: 'Strategy Two' }];
    //   apiService.invokeTool.mockImplementation(async (toolName) =>
    //     toolName === 'strategy.list' ? { success: true, data: strategiesData } : { success: true, data: {} }
    //   );
    //   render(<LeftSidebar {...defaultProps} sessionId="sid-123" isMcrSessionActive={true} activeStrategy="strat1" />);

    //   await waitFor(() => {
    //     expect(screen.getByText('Strategy One')).toBeInTheDocument();
    //     expect(screen.getByText('Strategy Two')).toBeInTheDocument();
    //   });
    //   expect(screen.getByText((content, element) => content.startsWith('🎯 Active:') && content.includes('strat1'))).toBeInTheDocument();
    //   // Check that the active strategy's "Set" button is disabled or shows "Active"
    //   const strategyOneItem = screen.getByText('Strategy One').closest('li');
    //   expect(strategyOneItem.querySelector('button[title="Set as Active Strategy"]')).toHaveTextContent('✅ Active');
    // });

    // it('can set an active strategy', async () => {
    //   const strategiesData = [{ id: 'strat1', name: 'Strategy One' }, { id: 'strat2', name: 'Strategy Two' }];
    //   apiService.invokeTool.mockImplementation(async (toolName, params) => {
    //     if (toolName === 'strategy.list') return { success: true, data: strategiesData };
    //     if (toolName === 'strategy.setActive' && params.strategyId === 'strat2') return { success: true, data: { activeStrategyId: 'strat2' } };
    //     return { success: true, data: {} };
    //   });
    //   render(<LeftSidebar {...defaultProps} sessionId="sid-123" isMcrSessionActive={true} activeStrategy="strat1" />);

    //   await waitFor(() => screen.getByText('Strategy Two'));

    //   const strategyTwoItem = screen.getByText('Strategy Two').closest('li');
    //   const setButton = strategyTwoItem.querySelector('button[title="Set as Active Strategy"]');

    //   await act(async () => {
    //     fireEvent.click(setButton);
    //   });

    //   expect(apiService.invokeTool).toHaveBeenCalledWith('strategy.setActive', { strategyId: 'strat2' });
    //   expect(mockSetActiveStrategy).toHaveBeenCalledWith('strat2');
    //   expect(mockAddMessageToHistory).toHaveBeenCalledWith(expect.objectContaining({
    //     text: '✅ Strategy set to strat2'
    //   }));
    // });
  // });

  // TODO: Add tests for Demos panel // This was a mislabeled TODO, Demos panel tests are in DemoPanel.test.jsx
  // TODO: Add tests for DirectAssertionEditor integration (e.g., props passed)
});
