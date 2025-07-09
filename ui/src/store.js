import { create } from 'zustand';

const useStore = create((set, get) => ({
  // Connection State
  isConnected: false,
  setIsConnected: (status) => set({ isConnected: status }),

  // Session State
  sessionId: null,
  setSessionId: (id) => set({ sessionId: id }),

  // Chat State
  chatMessages: [], // Format: { id: string, sender: 'user' | 'mcr' | 'system', text: string, type: 'assert' | 'query' | 'response' | 'error' | 'info', prolog?: string, reasonerResults?: any }
  addChatMessage: (message) => {
    // Ensure unique ID for each message, even if timestamp is the same
    const messageWithId = { ...message, id: message.id || `${Date.now()}-${Math.random().toString(16).slice(2)}` };
    set((state) => ({ chatMessages: [...state.chatMessages, messageWithId] }));
  },
  clearChatMessages: () => set({ chatMessages: [] }),

  // Knowledge Base State
  currentKb: '',
  setCurrentKb: (kb) => set({ currentKb: kb }),

  newFactsInLastUpdate: [],
  setNewFactsInLastUpdate: (facts) => set({ newFactsInLastUpdate: facts }),

  // Loading/Error State for API calls (optional, can be component-local)
  isLoading: false,
  setIsLoading: (loading) => set({ isLoading: loading }),
  error: null,
  setError: (error) => set({ error: error }),

  // Example of an action that uses the store's state and potentially apiService
  // This is just a placeholder to show how actions can be structured
  // createNewSession: async (apiService) => {
  //   if (get().isLoading) return;
  //   set({ isLoading: true, error: null });
  //   try {
  //     const result = await apiService.send('tool_invoke', 'create_session', {}, `cs-${Date.now()}`);
  //     if (result.success && result.sessionId) {
  //       set({ sessionId: result.sessionId, isLoading: false });
  //       get().addChatMessage({ sender: 'system', text: `Session created: ${result.sessionId}`, type: 'info' });
  //     } else {
  //       throw new Error(result.message || 'Failed to create session');
  //     }
  //   } catch (err) {
  //     set({ isLoading: false, error: err.message });
  //     get().addChatMessage({ sender: 'system', text: `Error creating session: ${err.message}`, type: 'error' });
  //   }
  // }
}));

export default useStore;
