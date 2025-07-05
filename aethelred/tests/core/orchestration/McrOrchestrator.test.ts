import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { McrOrchestrator, McrOrchestratorConfig } from '../../../src/core/orchestration/McrOrchestrator';
import type { ISession } from '../../../src/core/knowledge/Session';
import { PrologKnowledgeBase } from '../../../src/core/knowledge/KnowledgeBase';
import type { ILlmProvider } from '../../../src/interfaces/ILlmProvider';
import { NullLlmProvider } from '../../../src/providers/NullLlmProvider';
import type { IReasonProvider } from '../../../src/interfaces/IReasonProvider';
import { TauPrologReasonProvider } from '../../../src/providers/TauPrologReasonProvider';
import type { ITranslationStrategy } from '../../../src/interfaces/ITranslationStrategy';
import { DirectS1Strategy } from '../../../src/strategies/DirectS1Strategy';
import type { WorkflowExecutor } from '../../../src/core/workflow/WorkflowExecutor';
import { createPrologKbArtifact, createQueryStringArtifact, ArtifactType } from '../../../src/core/workflow/Artifact';

describe('McrOrchestrator', () => {
  let mockLlmProvider: ILlmProvider;
  let mockReasonProvider: IReasonProvider;
  let mockWorkflowExecutor: WorkflowExecutor;
  let directS1Strategy: ITranslationStrategy;
  let orchestrator: McrOrchestrator;
  let orchestratorConfig: McrOrchestratorConfig;

  beforeEach(() => {
    mockLlmProvider = new NullLlmProvider(); // Not directly used by orchestrator if executor handles it
    mockReasonProvider = new TauPrologReasonProvider(); // Orchestrator uses this for query execution

    directS1Strategy = new DirectS1Strategy();
    const strategies = new Map<string, ITranslationStrategy>();
    strategies.set(directS1Strategy.getName(), directS1Strategy);

    // Mock WorkflowExecutor
    mockWorkflowExecutor = {
      execute: jest.fn(async (workflow: any, initialArtifacts: any) => {
        // Default mock behavior: return a map based on expected outputs
        const results = new Map();
        if (workflow.id.includes('_assert_')) {
            const outName = workflow.expectedOutputArtifacts.find((o:any) => o.type === ArtifactType.PROLOG_KB)?.name || "prologKnowledgeBase";
            results.set(outName, createPrologKbArtifact({ content: "mock_clause_from_workflow." }));
        } else if (workflow.id.includes('_query_')) {
             const outName = workflow.expectedOutputArtifacts.find((o:any) => o.type === ArtifactType.QUERY_STRING)?.name || "prologQueryString";
            results.set(outName, createQueryStringArtifact({ content: "mock_query_from_workflow." }));
        }
        return results;
      })
    } as unknown as WorkflowExecutor; // Cast to satisfy type, only mocking 'execute'

    orchestratorConfig = {
      llmProvider: mockLlmProvider, // llmProvider is not directly used by orchestrator in current setup
      reasonProvider: mockReasonProvider,
      workflowExecutor: mockWorkflowExecutor,
      strategies: strategies,
      defaultStrategyName: directS1Strategy.getName(),
    };
    orchestrator = new McrOrchestrator(orchestratorConfig);
  });

  describe('Session Management', () => {
    it('should create a new session', async () => {
      const session = await orchestrator.createSession();
      expect(session).toBeDefined();
      expect(session.id).toBeString();
      expect(session.knowledgeBase).toBeInstanceOf(PrologKnowledgeBase);

      const retrievedSession = await orchestrator.getSession(session.id);
      expect(retrievedSession).toBe(session);
    });

    it('should delete a session', async () => {
      const session = await orchestrator.createSession();
      const sessionId = session.id;

      let retrieved = await orchestrator.getSession(sessionId);
      expect(retrieved).toBeDefined();

      const deleted = await orchestrator.deleteSession(sessionId);
      expect(deleted).toBe(true);

      retrieved = await orchestrator.getSession(sessionId);
      expect(retrieved).toBeUndefined();
    });

    it('getSession should return undefined for non-existent session', async () => {
      const session = await orchestrator.getSession("non-existent-id");
      expect(session).toBeUndefined();
    });
  });

  describe('Assert Operation', () => {
    it('should assert text to a session using the default strategy', async () => {
      const session = await orchestrator.createSession();
      const nlText = "Socrates is a man.";
      const mockPrologOutput = "man(socrates).";

      // Configure mock executor for this specific assert workflow
      (mockWorkflowExecutor.execute as any).mockImplementationOnce(async (workflow: any) => {
        const outName = workflow.expectedOutputArtifacts.find((o:any) => o.type === ArtifactType.PROLOG_KB)?.name || "prologKnowledgeBase";
        const results = new Map();
        results.set(outName, createPrologKbArtifact({ content: mockPrologOutput }));
        return results;
      });

      const result = await orchestrator.assert(session.id, nlText);

      expect(mockWorkflowExecutor.execute).toHaveBeenCalledTimes(1);
      expect(result.addedClauses).toEqual([mockPrologOutput]);
      expect(result.currentKbSize).toBe(1);
      expect(await session.knowledgeBase.getKbString()).toContain(mockPrologOutput);
    });

    it('should throw error if assert workflow does not produce PROLOG_KB', async () => {
        const session = await orchestrator.createSession();
        (mockWorkflowExecutor.execute as any).mockResolvedValueOnce(new Map()); // Empty output

        await expect(orchestrator.assert(session.id, "text"))
            .toThrow('Assert workflow (using strategy Direct-S1) did not produce the expected PROLOG_KB artifact named "prologKnowledgeBase". Found: undefined');
    });
  });

  describe('Query Operation', () => {
    it('should query a session using the default strategy', async () => {
      const session = await orchestrator.createSession();
      await session.knowledgeBase.addClause("man(socrates).");

      const nlQuery = "Is Socrates a man?";
      const mockPrologQuery = "man(socrates).";

      (mockWorkflowExecutor.execute as any).mockImplementationOnce(async (workflow: any) => {
         const outName = workflow.expectedOutputArtifacts.find((o:any) => o.type === ArtifactType.QUERY_STRING)?.name || "prologQueryString";
        const results = new Map();
        results.set(outName, createQueryStringArtifact({ content: mockPrologQuery }));
        return results;
      });

      const result = await orchestrator.query(session.id, nlQuery);

      expect(mockWorkflowExecutor.execute).toHaveBeenCalledTimes(1);
      expect(result.prologQuery).toBe(mockPrologQuery);
      expect(result.result.success).toBe(true);
      // The nlAnswer generation is basic, check if it contains expected parts
      expect(result.nlAnswer).toContain("true (with no variable bindings)");
    });

     it('should throw error if query workflow does not produce QUERY_STRING', async () => {
        const session = await orchestrator.createSession();
        (mockWorkflowExecutor.execute as any).mockResolvedValueOnce(new Map()); // Empty output

        await expect(orchestrator.query(session.id, "query"))
            .toThrow('Query workflow (using strategy Direct-S1) did not produce the expected QUERY_STRING artifact named "prologQueryString". Found: undefined');
    });
  });

  describe('Strategy Management', () => {
    it('listStrategies should return available strategies', () => {
      const strategies = orchestrator.listStrategies();
      expect(strategies).toBeArrayOfSize(1);
      expect(strategies[0].name).toBe(directS1Strategy.getName());
    });

    it('should throw error if default strategy is not found during construction', () => {
       const badConfig = { ...orchestratorConfig, defaultStrategyName: "NonExistentStrategy" };
       expect(() => new McrOrchestrator(badConfig)).toThrow('Default strategy "NonExistentStrategy" not found');
    });
  });
});
