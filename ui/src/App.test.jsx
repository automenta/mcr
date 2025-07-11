// ui/src/App.test.jsx
import { describe, it, expect, beforeEach, vi } from 'vitest'; // Removed afterEach
import { render, screen, fireEvent, act } from '@testing-library/react';
import App from './App';
import apiService from './apiService'; // We will mock this

// Mock the apiService
vi.mock('./apiService', () => {
  const actualApiService = vi.importActual('./apiService'); // Get actual for constants if needed
  return {
    default: {
      // Keep constants like MAX_RECONNECT_ATTEMPTS if App uses them, otherwise not needed
      ...actualApiService.default, // Spread actual to keep non-function properties
      connect: vi.fn(() => Promise.resolve()), // Default successful connect
      disconnect: vi.fn(),
      invokeTool: vi.fn((toolName) => {
        if (toolName === 'strategy.getActive') {
          return Promise.resolve({ success: true, data: { activeStrategyId: 'default-strategy' } });
        }
        if (toolName === 'session.create') {
            return Promise.resolve({ success: true, data: { id: 'new-session-id' } });
        }
        if (toolName === 'session.get') {
            return Promise.resolve({ success: true, data: { id: 'existing-session-id', facts: 'fact1.\nfact2.' } });
        }
        return Promise.resolve({ success: true, data: {} }); // Default mock for other tools
      }),
      addMessageListener: vi.fn(),
      removeMessageListener: vi.fn(),
      addEventListener: vi.fn(), // Add new methods from refactor
      removeEventListener: vi.fn(),
      isConnected: vi.fn(() => true), // Default to connected
      // Store listeners passed to addEventListener to simulate events
      _listeners: new Map(),
      _simulateConnectionStatus: function(statusPayload) {
        const cbs = this._listeners.get('connection_status') || [];
        cbs.forEach(cb => cb(statusPayload));
      },
       _simulateServerMessage: function(messagePayload) {
        const cbs = this._listeners.get('*') || []; // Assuming App.jsx uses addMessageListener -> '*'
        cbs.forEach(cb => cb(messagePayload));
      }
    },
  };
});

// Mock child components to simplify App.jsx testing focus
vi.mock('./components/InteractiveSession/InteractiveSessionMode', () => ({
  default: () => <div data-testid="interactive-mode">Interactive Mode Mock</div>, // Removed unused props
}));

vi.mock('./components/SystemAnalysis/SystemAnalysisMode', () => ({
  default: () => <div data-testid="analysis-mode">System Analysis Mode Mock</div>, // Already had no props
}));


