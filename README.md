````markdown
# 🧠 Model Context Reasoner (MCR) ✨

The **Model Context Reasoner (MCR)** is a powerful system designed to act as a bridge between Large Language Models (LLMs) and formal logic reasoners (specifically Prolog). It enables applications to leverage sophisticated logical reasoning capabilities by translating natural language into formal logic and managing a persistent knowledge base.

The current primary implementation of MCR is **Aethelred**, a TypeScript-based system focusing on modularity and extensible Translation Strategies.

MCR is built with a "guitar pedal" 🎸 philosophy: a single, plug-and-play unit that adds advanced reasoning to your AI stack.

## 🌉 The MCR Philosophy: Bridging Worlds

MCR adds **general-purpose reasoning** to Language Model applications. It's a self-contained unit that you can easily "plug in" to an existing system (via its API) to empower it with logic.

**Vision: The Symbiosis of Language and Logic:**
Large Language Models (LLMs) excel at understanding and generating human language, accessing vast knowledge, and performing nuanced contextual tasks. Formal logic systems, like Prolog, offer precision, verifiability, and the ability to perform complex deductive and inductive reasoning over structured knowledge.

MCR's vision is to create a seamless symbiosis between these two powerful paradigms. We believe that the future of advanced AI applications lies in systems that can:

- **Understand intent** through natural language (LLMs).
- **Structure knowledge** into formal representations (LLMs + MCR).
- **Reason rigorously** over that knowledge (Prolog via MCR).
- **Communicate results** back in an understandable way (MCR + LLMs).

This combination unlocks possibilities for more robust, explainable, and sophisticated AI systems.

## 🔑 Core Concepts (Aethelred Implementation)

The Aethelred implementation embodies these core concepts:

1.  **MCR as a Service ⚙️**: Aethelred can run as a background HTTP server (Express.js based), exposing its functionality via a RESTful API.
2.  **Stateful Sessions 💾**: Manages persistent reasoning contexts where facts asserted are remembered for subsequent queries.
3.  **LLM-Powered Translation 🗣️<->🧠**: Utilizes LLMs to translate between human language and Prolog.
4.  **Translation Strategies**: Employs a system of pluggable strategies for converting natural language to symbolic logic (see "System Specification" below).
5.  **Modular Design**: Built with TypeScript for strong typing and better maintainability.

For more details on Aethelred's specific architecture and features, please refer to the [Aethelred System Specification](#system-specification-model-context-reasoner-mcr) section below and the `aethelred/README.md` file.

## 🚀 Getting Started with Aethelred

The Aethelred system is the current focus of development.

