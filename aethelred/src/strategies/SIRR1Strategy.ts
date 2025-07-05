import type { ITranslationStrategy } from '../interfaces/ITranslationStrategy';
import type { Workflow } from '../core/workflow/Workflow';
import type { Artifact, NLTextArtifact, SirJsonArtifact, PrologKbArtifact, ArtifactType } from '../core/workflow/Artifact';
import { ActionType, type LlmGenerateAction, type ProgrammaticTransformAction } from '../core/workflow/Action';
import type { Stage } from '../core/workflow/Stage';
import type { SIRSchema } from '../types/index'; // Assuming SIRSchema is in types/index.ts
import { v4 as uuidv4 } from 'uuid';

// These transformer names would be used to register the actual functions
// with the WorkflowExecutor's ProgrammaticTransformerRegistry.
export const SIR_VALIDATOR_TRANSFORMER = "sirValidatorTransformer";
export const SIR_TO_PROLOG_TRANSFORMER = "sirToPrologTransformer";

// --- Prompts (can be externalized later) ---
const NL_TO_SIR_SYSTEM_PROMPT = `You are an expert AI assistant that converts natural language text into a Structured Intermediate Representation (SIR) JSON object.
The SIR JSON must conform to the following SIRSchema:
{
  "intent": "'FACTS' | 'RULE'", // Is the text asserting facts or defining a rule?
  "facts"?: Array<{ // Only if intent is 'FACTS'
    "predicate": "string", // e.g., "likes", "student_of"
    "arguments": ["string"] // e.g., ["john", "mary"], ["X", "Y"]
  }>,
  "rule"?: { // Only if intent is 'RULE'
    "head": {
      "predicate": "string",
      "arguments": ["string"]
    },
    "body": Array<{ // Conjunction of body goals
      "predicate": "string",
      "arguments": ["string"],
      "negated"?: "boolean" // Optional, true if the goal is negated (e.g., \\+ goal)
    }>
  }
}
Ensure all predicates and arguments are lowercase unless they are variables (which should be uppercase, e.g., X, Person).
Respond ONLY with the valid JSON object. No other text, explanations, or markdown.`;

const getNLtoSIRUserPrompt = (nlText: string): string => `Natural Language Text: "${nlText}"
Convert this text into the SIR JSON format described by the schema.`;


export class SIRR1Strategy implements ITranslationStrategy {
  public readonly name = "SIR-R1";

  getName(): string {
    return this.name;
  }

  defineAssertWorkflow(
    nlTextArtifact: NLTextArtifact,
    _context?: Map<string, Artifact>
  ): Workflow {
    const nlToSirStageId = `sirr1_nl_to_sir_stage_${uuidv4().substring(0,8)}`;
    const validateSirStageId = `sirr1_validate_sir_stage_${uuidv4().substring(0,8)}`;
    const sirToPrologStageId = `sirr1_sir_to_prolog_stage_${uuidv4().substring(0,8)}`;

    // Stage 1: NL to SIR (LLM)
    const nlToSirAction: LlmGenerateAction = {
      type: ActionType.LLM_GENERATE,
      parameters: {
        directSystemPrompt: NL_TO_SIR_SYSTEM_PROMPT,
        directUserPrompt: getNLtoSIRUserPrompt(nlTextArtifact.content),
        outputArtifactType: ArtifactType.SIR_JSON,
        options: { format: 'json' } // Request JSON output if LLM provider supports it (e.g. Ollama)
      }
    };
    const nlToSirStage: Stage = {
      id: nlToSirStageId,
      name: "NL to SIR",
      description: "Translates natural language text to a Structured Intermediate Representation (SIR) JSON using an LLM.",
      action: nlToSirAction,
      // inputMappings: { inputText: nlTextArtifact.id } // Future enhancement for explicit mapping
    };

    // Stage 2: Validate SIR (Programmatic)
    const validateSirAction: ProgrammaticTransformAction = {
      type: ActionType.PROGRAMMATIC_TRANSFORM,
      parameters: {
        transformerName: SIR_VALIDATOR_TRANSFORMER, // This function needs to be registered with WorkflowExecutor
        outputArtifactType: ArtifactType.SIR_JSON, // Outputs validated SIR_JSON or throws error
        // inputArtifactRef: `${nlToSirStageId}.output` // Future: specify input source
      }
    };
    const validateSirStage: Stage = {
      id: validateSirStageId,
      name: "Validate SIR",
      description: "Validates the syntax and schema of the SIR JSON.",
      action: validateSirAction,
    };

    // Stage 3: SIR to Prolog (Programmatic)
    const sirToPrologAction: ProgrammaticTransformAction = {
      type: ActionType.PROGRAMMATIC_TRANSFORM,
      parameters: {
        transformerName: SIR_TO_PROLOG_TRANSFORMER, // This function needs to be registered
        outputArtifactType: ArtifactType.PROLOG_KB,
        // inputArtifactRef: `${validateSirStageId}.output` // Future: specify input source
      }
    };
    const sirToPrologStage: Stage = {
      id: sirToPrologStageId,
      name: "SIR to Prolog",
      description: "Converts validated SIR JSON into Prolog clauses.",
      action: sirToPrologAction,
    };

    return {
      id: `wf_sirr1_assert_${uuidv4().substring(0,8)}`,
      name: "SIR-R1 Assert Workflow",
      description: "Asserts NL text by converting to SIR, validating SIR, then converting SIR to Prolog.",
      startNodeId: nlToSirStageId,
      nodes: {
        [nlToSirStageId]: nlToSirStage,
        [validateSirStageId]: validateSirStage,
        [sirToPrologStageId]: sirToPrologStage,
      },
      edges: [ // Define the linear flow
        { id: uuidv4(), sourceNodeId: nlToSirStageId, targetNodeId: validateSirStageId },
        { id: uuidv4(), sourceNodeId: validateSirStageId, targetNodeId: sirToPrologStageId },
      ],
      expectedInputArtifacts: [
        { name: "userNaturalLanguageText", type: ArtifactType.NL_TEXT, description: "The NL text to assert." }
      ],
      expectedOutputArtifacts: [
        // The final output is Prolog_KB from the last stage
        { name: "prologKnowledgeBase", type: ArtifactType.PROLOG_KB, description: "Prolog clauses generated from the NL text via SIR.", metadata: { sourceNodeOutput: `${sirToPrologStageId}.output` } }
      ],
      metadata: { strategyName: this.name, powerLevel: "Balanced" }
    };
  }

