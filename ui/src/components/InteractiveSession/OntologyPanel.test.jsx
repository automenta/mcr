// ui/src/components/InteractiveSession/OntologyPanel.test.jsx
import React from 'react';
import {
  render,
  screen,
  fireEvent,
  act,
  waitFor,
} from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import OntologyPanel from './OntologyPanel';
import apiService from '../../apiService';

vi.mock('../../apiService');
vi.mock('../Modal', () => ({
  default: ({ isOpen, onClose, title, children }) =>
    isOpen ? (
      <div data-testid="modal-mock">
        <h2>{title}</h2>
        <button onClick={onClose}>Close Modal</button>
        {children}
      </div>
    ) : null,
}));
vi.mock('../PrologCodeViewer', () => ({
  default: ({ code, title }) => (
    <div data-testid="prolog-viewer-mock">
      {title}: {code}
    </div>
  ),
}));

describe('OntologyPanel', () => {
  const mockAddMessageToHistory = vi.fn();
  const defaultProps = {
    sessionId: 'test-sid',
    isMcrSessionActive: true,
    isWsServiceConnected: true,
    addMessageToHistory: mockAddMessageToHistory,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    apiService.invokeTool.mockImplementation(async (toolName, params) => {
      if (toolName === 'ontology.list') return { success: true, data: [] };
      if (toolName === 'ontology.get')
        return {
          success: true,
          data: { name: params.name, rules: '// Test rules' },
        };
      if (toolName === 'session.assert_rules')
        return { success: true, data: {} };
      return { success: true, data: {} }; // Default mock
    });
  });

  it('renders the panel title and list button, and handles mount effects', async () => {
    // Ensure listOntologies mock is in place for the mount effect,
    // providing some data so the component updates.
    apiService.invokeTool.mockImplementation(async (toolName) => {
      if (toolName === 'ontology.list')
        return {
          success: true,
          data: [{ id: 'mountEffectOnto', name: 'MountEffectOntoName' }],
        };
      return { success: true, data: {} }; // Fallback for other potential calls
    });

    await act(async () => {
      render(<OntologyPanel {...defaultProps} />);
    });

    // Wait for an item that confirms listOntologies on mount has completed and rendered
    await waitFor(() =>
      expect(screen.getByText('MountEffectOntoName')).toBeInTheDocument()
    );

    // Now assert the static elements
    expect(screen.getByText('📚 Ontologies')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '🔄 List Ontologies' })
    ).toBeInTheDocument();
  });

  it('lists ontologies on mount if session is active', async () => {
    const ontologiesData = [{ id: 'family', name: 'FamilyOntology' }];
    apiService.invokeTool.mockImplementation(async (toolName) =>
      toolName === 'ontology.list'
        ? { success: true, data: ontologiesData }
        : { success: true, data: {} }
    );
    await act(async () => {
      render(<OntologyPanel {...defaultProps} />);
    });
    await waitFor(() =>
      expect(screen.getByText('FamilyOntology')).toBeInTheDocument()
    );
    expect(apiService.invokeTool).toHaveBeenCalledWith('ontology.list', {
      includeRules: false,
    });
  });

  it('does not list ontologies if session is not active', async () => {
    await act(async () => {
      render(<OntologyPanel {...defaultProps} isMcrSessionActive={false} />);
    });
    // No need for an additional await act(async () => {}); if render is already in act
    expect(apiService.invokeTool).not.toHaveBeenCalledWith(
      'ontology.list',
      expect.anything()
    );
    // Check that the message for "active session but no ontologies" is NOT there
    expect(
      screen.queryByText(/🤷 No ontologies found./i)
    ).not.toBeInTheDocument();
    // Also, check that buttons are disabled
    expect(
      screen.getByRole('button', { name: '🔄 List Ontologies' })
    ).toBeDisabled();
  });

  it('displays "No ontologies found" when list is empty and session active', async () => {
    apiService.invokeTool.mockResolvedValue({ success: true, data: [] }); // Ensure empty list
    await act(async () => {
      render(<OntologyPanel {...defaultProps} />);
    });
    await waitFor(() =>
      expect(screen.getByText(/No ontologies found/i)).toBeInTheDocument()
    );
  });

  it('can view ontology details in a modal', async () => {
    const ontologiesData = [{ id: 'family', name: 'FamilyOntology' }];
    const ontologyRules = 'parent(john, mary).';
    apiService.invokeTool.mockImplementation(async (toolName, params) => {
      if (toolName === 'ontology.list')
        return { success: true, data: ontologiesData };
      if (toolName === 'ontology.get' && params.name === 'FamilyOntology')
        return {
          success: true,
          data: { name: 'FamilyOntology', rules: ontologyRules },
        };
      return { success: true, data: {} };
    });

    await act(async () => {
      render(<OntologyPanel {...defaultProps} />);
    });
    await waitFor(() => screen.getByText('FamilyOntology'));

    const viewButton = screen.getByRole('button', { name: '👁️ View' });
    await act(async () => {
      fireEvent.click(viewButton);
    });

    await waitFor(() =>
      expect(screen.getByTestId('modal-mock')).toBeInTheDocument()
    );
    expect(screen.getByText('📚 Ontology: FamilyOntology')).toBeInTheDocument();
    expect(screen.getByTestId('prolog-viewer-mock')).toHaveTextContent(
      `FamilyOntology: ${ontologyRules}`
    );
  });

  it('can load ontology to session', async () => {
    const ontologiesData = [{ id: 'family', name: 'FamilyOntology' }];
    const ontologyRules = 'parent(john, mary).';
    apiService.invokeTool.mockImplementation(async (toolName, params) => {
      if (toolName === 'ontology.list')
        return { success: true, data: ontologiesData };
      if (toolName === 'ontology.get' && params.name === 'FamilyOntology')
        return {
          success: true,
          data: { name: 'FamilyOntology', rules: ontologyRules },
        };
      if (
        toolName === 'session.assert_rules' &&
        params.sessionId === defaultProps.sessionId &&
        params.rules === ontologyRules
      )
        return { success: true, data: {} };
      return { success: true, data: {} };
    });

    await act(async () => {
      render(<OntologyPanel {...defaultProps} />);
    });
    await waitFor(() => screen.getByText('FamilyOntology'));

    const loadButton = screen.getByRole('button', { name: '➕ Load' });
    await act(async () => {
      fireEvent.click(loadButton);
    });

    expect(apiService.invokeTool).toHaveBeenCalledWith('ontology.get', {
      name: 'FamilyOntology',
      includeRules: true,
    });
    expect(apiService.invokeTool).toHaveBeenCalledWith('session.assert_rules', {
      sessionId: defaultProps.sessionId,
      rules: ontologyRules,
    });
    expect(mockAddMessageToHistory).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining(
          "Ontology 'FamilyOntology' rules asserted successfully"
        ),
      })
    );
  });

  it('disables buttons if MCR session is not active', async () => {
    await act(async () => {
      render(<OntologyPanel {...defaultProps} isMcrSessionActive={false} />);
    });
    expect(
      screen.getByRole('button', { name: '🔄 List Ontologies' })
    ).toBeDisabled();
    // If ontologies were somehow listed, their buttons should also be disabled
  });

  it('disables buttons if WebSocket service is not connected', async () => {
    await act(async () => {
      render(<OntologyPanel {...defaultProps} isWsServiceConnected={false} />);
    });
    expect(
      screen.getByRole('button', { name: '🔄 List Ontologies' })
    ).toBeDisabled();
  });

  it('handles API error when listing ontologies', async () => {
    apiService.invokeTool.mockResolvedValueOnce({
      success: false,
      message: 'Failed to list',
    });
    await act(async () => {
      render(<OntologyPanel {...defaultProps} />);
    });
    await waitFor(() =>
      expect(mockAddMessageToHistory).toHaveBeenCalledWith(
        expect.objectContaining({
          text: '❌ Error listing ontologies: Failed to list',
        })
      )
    );
  });
});
