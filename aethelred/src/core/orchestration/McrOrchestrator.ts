import type { ISession } from '../knowledge/Session';
import { Session } from '../knowledge/Session'; // Concrete class for instantiation
import { PrologKnowledgeBase } from '../knowledge/KnowledgeBase';
import type { ILlmProvider } from '../../interfaces/ILlmProvider';
import type { IReasonProvider } from '../../interfaces/IReasonProvider';
import type { ITranslationStrategy } from '../../interfaces/ITranslationStrategy';
import type { WorkflowExecutor } from '../workflow/WorkflowExecutor';
import { createNLTextArtifact, ArtifactType } from '../workflow/Artifact';
import type { Clause, QueryString, QueryResult } from '../../types';
import { v4 as uuidv4 } from 'uuid';

export interface McrOrchestratorConfig {
  llmProvider: ILlmProvider; // This might not be needed if WorkflowExecutor's context has it
  reasonProvider: IReasonProvider; // Same as above
  workflowExecutor: WorkflowExecutor;
  strategies: Map<string, ITranslationStrategy>; // Keyed by strategy name
  defaultStrategyName: string;
}

export class McrOrchestrator {
  private sessions: Map<string, ISession>; // Keyed by session ID
  // Providers might be better accessed via WorkflowExecutor's context if actions need them directly
  // For now, keeping them here if orchestrator itself needs to use them (e.g., for NL answer generation outside workflow)
  private reasonProvider: IReasonProvider;
  private workflowExecutor: WorkflowExecutor;
  private strategies: Map<string, ITranslationStrategy>;
  private defaultStrategyName: string;

  constructor(config: McrOrchestratorConfig) {
    this.sessions = new Map();
    this.reasonProvider = config.reasonProvider;
    this.workflowExecutor = config.workflowExecutor;
    this.strategies = config.strategies;
    this.defaultStrategyName = config.defaultStrategyName;

    if (!this.strategies.has(this.defaultStrategyName)) {
      throw new Error(`Default strategy "${this.defaultStrategyName}" not found in available strategies. Loaded: ${Array.from(this.strategies.keys()).join(', ')}`);
    }
    if (this.strategies.size === 0) {
        console.warn("McrOrchestrator initialized with no translation strategies.");
    }
  }

  public async createSession(): Promise<ISession> {
    const newSessionId = uuidv4();
    // Ensure Session class is correctly imported and instantiated
    const newSession = new Session(newSessionId, new PrologKnowledgeBase());
    this.sessions.set(newSession.id, newSession);
    return newSession;
  }