  defineQueryWorkflow(
    nlQuestionArtifact: NLTextArtifact,
    _context?: Map<string, Artifact>
  ): Workflow {
    // For SIR-R1, query workflow can initially be similar to DirectS1 for simplicity.
    // A more advanced version would generate a SIR for the query too.
    const stageId = `sirr1_query_stage_${uuidv4().substring(0,8)}`;

    const llmAction: LlmGenerateAction = {
      type: ActionType.LLM_GENERATE,
      parameters: {
        directSystemPrompt: "You are an expert in translating natural language questions into Prolog queries. " +
                            "Convert the user's question into a syntactically correct Prolog query. " +
                            "The query should end with a period. Variables should be uppercase. " +
                            "For example, 'Who likes Mary?' becomes 'likes(X, mary).'. " +
                            "'Does John like fish?' becomes 'likes(john, fish).'. " +
                            "Do not include the ?- prefix.",
        directUserPrompt: `Translate the following question to a Prolog query:\n\n"${nlQuestionArtifact.content}"`,
        outputArtifactType: ArtifactType.QUERY_STRING,
      }
    };
    const queryStage: Stage = {
      id: stageId,
      name: "NL to Prolog Query (SIR-R1 Fallback)",
      description: "Uses an LLM to directly translate an NL question into a Prolog query string.",
      action: llmAction,
    };

    return {
      id: `wf_sirr1_query_${uuidv4().substring(0,8)}`,
      name: "SIR-R1 Query Workflow (Direct Fallback)",
      description: "A simple workflow to translate an NL question directly to a Prolog query (fallback for SIR-R1).",
      startNodeId: stageId,
      nodes: { [stageId]: queryStage },
      edges: [],
      expectedInputArtifacts: [
        { name: "userNaturalLanguageQuestion", type: ArtifactType.NL_TEXT, description: "The NL question." }
      ],
      expectedOutputArtifacts: [
        { name: "prologQueryString", type: ArtifactType.QUERY_STRING, description: "Prolog query string.", metadata: { sourceNodeOutput: `${stageId}.output` } }
      ],
      metadata: { strategyName: this.name, powerLevel: "Balanced" }
    };
  }
}

