// aethelred/src/index.ts - Test with only Artifact.js import and usage
console.log("Loading Aethelred Core Library (Artifact.js test within full structure)...");

// Only import Artifact related items for this test
import { createNLTextArtifact, Artifact, NLTextArtifact, ArtifactType } from './core/workflow/Artifact.js';
console.log("Artifact.js imported successfully.");

// Comment out other major imports for now
// import { McrOrchestrator } from './core/orchestration/McrOrchestrator.js';
// import { ExecutionEngine } from './core/execution/ExecutionEngine.js';
// import { DirectS1Strategy } from './strategies/DirectS1Strategy.js';
// import type { Workflow } from './core/workflow/Workflow.js';

export function initAethelred() {
  console.log("Aethelred initialized (minimal for Artifact.js test).");
  return true;
}

async function runTestWorkflow() {
  console.log("\n--- Starting Test Workflow Execution (Artifact.js only) ---");
  try {
    const sampleNLText = "John is a student.";
    const nlTextArtifact: NLTextArtifact = createNLTextArtifact({ content: sampleNLText });
    console.log("NLTextArtifact created successfully:");
    console.log(`  ID: ${nlTextArtifact.id}`);
    console.log(`  Type: ${nlTextArtifact.type}`);
    console.log(`  Content: "${nlTextArtifact.content}"`);
    console.log("--- Test (Artifact.js only) Finished ---");
  } catch (error) {
    console.error("--- Test (Artifact.js only) Failed ---");
    console.error("Error during artifact creation test:", error);
  }
}

// If this file is run directly
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);

if (process.argv[1] === path.resolve(__filename)) {
  console.log("-----------------------------------------------------");
  console.log("aethelred/src/index.ts executed directly. Running Artifact.js test...");
  console.log("-----------------------------------------------------");
  initAethelred();
  runTestWorkflow().then(() => {
    console.log("\nArtifact.js test workflow promise resolved.");
    console.log("-----------------------------------------------------");
  }).catch(e => {
    console.error("\nError running Artifact.js test workflow from direct execution:", e);
    console.log("-----------------------------------------------------");
  });
}
