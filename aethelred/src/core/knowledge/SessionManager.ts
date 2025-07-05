// aethelred/src/core/knowledge/SessionManager.ts

import { v4 as uuidv4 } from 'uuid';
import { ArtifactType, PrologClauseArtifact, PrologKbArtifact, createPrologKbArtifact } from '../workflow/Artifact';

// Define the structure of a session
export interface Session {
  id: string;
  createdAt: Date;
  facts: string[]; // Stores Prolog facts/rules as strings, each ending with a period.
  metadata?: Record<string, any>; // Optional metadata for the session
}

// In-memory store for sessions.
// Structure: { sessionId: Session, ... }
const sessions: Record<string, Session> = {};

export class SessionManager {
  constructor() {
    // console.log("[SessionManager] Initialized.");
    // In a more advanced version, this could load sessions from persistent storage.
  }

  /**
   * Creates a new session.
   * @param metadata Optional metadata to store with the session.
   * @returns The created session object.
   */
  public createSession(metadata?: Record<string, any>): Session {
    const sessionId = uuidv4();
    const session: Session = {
      id: sessionId,
      createdAt: new Date(),
      facts: [],
      metadata: metadata,
    };
    sessions[sessionId] = session;
    console.log(`[SessionManager] Session created: ${sessionId}`);
    return { ...session }; // Return a copy
  }

  /**
   * Retrieves a session by its ID.
   * @param sessionId - The ID of the session.
   * @returns The session object or null if not found.
   */
  public getSession(sessionId: string): Session | null {
    if (!sessions[sessionId]) {
      console.warn(`[SessionManager] Session not found: ${sessionId}`);
      return null;
    }
    return { ...sessions[sessionId] }; // Return a copy
  }

  /**
   * Adds facts to a session. Facts can be provided as an array of strings
   * or an array of PrologClauseArtifacts.
   * Each fact string must be a valid Prolog fact/rule ending with a period.
   * @param sessionId - The ID of the session.
   * @param newFacts - An array of Prolog fact strings or PrologClauseArtifacts.
   * @returns {success: boolean, addedCount: number, message?: string } True if facts were added, false if session not found or facts invalid.
   */
  public addFacts(
    sessionId: string,
    newFacts: (string | PrologClauseArtifact)[]
  ): { success: boolean; addedCount: number; message?: string } {
    if (!sessions[sessionId]) {
      console.warn(`[SessionManager] Cannot add facts: Session not found: ${sessionId}`);
      return { success: false, addedCount: 0, message: 'Session not found.' };
    }

    if (!Array.isArray(newFacts)) {
      console.warn(`[SessionManager] Cannot add facts: newFacts must be an array. Session: ${sessionId}`);
      return { success: false, addedCount: 0, message: 'newFacts must be an array.' };
    }

    const factStrings: string[] = newFacts.map(fact => {
      if (typeof fact === 'string') {
        return fact;
      } else if (fact && fact.type === ArtifactType.PROLOG_CLAUSE && typeof fact.content === 'string') {
        return fact.content;
      }
      // If it's an artifact of wrong type or malformed, this will result in an invalid fact later.
      // Or we can choose to throw an error here. For now, let it pass to validation.
      console.warn(`[SessionManager] Invalid fact format in newFacts array for session ${sessionId}. Fact:`, fact);
      return ""; // Will be filtered out by validation
    });

    const validatedFacts = factStrings
      .map((f) => f.trim())
      .filter((f) => f.length > 0); // Remove empty strings

    const invalidFormatFacts = validatedFacts.filter((f) => !f.endsWith('.'));
    if (invalidFormatFacts.length > 0) {
      console.warn(
        `[SessionManager] Some facts do not end with a period and were not added. Session: ${sessionId}`,
        { invalidFormatFacts }
      );
      // For now, we will filter them out rather than rejecting the whole batch.
    }

    const factsToAdd = validatedFacts.filter((f) => f.endsWith('.'));

    if (factsToAdd.length === 0 && newFacts.length > 0) {
        const msg = "No valid facts to add after validation (e.g., missing period, empty).";
        console.warn(`[SessionManager] ${msg} Session: ${sessionId}`);
        return { success: false, addedCount: 0, message: msg };
    }

    sessions[sessionId].facts.push(...factsToAdd);
    console.log(
      `[SessionManager] ${factsToAdd.length} facts added to session: ${sessionId}. Total facts: ${sessions[sessionId].facts.length}`
    );
    return { success: true, addedCount: factsToAdd.length };
  }

  /**
   * Retrieves all facts for a given session as a single string (knowledge base).
   * @param sessionId - The ID of the session.
   * @returns A string containing all Prolog facts (newline-separated) or null if session not found.
   */
  public getKnowledgeBaseString(sessionId: string): string | null {
    const session = sessions[sessionId];
    if (!session) {
      console.warn(`[SessionManager] Cannot get knowledge base string: Session not found: ${sessionId}`);
      return null;
    }
    return session.facts.join('\n');
  }

  /**
   * Retrieves all facts for a given session as a PrologKbArtifact.
   * @param sessionId - The ID of the session.
   * @returns A PrologKbArtifact or null if session not found.
   */
  public getKnowledgeBaseArtifact(sessionId: string): PrologKbArtifact | null {
    const kbString = this.getKnowledgeBaseString(sessionId);
    if (kbString === null) {
      return null;
    }
    return createPrologKbArtifact({ content: kbString, metadata: { sessionId } });
  }


  /**
   * Deletes a session.
   * @param sessionId - The ID of the session to delete.
   * @returns True if the session was deleted, false if not found.
   */
  public deleteSession(sessionId: string): boolean {
    if (!sessions[sessionId]) {
      console.warn(`[SessionManager] Cannot delete session: Session not found: ${sessionId}`);
      return false;
    }
    delete sessions[sessionId];
    console.log(`[SessionManager] Session deleted: ${sessionId}`);
    return true;
  }

  /**
   * Clears all sessions from the manager.
   * Useful for testing or resetting state.
   */
  public clearAllSessions(): void {
    for (const sessionId in sessions) {
      delete sessions[sessionId];
    }
    console.log("[SessionManager] All sessions cleared.");
  }
}