/*
Conceptual Programmatic Transformers (to be implemented and registered in WorkflowExecutor context):

// 1. SIR Validator
async function sirValidatorTransformer(
  inputs: Artifact[], // Expects one SIR_JSON artifact
  parameters: any,
  context: WorkflowExecutionContext
): Promise<SirJsonArtifact> {
  const sirArtifact = inputs.find(a => a.type === ArtifactType.SIR_JSON) as SirJsonArtifact | undefined;
  if (!sirArtifact) throw new Error("SIR_VALIDATOR: Input SIR_JSON artifact not found.");

  let sirData: any;
  if (typeof sirArtifact.content === 'string') {
    try {
      sirData = JSON.parse(sirArtifact.content);
    } catch (e: any) {
      throw new Error(`SIR_VALIDATOR: Failed to parse SIR_JSON content string: ${e.message}`);
    }
  } else if (typeof sirArtifact.content === 'object') {
    sirData = sirArtifact.content;
  } else {
    throw new Error("SIR_VALIDATOR: SIR_JSON content is not a string or object.");
  }

  // Basic Schema Validation (can be enhanced with a JSON schema validator like Ajv)
  if (!sirData || (sirData.intent !== 'FACTS' && sirData.intent !== 'RULE')) {
    throw new Error(`SIR_VALIDATOR: Invalid SIR - 'intent' must be 'FACTS' or 'RULE'. Found: ${sirData?.intent}`);
  }
  if (sirData.intent === 'FACTS' && (!Array.isArray(sirData.facts) || sirData.facts.length === 0)) {
    // Allow empty facts array if intent is FACTS but no facts were extracted.
    // if (!Array.isArray(sirData.facts))
    // throw new Error("SIR_VALIDATOR: Invalid SIR - 'facts' must be an array if intent is 'FACTS'.");
  }
  if (sirData.intent === 'RULE' && (!sirData.rule || !sirData.rule.head || !Array.isArray(sirData.rule.body))) {
    throw new Error("SIR_VALIDATOR: Invalid SIR - 'rule' structure is incorrect for intent 'RULE'.");
  }
  // TODO: Add more detailed validation of predicates, arguments, etc.

  return createArtifact(ArtifactType.SIR_JSON, { content: sirData, metadata: { validated: true } }) as SirJsonArtifact;
}

// 2. SIR to Prolog Converter
async function sirToPrologTransformer(
  inputs: Artifact[], // Expects one validated SIR_JSON artifact
  parameters: any,
  context: WorkflowExecutionContext
): Promise<PrologKbArtifact> {
  const sirArtifact = inputs.find(a => a.type === ArtifactType.SIR_JSON) as SirJsonArtifact | undefined;
  if (!sirArtifact) throw new Error("SIR_TO_PROLOG: Input SIR_JSON artifact not found.");
  if (!sirArtifact.metadata?.validated) {
     console.warn("SIR_TO_PROLOG: Input SIR_JSON artifact is not marked as validated. Proceeding cautiously.");
  }

  const sir = sirArtifact.content as SIRSchema;
  const clauses: string[] = [];

  if (sir.intent === 'FACTS' && sir.facts) {
    for (const fact of sir.facts) {
      if (!fact.predicate || !fact.arguments) continue; // Skip malformed facts
      const args = fact.arguments.map(arg => arg.trim()).filter(arg => arg).join(', ');
      if (fact.predicate.trim() && args) {
        clauses.push(`${fact.predicate.trim()}(${args}).`);
      }
    }
  } else if (sir.intent === 'RULE' && sir.rule && sir.rule.head && sir.rule.body) {
    const headPredicate = sir.rule.head.predicate.trim();
    const headArgs = sir.rule.head.arguments.map(arg => arg.trim()).filter(arg => arg).join(', ');
    
    if (!headPredicate || !headArgs) {
        throw new Error("SIR_TO_PROLOG: Rule head is incomplete.");
    }
    const head = `${headPredicate}(${headArgs})`;

    const bodyParts = sir.rule.body.map(bodyPart => {
      if (!bodyPart.predicate || !bodyPart.arguments) throw new Error("SIR_TO_PROLOG: Rule body part is incomplete.");
      const bodyArgs = bodyPart.arguments.map(arg => arg.trim()).filter(arg => arg).join(', ');
      const predicate = `${bodyPart.predicate.trim()}(${bodyArgs})`;
      if (!bodyPart.predicate.trim() || !bodyArgs) throw new Error("SIR_TO_PROLOG: Rule body part predicate or arguments are empty.");
      return bodyPart.negated ? `\\+ ${predicate}` : predicate;
    });
    
    if (bodyParts.length > 0) {
      const body = bodyParts.join(', ');
      clauses.push(`${head} :- ${body}.`);
    } else { // Fact rule, e.g. p(X) :- true.  (or just p(X). if body is empty)
      clauses.push(`${head}.`);
    }
  }

  return createArtifact(ArtifactType.PROLOG_KB, { content: clauses.join('\n') }) as PrologKbArtifact;
}
*/
// Note: The conceptual transformers above need to be:
// 1. Extracted into their own files or a dedicated transformers module.
// 2. Registered with the ProgrammaticTransformerRegistry instance that is passed to WorkflowExecutor.
//    This registration would typically happen in `aethelred/src/api/server.ts` during setup.
//    e.g., programmaticTransformers.set(SIR_VALIDATOR_TRANSFORMER, sirValidatorTransformer);
//           programmaticTransformers.set(SIR_TO_PROLOG_TRANSFORMER, sirToPrologTransformer);
// For now, they are here as comments to illustrate the intended logic for the ProgrammaticTransformActions.
// The WorkflowExecutor will fail if these transformers are not registered when it tries to execute them.
// The `createArtifact` import is also needed if these are moved.
import { createArtifact } from '../core/workflow/Artifact'; // For conceptual transformers if uncommented & moved
import type { WorkflowExecutionContext } from '../core/workflow/WorkflowExecutor'; // For conceptual transformers