  public async getSession(sessionId: string): Promise<ISession | undefined> {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.touch();
    }
    return session;
  }

  public async deleteSession(sessionId: string): Promise<boolean> {
    return this.sessions.delete(sessionId);
  }

  private getStrategy(strategyName?: string): ITranslationStrategy {
    const name = strategyName || this.defaultStrategyName;
    const strategy = this.strategies.get(name);
    if (!strategy) {
      throw new Error(`Translation strategy "${name}" not found.`);
    }
    return strategy;
  }

  public async assert(
    sessionId: string,
    nlText: string,
    strategyName?: string
  ): Promise<{ addedClauses: Clause[]; currentKbSize: number; knowledgeBase: string }> {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session with ID "${sessionId}" not found.`);
    }

    const strategy = this.getStrategy(strategyName);
    const nlTextArtifact = createNLTextArtifact({ content: nlText, id: "initialNLTextAssert" });

    const assertWorkflow = strategy.defineAssertWorkflow(nlTextArtifact, new Map());

    const initialArtifacts = new Map();
    // The key for initialArtifacts map should match expectedInputArtifacts.name in the workflow
    const inputName = assertWorkflow.expectedInputArtifacts[0]?.name || "userNaturalLanguageText";
    initialArtifacts.set(inputName, nlTextArtifact);

    const outputArtifacts = await this.workflowExecutor.execute(assertWorkflow, initialArtifacts);

    const outputKbArtifactName = assertWorkflow.expectedOutputArtifacts.find(oa => oa.type === ArtifactType.PROLOG_KB)?.name;
    if (!outputKbArtifactName) {
        throw new Error("Assert workflow definition does not specify an expected PROLOG_KB output artifact name.");
    }
    const prologKbArtifact = outputArtifacts.get(outputKbArtifactName);

    if (!prologKbArtifact || prologKbArtifact.type !== ArtifactType.PROLOG_KB) {
      console.error("DEBUG: All output artifacts from assert workflow:", JSON.stringify(Array.from(outputArtifacts.entries()).map(([k,v]) => ({key:k, id:v.id, type:v.type, content: typeof v.content === 'string' ? v.content.substring(0,100) : typeof v.content}))));
      throw new Error(`Assert workflow (using strategy ${strategy.getName()}) did not produce the expected PROLOG_KB artifact named "${outputKbArtifactName}". Found: ${prologKbArtifact?.type}`);
    }

    const newClausesText = prologKbArtifact.content as string;
    const addedClauses = newClausesText.split('\n').map(c => c.trim()).filter(c => c.length > 0 && c.endsWith('.'));

    if (addedClauses.length > 0) {
      await session.knowledgeBase.addClauses(addedClauses);
      // Optional: Validate after adding. Consider if this should be part of the workflow.
      // const validation = await session.knowledgeBase.validate(this.reasonProvider);
      // if (!validation.valid) { /* handle error */ }
    }

    const currentKbSize = await session.knowledgeBase.getClauseCount();
    const currentKb = await session.knowledgeBase.getKbString();
    return { addedClauses, currentKbSize, knowledgeBase: currentKb };
  }

  public async query(
    sessionId: string,
    nlQuery: string,
    strategyName?: string
  ): Promise<{ prologQuery: QueryString; result: QueryResult; nlAnswer?: string }> {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session with ID "${sessionId}" not found.`);
    }

    const strategy = this.getStrategy(strategyName);
    const nlQueryArtifact = createNLTextArtifact({ content: nlQuery, id: "initialNLQuery" });

    const queryWorkflow = strategy.defineQueryWorkflow(nlQueryArtifact, new Map());

    const initialArtifacts = new Map();
    const inputName = queryWorkflow.expectedInputArtifacts[0]?.name || "userNaturalLanguageQuestion";
    initialArtifacts.set(inputName, nlQueryArtifact);

    const outputArtifacts = await this.workflowExecutor.execute(queryWorkflow, initialArtifacts);

    const outputQueryArtifactName = queryWorkflow.expectedOutputArtifacts.find(oa => oa.type === ArtifactType.QUERY_STRING)?.name;
     if (!outputQueryArtifactName) {
        throw new Error("Query workflow definition does not specify an expected QUERY_STRING output artifact name.");
    }
    const prologQueryArtifact = outputArtifacts.get(outputQueryArtifactName);

    if (!prologQueryArtifact || prologQueryArtifact.type !== ArtifactType.QUERY_STRING) {
      console.error("DEBUG: All output artifacts from query workflow:", JSON.stringify(Array.from(outputArtifacts.entries()).map(([k,v]) => ({key:k, id:v.id, type:v.type, content: typeof v.content === 'string' ? v.content.substring(0,100) : typeof v.content}))));
      throw new Error(`Query workflow (using strategy ${strategy.getName()}) did not produce the expected QUERY_STRING artifact named "${outputQueryArtifactName}". Found: ${prologQueryArtifact?.type}`);
    }

    const prologQuery = prologQueryArtifact.content as QueryString;
    const kbString = await session.knowledgeBase.getKbString();
    const result = await this.reasonProvider.query(kbString, prologQuery);

    // Basic NL Answer Generation (Placeholder - can be a separate workflow)
    let nlAnswer: string;
    if (result.success) {
      if (result.bindings && result.bindings.length > 0) {
        const formattedBindings = result.bindings.map(b =>
          Object.entries(b).map(([key, value]) => `${key} = ${value}`).join(", ")
        ).join("; ");
        nlAnswer = `Yes. Bindings: ${formattedBindings || '(no specific bindings for this success)'}.`;
      } else if (result.bindings === undefined && result.error === undefined) { // Query is true, but no variables to bind (e.g. a fact) or query yielded false
        const isFactualTrue = result.bindings === undefined && !prologQuery.includes("X") && !prologQuery.includes("Y") && !prologQuery.includes("Z"); // very rough check
        if (isFactualTrue && (await this.reasonProvider.query(kbString, prologQuery)).success && (await this.reasonProvider.query(kbString, prologQuery)).bindings === undefined ) { // check if it's true without bindings
             // This case may mean the query was a ground query that is true.
             // Or it yielded 'false'. TauProlog provider returns bindings: undefined for both.
             // We need a better way to distinguish "true." from "false." if reasoner doesn't.
             // For now, assume if no bindings and no error, it's a "yes" or "no" answer.
             // Let's try to re-query for the negation to infer. This is hacky.
             // A better TauProlog provider would return more distinct QueryResult.
             nlAnswer = `The query evaluated to ${result.bindings === undefined ? 'true (with no variable bindings)' : 'false'}.`;
        } else {
             nlAnswer = "No."; // Default for success but no bindings (often means 'false')
        }

      } else { // success: true, bindings: [] (e.g. for `true.`)
        nlAnswer = "Yes.";
      }
    } else {
      nlAnswer = `I encountered an error: ${result.error || 'Unknown reasoner error'}.`;
    }

    return { prologQuery, result, nlAnswer };
  }

  public listStrategies(): { name: string }[] { // Add description later if ITranslationStrategy supports it
    return Array.from(this.strategies.values()).map(s => ({
      name: s.getName(),
    }));
  }
}