**1. Prerequisites:**
   - Ensure you have [Bun](https://bun.sh/) installed (version >= 1.0.0).
   - Node.js (>=18.0.0) is also required by Bun.

**2. Clone & Install:**

   ```bash
   git clone https://github.com/yourusername/model-context-reasoner.git # Replace with the actual repository URL
   cd model-context-reasoner
   # Install root dependencies (if any, primarily for tools like Prettier)
   npm install
   # Install Aethelred specific dependencies
   cd aethelred
   bun install
   cd ..
   ```

**3. Configure LLM:**
   Create a `.env` file in the project root (copy from `.env.example`) and add your chosen LLM provider API key and other settings as required by Aethelred. Refer to `aethelred/src/providers/` for supported LLMs and their configuration.

**4. Running Aethelred:**
   To start the Aethelred server:
   ```bash
   # From the project root
   npm run start
   # OR directly using bun from the project root
   # bun run aethelred/index.ts
   # OR from the aethelred directory
   # cd aethelred
   # bun run start
   ```
   The Aethelred server (an Express app) will typically start on a configured port (e.g., 8080 or 3000, check Aethelred's configuration).

**5. Interacting with Aethelred:**
   Aethelred exposes a RESTful API. You can use tools like `curl`, Postman, or any HTTP client to interact with it. Refer to the [Aethelred System Specification](#60-api-specification) section below for API details. (Note: This API specification is a general guideline and Aethelred's specific endpoints should be verified from its source code in `aethelred/src/index.ts`).

For more detailed information on Aethelred, including its internal structure and development, see `aethelred/README.md`.

## Code Guidelines

- Aim for self-documenting code through clear naming and structure.
- Use TSDoc for public functions/modules in the Aethelred (TypeScript) codebase: document parameters, return values, and purpose.
- Comment complex or non-obvious logic.
- Follow standard TypeScript best practices.
- Formatting is enforced by Prettier.

---

## System Specification: Model Context Reasoner (MCR)

This section outlines the formal specification for the Model Context Reasoner (MCR) system, which guides the Aethelred implementation.

**Version:** 1.0
**Status:** DRAFT
**Date:** 2025-07-03

#### 1.0 Overview

This document specifies the architecture and components of the Model Context Reasoner (MCR), a neuro-symbolic system designed to translate unstructured natural language into a formal, symbolic knowledge base (KB).

The primary objective of the MCR is to enable precise, auditable reasoning over user-provided information by leveraging the semantic understanding of Large Language Models (LLMs) and the strict logical inference of symbolic reasoners.

A foundational principle of the MCR is the explicit management of **Translation Strategies**. A Translation Strategy is a pluggable module that defines a complete, end-to-end process for converting natural language into symbolic logic. This architectural choice allows the system to empirically measure, compare, and evolve different translation methodologies, ensuring adaptability and continuous improvement.

#### 2.0 Core Concepts

**2.1. Session**
A **Session** is an isolated reasoning context. It represents a single, coherent workspace for a user, containing a dedicated Knowledge Base and associated state.

**2.2. Knowledge Base (KB)**
The **Knowledge Base** is a collection of symbolic logic clauses (facts and rules) that represent the state of knowledge within a Session. The KB is expressed in a formal language amenable to symbolic reasoners (e.g., Prolog).

**2.3. Translation Strategy**
A **Translation Strategy** is an encapsulated, interchangeable component that defines the complete logic for converting natural language into one or more symbolic clauses. Each strategy embodies a specific methodology, including its own set of prompts, processing steps, and validation logic.

**2.4. Structured Intermediate Representation (SIR)**
A **Structured Intermediate Representation** is a formal data structure (e.g., a JSON object) used by advanced Translation Strategies to decouple semantic extraction from syntactic generation. The LLM's task is to populate the SIR with the meaning of a sentence, which is then programmatically and deterministically converted into the final symbolic syntax. This mitigates the risk of LLM-induced syntax errors.

#### 3.0 System Architecture

The MCR is defined by a multi-layered, service-oriented architecture that promotes modularity and separation of concerns.

```
+-------------------------------------------------------------+
|                     Presentation Layer                      |
|            (e.g., GUI Workbench, CLI, API Client)           |
+-------------------------------------------------------------+
                              | (Network API)
+-------------------------------------------------------------+
|                          API Layer                          |
|    (Endpoint Definitions, Request/Response Serialization)   |
+-------------------------------------------------------------+
                              | (Service Interface)
+-------------------------------------------------------------+
|                         Service Layer                       |
|                   (MCR Service Orchestrator)                |
+-------------------------------------------------------------+
      | (Uses)           | (Uses)           | (Uses)
+---------------+  +-----------------+  +------------------+
| ITranslation  |  | ILlmProvider    |  | IReasonProvider  |
|   Strategy    |  |   (Interface)   |  |   (Interface)    |
|  (Interface)  |  +-----------------+  +------------------+
+---------------+           |                  |
      | (Implements)        | (Implements)     | (Implements)
+---------------+  +-----------------+  +------------------+
| Direct-S1     |  | OllamaProvider  |  | PrologProvider   |
| SIR-R1        |  | GeminiProvider  |  | DatalogProvider  |
| ...           |  | ...             |  | ...              |
+---------------+  +-----------------+  +------------------+
```

*   **Presentation Layer:** Any user-facing application that consumes the MCR's API.
*   **API Layer:** Defines the formal contract for interacting with the MCR. It is stateless and forwards requests to the Service Layer.
*   **Service Layer:** The core orchestrator (`MCR Service`). It manages the business logic of a request (e.g., "assert this text") by invoking the currently selected Translation Strategy and the necessary providers.
*   **Provider & Strategy Interfaces:** A set of abstract contracts that define the capabilities of key components. This allows for pluggable implementations.
*   **Implementation Layer:** Concrete implementations of the interfaces (e.g., a specific `OllamaProvider` for an LLM, a `PrologProvider` for reasoning, and various `TranslationStrategy` modules).

#### 4.0 Component Specification

**4.1. MCR Service (Orchestrator)**
The central service responsible for executing user requests.
*   **Responsibilities:**
    *   Managing the lifecycle of a request.
    *   Selecting and invoking the appropriate Translation Strategy.
    *   Coordinating calls between the LLM Provider and the Reasoner Provider.
    *   Managing session state via the Context Provider (not shown in diagram for simplicity, but implied for stateful operations).

**4.2. ITranslationStrategy (Interface)**
Defines the contract for any Translation Strategy.
*   **Methods:**
    *   `getName(): string`: Returns the unique name of the strategy (e.g., "SIR-R1").
    *   `assert(text: string, llmProvider: ILlmProvider): Promise<Clause[]>`: Takes natural language text and returns a list of one or more symbolic clauses.
    *   `query(text: string, llmProvider: ILlmProvider): Promise<QueryString>`: Takes a natural language question and returns a single, well-formed query string.
*   **Types:**
    *   `Clause`: A string representing a single, syntactically correct fact or rule.
    *   `QueryString`: A string representing a single, syntactically correct query.

**4.3. ILlmProvider (Interface)**
Defines the contract for an LLM service provider.
*   **Methods:**
    *   `generate(prompt: string): Promise<string>`: Sends a prompt to the LLM and returns its raw text response.

**4.4. IReasonProvider (Interface)**
Defines the contract for a symbolic reasoning engine.
*   **Methods:**
    *   `query(kb: string, query: QueryString): Promise<QueryResult>`: Executes a query against a knowledge base and returns the results.
    *   `validate(kb: string): Promise<ValidationResult>`: Checks a knowledge base for syntactic correctness.
*   **Types:**
    *   `QueryResult`: A structured representation of the reasoner's findings (e.g., a list of variable bindings or a boolean).
    *   `ValidationResult`: An object indicating whether the KB is valid and providing an error message if not.

#### 5.0 Example Translation Strategies

**5.1. Strategy: `Direct-S1` (Direct-to-Symbolic, Level 1)**
*   **Description:** A baseline strategy that prompts the LLM for direct symbolic output. Prone to errors but useful for benchmarking.
*   **`assert` Logic:**
    1.  Generate a simple prompt asking the LLM to convert the input text into one or more symbolic facts or rules.
    2.  Invoke the `ILlmProvider`.
    3.  Perform minimal, regex-based post-processing on the returned string to split it into clauses.
    4.  Return the resulting list of clauses.
*   **`query` Logic:**
    1.  Generate a simple prompt asking the LLM to convert the input question into a symbolic query.
    2.  Invoke the `ILlmProvider`.
    3.  Return the cleaned-up string.

**5.2. Strategy: `SIR-R1` (Structured Intermediate Representation, Robust, Level 1)**
*   **Description:** A robust, multi-stage strategy that uses a Structured Intermediate Representation (SIR) to ensure syntactic correctness. This is the recommended production-grade approach.
*   **`assert` Logic:**
    1.  **Intent Classification:** Generate a prompt to classify the input text as asserting `FACTS` or a `RULE`. Invoke the LLM.
    2.  **SIR Generation:** Based on the intent, select a prompt that instructs the LLM to generate an SIR. The prompt must include the SIR schema definition and few-shot examples. Invoke the LLM.
    3.  **SIR Validation:** Parse and validate the returned string against the expected SIR schema.
    4.  **Syntactic Translation:** Programmatically traverse the validated SIR data structure and deterministically generate the corresponding, syntactically perfect symbolic clauses.
    5.  Return the list of generated clauses.
*   **`query` Logic:**
    1.  Generate a prompt instructing the LLM to produce a symbolic query, providing strict instructions on variable casing.
    2.  Invoke the `ILlmProvider`.
    3.  Perform minimal cleaning (e.g., trim whitespace) and return the result.

#### 6.0 API Specification

The MCR service (as implemented by Aethelred) exposes a RESTful API for interaction. The following is a general specification; actual endpoints and behavior should be confirmed by inspecting Aethelred's source code (`aethelred/src/index.ts` and related routing files).

*   **`POST /sessions`**
    *   **Description:** Creates a new reasoning session.
    *   **Response Body:** `{ "sessionId": "string" }`

*   **`POST /sessions/{sessionId}/assert`**
    *   **Description:** Asserts new knowledge into the session's KB using the currently configured Translation Strategy.
    *   **Request Body:** `{ "text": "string" }`
    *   **Response Body:** `{ "addedClauses": ["string"], "knowledgeBase": "string" }` (Example, may vary)

*   **`POST /sessions/{sessionId}/query`**
    *   **Description:** Poses a natural language query to the session's KB.
    *   **Request Body:** `{ "query": "string" }`
    *   **Response Body:** `{ "prologQuery": "string", "rawResult": object, "naturalLanguageAnswer": "string" }` (Example, may vary)

*   **`PUT /sessions/{sessionId}/kb`**
    *   **Description:** Directly overwrites the entire KB of a session. The new KB is validated before being saved.
    *   **Request Body:** `{ "knowledgeBase": "string" }`
    *   **Response Body:** `200 OK` (Example, may vary)

*   **`PUT /config/translationStrategy`**
    *   **Description:** Sets the active Translation Strategy for the system (if this endpoint is implemented by Aethelred).
    *   **Request Body:** `{ "strategyName": "string" }`
    *   **Response Body:** `200 OK` (Example, may vary)

*(Note: The API for Aethelred is defined in its own module and may evolve. Consult `aethelred/src/index.ts` and related files for the most current API structure.)*

#### 7.0 Evolution & Advanced Capabilities

The MCR architecture is designed to support future enhancements.

**7.1. Strategy Management & Evaluation**
A meta-layer service responsible for managing the lifecycle of Translation Strategies.
*   **Benchmarking:** The system shall support a standardized benchmark suite (a "golden dataset" of NL-to-Symbolic mappings) to evaluate strategies against metrics like syntactic accuracy, semantic correctness, and resource cost (latency, tokens).
*   **Automated Optimization:** The system should facilitate an automated loop where a "Strategy Optimizer" agent can programmatically generate variations of existing strategy prompts, benchmark them, and promote superior versions.

**7.2. Operational Enhancements**
*   **Self-Correction:** If a strategy step fails (e.g., the LLM produces an invalid SIR), the system should be capable of automatically re-prompting the LLM with the context of the error, asking it to correct its previous output.
*   **Knowledge Retraction:** The system shall be extended to understand commands for retracting or modifying existing knowledge, requiring extensions to intent classification and the generation of retraction clauses.
*   **Explanatory Reasoning:** The `IReasonProvider` interface shall be extended to optionally return a proof trace. A dedicated LLM prompt will then translate this formal trace into a human-readable explanation of the reasoning steps.

**7.3. Paradigm Expansion**
*   **Hybrid Reasoning:** The system shall support a fallback mechanism where, if a symbolic query yields no results, the query can be re-posed to the base `ILlmProvider` for a general, sub-symbolic lookup.
*   **Agentic Tooling:** The MCR service shall be designed to be easily integrated as a "tool" within a larger AI agent framework, allowing an autonomous agent to delegate structured reasoning tasks to the MCR.