describe('App.jsx', () => {
  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
    // Default mocks for apiService calls that happen on mount
    apiService.connect.mockResolvedValue(undefined);
    apiService.invokeTool.mockImplementation((toolName) => {
        if (toolName === 'strategy.getActive') {
          return Promise.resolve({ success: true, data: { activeStrategyId: 'initial-strategy' } });
        }
        return Promise.resolve({ success: true, data: {} });
    });

    // Mock addEventListener to store callbacks for simulation
    apiService.addEventListener.mockImplementation((type, cb) => {
        if (!apiService._listeners.has(type)) {
            apiService._listeners.set(type, []);
        }
        apiService._listeners.get(type).push(cb);
    });
    apiService.addMessageListener.mockImplementation((cb) => { // For the old method
        if (!apiService._listeners.has('*')) {
            apiService._listeners.set('*', []);
        }
        apiService._listeners.get('*').push(cb);
    });


  });

  it('renders InteractiveSessionMode by default', async () => {
    await act(async () => {
        render(<App />);
    });
    expect(screen.getByTestId('interactive-mode')).toBeInTheDocument();
    expect(apiService.connect).toHaveBeenCalled();
    expect(apiService.invokeTool).toHaveBeenCalledWith('strategy.getActive');
  });

  it('switches to SystemAnalysisMode when analysis button is clicked', async () => {
    await act(async () => {
        render(<App />);
    });

    // Wait for initial strategy fetch to complete
    await screen.findByTestId('interactive-mode');

    const analysisButton = screen.getByRole('button', { name: /📊 System Analysis/i });
    await act(async () => {
        fireEvent.click(analysisButton);
    });
    expect(screen.getByTestId('analysis-mode')).toBeInTheDocument();
    expect(screen.queryByTestId('interactive-mode')).not.toBeInTheDocument();
  });

  it('switches back to InteractiveSessionMode when interactive button is clicked', async () => {
    await act(async () => {
        render(<App />);
    });
    await screen.findByTestId('interactive-mode'); // ensure initial mode

    const analysisButton = screen.getByRole('button', { name: /📊 System Analysis/i });
    await act(async () => {
        fireEvent.click(analysisButton);
    });
    expect(screen.getByTestId('analysis-mode')).toBeInTheDocument();

    const interactiveButton = screen.getByRole('button', { name: /💬 Interactive Session/i });
    await act(async () => {
        fireEvent.click(interactiveButton);
    });
    expect(screen.getByTestId('interactive-mode')).toBeInTheDocument();
    expect(screen.queryByTestId('analysis-mode')).not.toBeInTheDocument();
  });

  it('displays initial WebSocket connection status and updates on connect', async () => {
    apiService.connect.mockReturnValueOnce(new Promise(() => {})); // Pending promise initially

    await act(async () => {
        render(<App />);
    });
    expect(screen.getByText('🔌 Connecting...')).toBeInTheDocument();

    // Simulate successful connection
    // For connect(), the resolution of the promise itself signals success to App.jsx's .then()
    // And addEventListener('connection_status') will be called for 'connected'
    apiService.connect.mockResolvedValueOnce(undefined); // Next call resolves

    // We need to re-render or simulate the effect that triggers re-connect or status update
    // In App.jsx, useEffect calls connect. If it fails and user clicks retry:
    // const retryButton = screen.queryByRole('button', { name: /🔄 Retry/i }); // retryButton was unused
    // At this stage, connect is still pending from the initial render, so no retry button yet.
    // Let's simulate the apiService emitting a 'connected' event via addEventListener
    // This will be picked up by App.jsx's effect that calls apiService.connect()
    // and then the .then() or .catch() updates the status.

    // The App.jsx's useEffect for apiService.connect() has its own .then and .catch
    // Let's make the connect promise resolve
    await act(async () => {
      // Simulate the connect promise resolving, which was set up by the render
      // This requires the mock to be set up *before* render for the initial call.
      // The mock setup in beforeEach already does this.
      // We need to ensure the test waits for these async operations.
    });

    // Simulate the apiService.connect().then() path in App.jsx
    // by ensuring the mock for connect resolves and then checking status.
    // The status update to '🟢 Connected' happens in the .then() of apiService.connect()

    // To test the "🟢 Connected" state, the connect() promise must resolve.
    // The beforeEach already sets up connect to resolve.
    // We need to wait for the effect to run and state to update.
    await screen.findByText('🟢 Connected'); // Vitest's findBy* queries handle async updates
    expect(apiService.invokeTool).toHaveBeenCalledWith('strategy.getActive');
  });

  it('displays error and retry button if initial WebSocket connection fails', async () => {
    const connectError = new Error('Test connection failed');
    apiService.connect.mockRejectedValueOnce(connectError);

    await act(async () => {
        render(<App />);
    });

    expect(await screen.findByText(`🔴 Error: ${connectError.message}. Retrying...`)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /🔄 Retry/i })).toBeInTheDocument();

    // Simulate retry
    apiService.connect.mockResolvedValueOnce(undefined); // Next connect succeeds
    const retryButton = screen.getByRole('button', { name: /🔄 Retry/i });
    await act(async () => {
        fireEvent.click(retryButton);
    });

    expect(await screen.findByText('🟢 Connected')).toBeInTheDocument();
  });

  describe('Session Management', () => {
    beforeEach(async () => {
      // Ensure App is rendered and WS is connected
      apiService.connect.mockResolvedValue(undefined);
      apiService.invokeTool.mockImplementation((toolName, _params) => { // Prefixed params
        if (toolName === 'strategy.getActive') {
          return Promise.resolve({ success: true, data: { activeStrategyId: 'initial-strategy' } });
        }
        return Promise.resolve({ success: true, data: {} });
      });
      await act(async () => {
          render(<App />);
      });
      await screen.findByText('🟢 Connected'); // Wait for WS connection
    });

    it('connects to a new session when no session ID is provided to connectToSession (via prop)', async () => {
      // InteractiveSessionMode mock would call connectSession('') or connectSession(null)
      // We need to get the connectSession function passed to InteractiveSessionMode
      // Or, we can assume InteractiveSessionMode calls it correctly and test App's internal logic if possible,
      // but it's better to test via what the component exposes or how user interacts.

      // For now, let's assume App calls connectToSession internally or via a component event.
      // Since connectToSession is not directly exposed, we'll test its effects.
      // The button to connect is within InteractiveSessionMode, which is mocked.
      // We'll need to get the connectSession prop from the mocked component.

      const interactiveMode = screen.getByTestId('interactive-mode');
      const { connectSession } = vi.mocked(interactiveMode).mock.lastCall[0]; // Get props of last render

      apiService.invokeTool.mockImplementation(async (toolName, params) => {
        if (toolName === 'session.create') {
          return { success: true, data: { id: 'new-session-123' } };
        }
        if (toolName === 'session.get' && params.sessionId === 'new-session-123') {
          return { success: true, data: { id: 'new-session-123', facts: 'initial facts.' } };
        }
        if (toolName === 'strategy.getActive') {
          return { success: true, data: { activeStrategyId: 'session-strategy' } };
        }
        return { success: true, data: {} };
      });

      await act(async () => {
        connectSession(''); // Simulate calling connect to new session
      });

      // Check for effects: session ID set, KB fetched, chat message
      expect(apiService.invokeTool).toHaveBeenCalledWith('session.create');
      expect(apiService.invokeTool).toHaveBeenCalledWith('session.get', { sessionId: 'new-session-123' });
      expect(apiService.invokeTool).toHaveBeenCalledWith('strategy.getActive'); // Re-fetch strategy

      // Check chat history for system message (this requires App to pass down addMessageToHistory, and for it to be used)
      // We'd need to inspect props of InteractiveSessionMode again for chatHistory or spy on addMessageToHistory
      // For simplicity, let's assume the system message is logged.
      // A more robust test would involve checking rendered chat output.
      expect(screen.getByText(/✨ New session created: new-session-123/i)).toBeInTheDocument();
      // Check if currentKb is updated (passed to InteractiveSessionMode)
      // Need to re-fetch the component props
      const updatedProps = vi.mocked(screen.getByTestId('interactive-mode')).mock.lastCall[0];
      expect(updatedProps.sessionId).toBe('new-session-123');
      expect(updatedProps.currentKb).toBe('initial facts.');
      expect(updatedProps.isMcrSessionActive).toBe(true);
    });

    it('connects to an existing session ID (via prop)', async () => {
      const interactiveMode = screen.getByTestId('interactive-mode');
      const { connectSession } = vi.mocked(interactiveMode).mock.lastCall[0];

      apiService.invokeTool.mockImplementation(async (toolName, params) => {
        if (toolName === 'session.get' && params.sessionId === 'existing-session-abc') {
          return { success: true, data: { id: 'existing-session-abc', facts: 'existing facts.' } };
        }
         if (toolName === 'strategy.getActive') {
          return { success: true, data: { activeStrategyId: 'session-strategy-existing' } };
        }
        return { success: true, data: {} };
      });

      await act(async () => {
        connectSession('existing-session-abc');
      });

      expect(apiService.invokeTool).toHaveBeenCalledWith('session.get', { sessionId: 'existing-session-abc' });
      expect(screen.getByText(/🔌 Connected to session: existing-session-abc/i)).toBeInTheDocument();
      const updatedProps = vi.mocked(screen.getByTestId('interactive-mode')).mock.lastCall[0];
      expect(updatedProps.sessionId).toBe('existing-session-abc');
      expect(updatedProps.currentKb).toBe('existing facts.');
      expect(updatedProps.isMcrSessionActive).toBe(true);
    });

    it('handles error when connecting to a session fails', async () => {
      const interactiveMode = screen.getByTestId('interactive-mode');
      const { connectSession } = vi.mocked(interactiveMode).mock.lastCall[0];
      const errorMessage = 'Failed to create session due to reasons';
      apiService.invokeTool.mockResolvedValueOnce({ success: false, message: errorMessage }); // session.create fails

      await act(async () => {
        connectSession('');
      });
      expect(screen.getByText(`❌ Error with session: ${errorMessage}`)).toBeInTheDocument();
      const updatedProps = vi.mocked(screen.getByTestId('interactive-mode')).mock.lastCall[0];
      expect(updatedProps.sessionId).toBeNull();
      expect(updatedProps.isMcrSessionActive).toBe(false);
    });

    it('disconnects from a session (via prop)', async () => {
      // First, connect to a session
      const interactiveMode = screen.getByTestId('interactive-mode');
      const { connectSession, disconnectSession } = vi.mocked(interactiveMode).mock.lastCall[0];
      apiService.invokeTool.mockImplementation(async (toolName, params) => {
        if (toolName === 'session.create') return { success: true, data: { id: 'disconnect-test-sid' } };
        if (toolName === 'session.get') return { success: true, data: { id: 'disconnect-test-sid', facts: 'some facts' } };
        if (toolName === 'strategy.getActive') return { success: true, data: { activeStrategyId: 's1' } };
        return { success: true, data: {} };
      });
      await act(async () => connectSession(''));
      await screen.findByText(/✨ New session created: disconnect-test-sid/i);
      let currentProps = vi.mocked(screen.getByTestId('interactive-mode')).mock.lastCall[0];
      expect(currentProps.isMcrSessionActive).toBe(true);
      expect(currentProps.sessionId).toBe('disconnect-test-sid');

      // Now, disconnect
      await act(async () => {
        disconnectSession();
      });

      expect(screen.getByText(/🔌 UI disconnected from session: disconnect-test-sid/i)).toBeInTheDocument();
      currentProps = vi.mocked(screen.getByTestId('interactive-mode')).mock.lastCall[0];
      expect(currentProps.sessionId).toBeNull();
      expect(currentProps.isMcrSessionActive).toBe(false);
      expect(currentProps.currentKb).toBe('');
      // Chat history might also be cleared, check if `chatHistory` prop becomes empty
      expect(currentProps.chatHistory.some(m => m.text.includes('UI disconnected'))).toBe(true);
    });
  });

  describe('Server Message Handling', () => {
     beforeEach(async () => {
      apiService.connect.mockResolvedValue(undefined);
      apiService.invokeTool.mockImplementation((toolName, _params) => { // Prefixed params
        if (toolName === 'strategy.getActive') {
          return Promise.resolve({ success: true, data: { activeStrategyId: 'initial-strategy' } });
        }
         if (toolName === 'session.create') {
            return Promise.resolve({ success: true, data: { id: 'test-session-msg' } });
        }
        if (toolName === 'session.get') {
            return Promise.resolve({ success: true, data: { id: 'test-session-msg', facts: 'fact.one.' } });
        }
        return Promise.resolve({ success: true, data: {} });
      });

      await act(async () => {
          render(<App />);
      });
      await screen.findByText('🟢 Connected');
      // Connect to a session to test session-specific messages
      const interactiveMode = screen.getByTestId('interactive-mode');
      const { connectSession } = vi.mocked(interactiveMode).mock.lastCall[0];
      await act(async () => connectSession('test-session-msg')); // Connect to a known session
      await screen.findByText(/Connected to session: test-session-msg/i);

    });

    it('updates KB when "kb_updated" message is received for the current session', async () => {
      const newFacts = ['new_fact1.', 'new_fact2.'];
      const kbUpdatePayload = {
        sessionId: 'test-session-msg', // Current session ID
        fullKnowledgeBase: 'fact.one.\nnew_fact1.\nnew_fact2.',
        newFacts: newFacts
      };

      await act(async () => {
        apiService._simulateServerMessage({ type: 'kb_updated', payload: kbUpdatePayload });
      });

      const updatedProps = vi.mocked(screen.getByTestId('interactive-mode')).mock.lastCall[0];
      expect(updatedProps.currentKb).toBe(kbUpdatePayload.fullKnowledgeBase);
      expect(screen.getByText(`⚙️ KB updated remotely. New facts: ${newFacts.join(', ')}`)).toBeInTheDocument();
    });

    it('does not update KB if "kb_updated" message is for a different session', async () => {
      const initialKb = vi.mocked(screen.getByTestId('interactive-mode')).mock.lastCall[0].currentKb;
      const kbUpdatePayload = {
        sessionId: 'other-session-id', // Different session
        fullKnowledgeBase: 'other.kb.',
        newFacts: ['other_fact.']
      };
      await act(async () => {
        apiService._simulateServerMessage({ type: 'kb_updated', payload: kbUpdatePayload });
      });

      const updatedProps = vi.mocked(screen.getByTestId('interactive-mode')).mock.lastCall[0];
      expect(updatedProps.currentKb).toBe(initialKb); // Should not have changed
      expect(screen.queryByText(/⚙️ KB updated remotely/i)).not.toBeInTheDocument();

    });

    it('updates active strategy on "tool_result" for strategy.set', async () => {
        const strategyUpdatePayload = {
            success: true,
            data: { activeStrategyId: 'new-active-strategy' },
            message: "Strategy set to new-active-strategy" // Message implies it was a strategy change
        };

        await act(async () => {
            apiService._simulateServerMessage({ type: 'tool_result', tool_name: 'strategy.set', payload: strategyUpdatePayload });
        });

        const updatedProps = vi.mocked(screen.getByTestId('interactive-mode')).mock.lastCall[0];
        expect(updatedProps.activeStrategy).toBe('new-active-strategy');
    });
  });
});
