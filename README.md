````markdown
# 🧠 Model Context Reasoner (MCR) ✨

**For a high-level, marketing-oriented overview of MCR, its applications, and benefits, please see our [OVERVIEW.md](OVERVIEW.md).**

The **Model Context Reasoner (MCR)** is a powerful, API-driven system designed to act as a bridge between Large Language Models (LLMs) and formal logic reasoners (specifically Prolog). It enables applications to leverage sophisticated logical reasoning capabilities by translating natural language into formal logic and managing a persistent knowledge base through stateful sessions.

MCR is built with a "guitar pedal" 🎸 philosophy: a single, plug-and-play unit that adds advanced reasoning to your AI stack with minimal setup.

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

## 🔑 Core Concepts

1.  **MCR as a Service ⚙️**: MCR runs as a background HTTP server, exposing its functionality via a RESTful API. Any application can integrate with it.
2.  **Stateful Sessions 💾**: Clients create a `sessionId` to establish a persistent reasoning context. Facts asserted within that session are remembered for subsequent queries.
3.  **LLM-Powered Translation 🗣️<->🧠**: MCR utilizes LLMs to translate between human language and Prolog, abstracting this complexity.

## 🚀 Features

- **🧩 Modularity**: Structured into logical components (Config, Logger, LLM Service, Reasoner Service, API Handlers).
- **🤖 Extensible LLM Support**: Supports multiple LLM providers (OpenAI, Gemini, Ollama, etc.), selectable via configuration. (Refer to `.env.example` for details).
- **📚 Dynamic Lexicon Summary**: Automatically builds a lexicon of known predicates (name/arity) from asserted facts within a session. This summary is provided to the LLM during translation to improve consistency and accuracy in generating Prolog facts, rules, and queries. It helps the LLM prefer existing predicates and understand their usage.
- **🛡️ Robust Error Handling**: Custom `ApiError` class and centralized error-handling.
- **✅ Configuration Validation**: Checks for required API keys and settings on startup.
- **📦 Dependency Management**: Uses `package.json` for Node.js dependencies.
- **💬 Interactive TUI**: An Ink-based Terminal User Interface for chat, session management, and more.
- **⚙️ CLI**: A command-line interface for server control, direct API interaction, demos, and a sandbox mode.
- **📃 API**: A comprehensive RESTful API for programmatic integration.

## 🏛️ System Architecture Diagram

The following diagram illustrates the main components of the MCR system, including the core reasoning services and the Evolution Engine:

```mermaid
graph TD
    subgraph MCR Evolution Engine
        direction LR
        CO[Optimization Coordinator]
        SE[Strategy Evolver]
        CG[Curriculum Generator]
        PD[Performance Database]

        CO -- Selects & Mutates (via SE) --> SE
        CO -- Generates (via CG) --> CG
        SE -- Stores Evolved Strategy --> SM[Strategy Manager]
        CG -- Stores New Eval Cases --> EvalCasesDir[/src/evalCases/generated/]
        CO -- Triggers Evaluation --> EV[Evaluator]
        EV -- Stores Results --> PD
        CO -- Queries for Selection --> PD
    end

    subgraph MCR Core System
        direction LR
        MCR_Service[MCR Service]
        SM -- Loads Strategies --> MCR_Service
        SEcore[Strategy Executor]
        MCR_Service -- Uses --> SEcore
        LLM[LLM Service]
        RS[Reasoner Service]
        SMgr[Session Manager]
        OS[Ontology Service]

        SEcore -- Uses --> LLM
        MCR_Service -- Uses --> RS
        MCR_Service -- Uses --> SMgr
        MCR_Service -- Uses --> OS

        IR[Input Router]
        MCR_Service -- Uses for Routing --> IR
        IR -- Queries for Best Strategy --> PD
    end

    CLI_API[CLI / API Clients] -- Interact --> MCR_Service
    EV -- Evaluates Strategies from --> SM
    EV -- Uses Eval Cases from --> EvalCasesDir

    SM -- Loads Strategies from --> StrategiesDir[/strategies/]


    classDef engine fill:#f9f,stroke:#333,stroke-width:2px;
    classDef core fill:#lightgrey,stroke:#333,stroke-width:2px;
    classDef external fill:#bbf,stroke:#333,stroke-width:2px;
    classDef db fill:#FFD700,stroke:#333,stroke-width:2px;

    class CO,SE,CG,EV,IR engine;
    class MCR_Service,SM,SEcore,LLM,RS,SMgr,OS core;
    class CLI_API external;
    class PD,EvalCasesDir,StrategiesDir db;
```

## 🏁 Quick Start

This section guides you through getting MCR up and running quickly for development or local use. For using MCR as a published package in your own project, see the "📦 Using MCR as a Package" section below.

**1. Clone & Install (for Development):**

```bash
git clone https://github.com/yourusername/model-context-reasoner.git # Replace with the actual repository URL
cd model-context-reasoner
npm install
```
````

**2. Configure LLM:**
Create a `.env` file in the project root (copy from `.env.example`) and add your chosen LLM provider API key and settings.

**3. Start the MCR Server:**

```bash
node mcr.js
# OR using the CLI (from the project root):
# ./cli.js start-server
```

The server will start, typically on `http://localhost:8080`.

**4. Use the Interactive TUI Chat:**
In another terminal, once the server is running (from the project root):

```bash
./cli.js chat
```

This launches the Ink-based TUI. Type `/help` for commands.

**5. Alternative Simple Chat (from the project root):**

```bash
npm run chat
# OR
node chat.js
```

This runs a simpler inquirer-based chat interface.

## 📦 Using MCR as a Package

Once MCR is published, you can install it in your Node.js project:

```bash
npm install model-context-reasoner
```

After installation, MCR primarily provides two ways to be utilized:

**1. Running the MCR Server:**
The core functionality of MCR is delivered via its server. You can start it from your project's `node_modules` directory or using a script in your `package.json`.

- **From `node_modules`:**

  ```bash
  node ./node_modules/model-context-reasoner/mcr.js
  ```

  Ensure you have a `.env` file configured in your project's root directory, or that the necessary environment variables (like `MCR_LLM_PROVIDER`, `OPENAI_API_KEY`, etc.) are set in your environment. MCR will look for a `.env` file in the current working directory from where `node` is executed.

- **Using `npx` (recommended for easy execution):**
  `npx` can execute package binaries. If MCR's server script was made a bin entry, this would be simpler. For now, `npx model-context-reasoner` would attempt to run `mcr.js` if `mcr.js` itself were the bin, but `cli.js` is the registered bin.
  Starting the server directly via `npx` for `mcr.js` is not straightforward unless `mcr.js` is also added to `bin` in `package.json`.

- **Via `package.json` script in your project:**
  In your project's `package.json`:
  ```json
  "scripts": {
    "start-mcr": "node ./node_modules/model-context-reasoner/mcr.js"
  }
  ```
  Then run:
  ```bash
  npm run start-mcr
  ```

**2. Using the `mcr-cli` Command-Line Tool:**
When you install the `model-context-reasoner` package, the `mcr-cli` command should become available in your environment (if `npm install -g` was used or if your local `node_modules/.bin` is in your PATH).

```bash
mcr-cli --help # See available commands
mcr-cli start-server # Starts the MCR server
mcr-cli chat # Starts the TUI chat (requires server to be running)
mcr-cli status
mcr-cli create-session
# ... and other CLI commands
```

The `mcr-cli` will also respect the `.env` file in the directory from which it's run.

**3. Programmatic API Interaction:**
Once the MCR server is running (either started from a cloned MCR repository or from an installed package as described above), your application can interact with it programmatically by making HTTP requests to its REST API.

Refer to the **🔌 API Reference** section below for details on available endpoints, request formats, and response structures. You can use any HTTP client library in your language of choice (e.g., `axios` or `node-fetch` for Node.js, `requests` for Python).

**Example (Node.js using `axios`):**

```javascript
const axios = require('axios');

async function createMcrSession() {
  try {
    const response = await axios.post('http://localhost:8080/api/v1/sessions'); // Adjust URL if needed
    console.log('Session created:', response.data);
    return response.data.id;
  } catch (error) {
    console.error(
      'Error creating MCR session:',
      error.response ? error.response.data : error.message
    );
  }
}

createMcrSession();
```

## 🛠️ Development Setup and Installation

1.  **Clone the Repository**:
    ```bash
    git clone <repository_url> # Replace with the actual repository URL
    cd new-mcr # Or your chosen directory name
    ```
2.  **Install Dependencies**:
    ```bash
    npm install
    ```
3.  **Create `.env` file**:
    Copy `.env.example` to `.env` in the project root. Edit it to include your LLM API keys and any other necessary configurations. Refer to `.env.example` for all available options.
    **Important:** The MCR server performs configuration validation on startup. If you select an `MCR_LLM_PROVIDER` that requires an API key (e.g., "gemini", "openai", "anthropic"), you **must** provide the corresponding API key environment variable (e.g., `GEMINI_API_KEY`). Failure to do so will prevent the server from starting. Ollama, when run locally, typically does not require an API key.

    Example for OpenAI:

    ```dotenv
    # For OpenAI
    MCR_LLM_PROVIDER="openai"
    OPENAI_API_KEY="sk-..."
    # MCR_LLM_MODEL_OPENAI="gpt-4o" # Optional
    ```

4.  **Run the MCR Server**:
    ```bash
    node mcr.js
    ```
    The server will log its status, including the active LLM provider and listening port.

#### Debugging Configuration

MCR uses an environment variable `MCR_DEBUG_LEVEL` to control the verbosity of debug information in API responses. This is useful for development and troubleshooting.

- **`MCR_DEBUG_LEVEL`**: Set this in your `.env` file.
  - `none` (Default): No detailed debug information is included in API responses. This is recommended for production.
  - `basic`: Includes essential debug fields (like the generated Prolog query) and summaries of potentially large data (like knowledge base size).
  - `verbose`: Includes full, detailed debug information in the `debugInfo` field of responses (e.g., full knowledge base snapshot, detailed LLM outputs for intermediate steps). **Use with caution, as this can expose large amounts of data and potentially sensitive information.**

For specific endpoints like `POST /api/v1/sessions/:sessionId/query` and `POST /api/v1/sessions/:sessionId/explain-query`, clients can request debug information by including `"options": { "debug": true }` in the JSON request body.
The actual detail level of the returned `debugInfo` object will still be governed by the server's `MCR_DEBUG_LEVEL` setting. For example, if `MCR_DEBUG_LEVEL` is "basic", sending `"debug": true` will yield basic debug info, not verbose. If `MCR_DEBUG_LEVEL` is "none", no `debugInfo` will be returned even if the client requests it.

## 💬 Interactive TUI (`./cli.js chat`)

The `./cli.js chat` command launches a comprehensive Ink-based Text User Interface. This is a rich interface for interacting with MCR.

- **Automatically starts/uses MCR server.**
- **Status Bar**: Displays session ID, server status, LLM info.
- **Command System**: Use slash commands (e.g., `/help`, `/create-session`, `/assert <text>`, `/query <text>`).
- **Interactive Output**: View responses from MCR and command outputs.

**Key TUI Commands (type `/help` in TUI for a full list):**

- `/help`: Show help.
- `/create-session`: Create a new session.
- `/assert <natural language text>`: Assert a fact.
- `/query <natural language question>`: Ask a question.
- `/exit`: Exit the TUI.

## 💻 CLI (`./cli.js`)

MCR offers direct Command Line Interface (CLI) commands via `./cli.js` (or `mcr-cli` if linked). Use `./cli.js --help` to see all commands.

**Core CLI Commands Examples:**

- `./cli.js status`: Checks server status.
- `./cli.js start-server`: Starts the MCR server.
- `./cli.js create-session`: Creates a session and prints its ID.
- `./cli.js assert <sessionId> "Fact"`: Asserts a fact.
- `./cli.js query <sessionId> "Question?"`: Queries a session.
- `./cli.js list-ontologies`: Lists global ontologies.
- `./cli.js demo run <example-name>`: Runs predefined demonstrations. See below for more details.
- `./cli.js sandbox`: Starts an interactive sandbox for experimenting with NL to Logic steps.
- `./cli.js perf-dashboard`: Launches an interactive TUI to explore performance results and strategy evolution.

## 🤖 MCR Evolution Engine

MCR includes a sophisticated **Evolution Engine**, a supervisory control loop designed to autonomously discover, evaluate, and refine translation strategies. This engine works to continuously improve MCR's performance, accuracy, and efficiency over time.

The system is bootstrapped with functional, human-authored strategies, ensuring immediate usability. The evolution process runs asynchronously (typically offline), augmenting the pool of available strategies.

### Core Components:

1.  **Optimization Coordinator (`src/evolution/optimizer.js`)**:
    - Orchestrates the entire evolution loop.
    - On first run (or with `--runBootstrap`), it executes all pre-defined strategies against an evaluation curriculum to establish baseline performance data in the `Performance Database`.
    - Selects existing strategies for improvement based on performance data.
    - Invokes the `StrategyEvolver` to create new candidate strategies.
    - May invoke the `CurriculumGenerator` to create new, targeted evaluation examples.
    - Evaluates new strategies and persists their performance.

2.  **Strategy Evolver (`src/evolution/strategyEvolver.js`)**:
    - Creates new candidate strategies by mutating existing ones.
    - The primary mutation method is "Iterative Critique":
      1.  Selects a node in a strategy graph (e.g., an `LLM_Call` node).
      2.  Extracts its prompt and identifies failing examples from the `Performance Database`.
      3.  Uses an LLM to critique and rewrite the prompt to address these failures.
      4.  Creates a new strategy JSON definition with the updated prompt.

3.  **Curriculum Generator (`src/evolution/curriculumGenerator.js`)**:
    - Expands the set of evaluation cases to prevent overfitting and ensure strategies are robust.
    - Analyzes performance data to identify weaknesses or gaps in the current curriculum.
    - Uses an LLM to generate new `EvaluationCase` objects targeting these areas. These are saved in `src/evalCases/generated/`.

4.  **Input Router (`src/evolution/inputRouter.js`)**:
    - Integrated into `mcrService.js` to select the optimal strategy for a given live input at runtime.
    - Performs a quick classification of the input.
    - Queries the `Performance Database` for the strategy with the best aggregate performance (metrics, cost, latency) for that input class and the current LLM.

### Performance Database (`performance_results.db`)

This SQLite database is crucial for the Evolution Engine. It stores the detailed results of every evaluation run.

- **Purpose**:
  - Provides data for the `OptimizationCoordinator` to select strategies for evolution.
  - Gives context to the `StrategyEvolver` (e.g., failing examples).
  - Informs the `CurriculumGenerator` about areas needing more test cases.
  - Allows the `InputRouter` to make data-driven decisions at runtime.
  - Serves as a rich dataset for analyzing strategy performance and for potential fine-tuning of models.
- **Schema (`performance_results` table)**:
  - `id` (INTEGER PK): Unique ID for the run.
  - `strategy_hash` (TEXT): SHA-256 hash of the strategy's JSON definition.
  - `llm_model_id` (TEXT): Identifier of the LLM used (e.g., "ollama/llama3").
  - `example_id` (TEXT): ID of the `EvaluationCase` used.
  - `metrics` (JSON TEXT): JSON object of metric scores (e.g., `{ "exactMatchProlog": 1, ... }`).
  - `cost` (JSON TEXT): JSON object of cost metrics (e.g., `{ "prompt_tokens": 120, "completion_tokens": 80, "total_tokens": 200 }`).
  - `latency_ms` (INTEGER): Total time for the execution in milliseconds.
  - `timestamp` (DATETIME): UTC timestamp of the evaluation run.
  - `raw_output` (TEXT): The final string or JSON array output of the strategy.

### Running the Optimizer

The Optimization Coordinator can be run as a standalone script:

```bash
node src/evolution/optimizer.js [options]
```

**Common Options:**

- `--iterations <num>` or `-i <num>`: Number of evolution cycles to run (default: 1).
- `--bootstrapOnly`: Only run the bootstrap/baselining step and exit.
- `--runBootstrap`: Run bootstrap before starting iterations (useful if DB is empty or needs refreshing).
- `--evalCasesPath <path>`: Path to evaluation cases (default: `src/evalCases`).

**Example:**
To run bootstrap and then 3 evolution iterations:

```bash
node src/evolution/optimizer.js --runBootstrap --iterations 3
```

### Performance Dashboard TUI

To explore the `performance_results.db` and view strategy performance, use the Performance Dashboard TUI:

```bash
./cli.js perf-dashboard
```

This interface allows you to:

- List all evaluated strategy hashes.
- Select a strategy to view its individual evaluation runs.
- See detailed metrics, cost, latency, and raw output for each run.
- View overall summary statistics from the database.

## 🧪 Enhanced Demo Runner (`node demo.js`)

A new enhanced demo runner (`demo.js`) is available to showcase various MCR capabilities and to help with debugging and telemetry gathering.

**Features:**

- **Multiple Examples:** Includes a range of examples from simple assertions to complex ontology-based reasoning and error handling scenarios.
- **Command-Line Selection:** Specify which example to run.
- **Detailed Logging:** Colorized and structured logs for all activities, API calls, and internal logic. Very useful for debugging.
- **Assertions:** Examples can include assertions to test specific logic conditions.

**How to Use:**

1.  **Ensure the MCR server is running:**

    ```bash
    node mcr.js
    # OR
    ./cli.js start-server
    ```

2.  **List available examples:**

    ```bash
    node demo.js --list
    # or
    node demo.js -l
    ```

    This will output a list of example keys and their descriptions.

3.  **Run a specific example:**
    Replace `[example-name]` with one of the keys obtained from the list.
    ```bash
    node demo.js [example-name]
    ```
    For example:
    ```bash
    node demo.js simple-assertions
    node demo.js family-ontology
    node demo.js scientific-kb
    node demo.js error-handling
    ```

**Available Examples (as of this writing):**

- `simple-assertions`: A basic demo asserting simple facts and querying them.
- `family-ontology`: Demonstrates reasoning with a pre-loaded family ontology (`family.pl`).
- `scientific-kb`: A demo asserting facts about a simple scientific domain (chemistry/physics) and querying them.
- `error-handling`: Demonstrates how the system handles various error conditions and invalid inputs.

**Adding New Examples:**

1.  Create a new JavaScript file in the `src/demos/` directory (e.g., `myNewDemo.js`).
2.  The file should export a class that extends the `Example` class (from `demo.js`).

    ```javascript
    // src/demos/myNewDemo.js
    const { Example } = require('../../demo'); // Adjust path if structure changes

    class MyNewDemo extends Example {
      getName() {
        return 'My New Demo'; // User-friendly name
      }

      getDescription() {
        return 'This is a description of my new demo.';
      }

      async run() {
        this.dLog.heading(`Starting ${this.getName()}`);
        // Your demo logic here
        // Use this.createSession(), this.assertFact(), this.query(), this.assertCondition(), etc.
        // All these methods use this.dLog for detailed logging.
        await this.createSession();
        await this.assertFact('My demo is working.');
        const result = await this.query('Is my demo working?');
        await this.assertCondition(
          result && result.answer.includes('yes'),
          'Demo works!',
          'Demo failed!'
        );
        this.dLog.success('My New Demo completed!');
      }
    }
    module.exports = MyNewDemo;
    ```

3.  The `demo.js` script will automatically discover any `*Demo.js` files in `src/demos/` that export a class extending `Example`. The command-line key for the demo will be derived from its `getName()` method (e.g., "My New Demo" becomes "my-new-demo").

## 📊 Evaluation System (`src/evaluator.js`)

MCR includes a comprehensive evaluation system to test the accuracy and performance of its translation strategies.

**Purpose:**
The evaluator runs a suite of test cases, each defining a natural language input, the expected Prolog translation, and (for queries) the expected natural language answer. It then compares the MCR's actual output against these expectations using various metrics.

**Running the Evaluator:**
Execute the script from the project root:

```bash
node src/evaluator.js [options]
```

**Command-Line Options:**

- `--casesPath <path>` or `-p <path>`: Specifies the path to the directory containing evaluation case files (e.g., `src/evalCases`). Defaults to `src/evalCases`.
- `--strategies <list>` or `-s <list>`: A comma-separated list of strategy names to run (e.g., `SIR-R1,Direct-S1`). If omitted, all available strategies are run.
- `--tags <list>` or `-t <list>`: A comma-separated list of tags to filter evaluation cases. Only cases matching at least one specified tag will be run (e.g., `simple,rules,family-ontology`).

**Example:**
Run only `SIR-R1` strategy on cases tagged `family-ontology`:

```bash
node src/evaluator.js -s SIR-R1 -t family-ontology
```

**Metrics:**
The evaluator uses several metrics to assess performance, including:

- `exactMatchProlog`: Checks for an exact string match of the generated Prolog against the expected Prolog.
- `prologStructureMatch`: A more lenient match that normalizes Prolog (e.g., removes comments, standardizes some whitespace) before comparison.
- `exactMatchAnswer`: Checks for an exact string match of the generated natural language answer against the expected answer (for queries).
- `semanticSimilarityAnswer`: Uses an LLM to compare the semantic meaning of the generated NL answer with the expected answer.

**Output:**
The evaluator prints a summary of results to the console and saves a detailed `evaluation-report.json` file in the project root.

## 🛠️ Utility Scripts for Development

MCR provides scripts to accelerate development and testing by leveraging LLMs to generate test data and ontologies.

### 1. Generate Evaluation Examples (`scripts/generate_example.js`)

- **Purpose:** Automatically creates new evaluation cases (`EvaluationCase` objects) for use with `evaluator.js`.
- **Command:**

  ```bash
  # Using npm script
  npm run generate-examples -- --domain "<domain_name>" --instructions "<detailed_instructions_for_LLM>" [--provider <llm_provider>] [--model <model_name>]

  # Direct node execution
  node scripts/generate_example.js --domain "chemistry" --instructions "Generate diverse queries about molecular composition and reactions, including some negations and rule-based assertions."
  ```

- **Arguments:**
  - `--domain` (alias `-d`): The subject domain (e.g., "history", "chemistry"). (Required)
  - `--instructions` (alias `-i`): Specific instructions for the LLM on what kind of examples to generate. (Required)
  - `--provider` (alias `-p`): Optional LLM provider (e.g., `openai`, `gemini`, `ollama`). Defaults to `MCR_LLM_PROVIDER` in `.env` or `ollama`.
  - `--model` (alias `-m`): Optional specific model name for the chosen provider.
- **Output:** Saves a new JavaScript file (e.g., `chemistryGeneratedEvalCases.js`) containing an array of `EvaluationCase` objects to the `src/evalCases/` directory.

### 2. Generate Ontology (`scripts/generate_ontology.js`)

- **Purpose:** Automatically generates Prolog facts and rules for a specified domain, creating a new ontology file.
- **Command:**

  ```bash
  # Using npm script
  npm run generate-ontology -- --domain "<domain_name>" --instructions "<detailed_instructions_for_LLM>" [--provider <llm_provider>] [--model <model_name>]

  # Direct node execution
  node scripts/generate_ontology.js --domain "mythology" --instructions "Generate Prolog facts and rules describing Greek gods, their relationships (parent_of, sibling_of, spouse_of), and their domains (e.g., god_of_sea). Include some basic rules for deducing relationships like grandparent_of."
  ```

- **Arguments:**
  - `--domain` (alias `-d`): The subject domain for the ontology. (Required)
  - `--instructions` (alias `-i`): Specific instructions for the LLM on the content, style, and scope of the ontology. (Required)
  - `--provider` (alias `-p`): Optional LLM provider.
  - `--model` (alias `-m`): Optional specific model name.
- **Output:** Saves a new Prolog file (e.g., `mythologyGeneratedOntology.pl`) to the `ontologies/` directory.

## 🔌 API Reference

MCR exposes a RESTful API. All requests and responses are JSON.

### General

- **Base Path**: All API routes are prefixed with `/api/v1`.
- **`X-Correlation-ID` Header**: Included in all responses for tracing requests.
- **Error Responses**: Errors are returned in a consistent JSON format.
  ```json
  // Example Error Response
  {
    "error": {
      "message": "Descriptive error message about what went wrong.",
      "type": "ApiError", // General type, could be more specific (e.g., 'ValidationError')
      "code": "SPECIFIC_ERROR_CODE", // Machine-readable error code (e.g., 'SESSION_NOT_FOUND')
      "correlationId": "a-unique-uuid-for-this-request",
      "details": {
        /* Optional: additional structured details about the error */
      }
    }
  }
  ```

### Endpoints

#### Status

- `GET /api/v1/status`
  - **Description**: Checks the server status and returns application information.
  - **Response (200 OK)**:
    ```json
    {
      "status": "ok",
      "name": "new-mcr", // From package.json
      "version": "1.0.0", // From package.json
      "description": "Streamlined Model Context Reasoner", // From package.json
      "message": "MCR Streamlined API is running.",
      "llmProvider": "current-configured-llm-provider" // e.g., "openai"
    }
    ```

#### Session Management

- `POST /api/v1/sessions`
  - **Description**: Creates a new reasoning session.
  - **Response (201 Created)**:
    ```json
    {
      "id": "unique-session-uuid",
      "createdAt": "2023-10-27T10:00:00.000Z",
      "facts": [] // Initial facts (empty)
    }
    ```
    _(Note: `factCount`, `llmProvider`, `reasonerProvider` may be included by some session managers but are not part of the core MCR session object upon creation)._

- `GET /api/v1/sessions/:sessionId`
  - **Description**: Retrieves the details of a specific session.
  - **Parameters**: `sessionId` (path) - The ID of the session.
  - **Response (200 OK)**: Same structure as `POST /sessions` response, but reflecting the current state of the session.
  - **Response (404 Not Found)**: If session does not exist.

- `DELETE /api/v1/sessions/:sessionId`
  - **Description**: Terminates and deletes a session and its associated facts.
  - **Parameters**: `sessionId` (path) - The ID of the session to terminate.
  - **Response (200 OK)**:
    ```json
    {
      "message": "Session <sessionId> deleted successfully."
    }
    ```
  - **Response (404 Not Found)**: If session does not exist.

#### Asserting Facts

- `POST /api/v1/sessions/:sessionId/assert`
  - **Description**: Translates natural language text into Prolog facts/rules and adds them to the specified session.
  - **Parameters**: `sessionId` (path) - The ID of the session.
  - **Request Body**:
    ```json
    {
      "text": "The cat is on the mat. All cats like milk."
    }
    ```
  - **Response (200 OK)**:
    ```json
    {
      "message": "Facts asserted successfully",
      "addedFacts": ["on(cat, mat).", "likes(X, milk) :- cat(X)."],
      "strategyId": "SIR-R1-Assert", // ID of the strategy used
      "cost": {
        "prompt_tokens": 50,
        "completion_tokens": 25,
        "total_tokens": 75
      } // Example cost
    }
    ```
  - **Response (400 Bad Request)**: If `text` is missing or invalid.
  - **Response (404 Not Found)**: If session does not exist.

#### Querying the Knowledge Base

- `POST /api/v1/sessions/:sessionId/query`
  - **Description**: Translates a natural language question into a Prolog query, executes it, and returns a natural language answer.
  - **Parameters**: `sessionId` (path) - The ID of the session.
  - **Request Body**:
    ```json
    {
      "query": "Is the cat on the mat?",
      "options": {
        // Optional
        "style": "conversational", // "conversational" (default) or "formal"
        "debug": true, // true to include detailed debug information
        "dynamicOntology": "particle(p1).\nproperty(p1, unstable)." // Optional Prolog string for RAG
      }
    }
    ```
  - **Response (200 OK)**:
    ```json
    {
      "answer": "Yes, the cat is on the mat.",
      "cost": {
        "translation": {
          "prompt_tokens": 40,
          "completion_tokens": 10,
          "total_tokens": 50
        },
        "nlGeneration": {
          "prompt_tokens": 30,
          "completion_tokens": 20,
          "total_tokens": 50
        }
      },
      "debugInfo": {
        "level": "verbose",
        "prologQuery": "on(cat, mat).",
        "strategyId": "SIR-R1-Query"
      }
    }
    ```
  - **Response (400 Bad Request)**: If `query` is missing or invalid.
  - **Response (404 Not Found)**: If session does not exist.

- `POST /api/v1/sessions/:sessionId/explain-query`
  - **Description**: Generates a natural language explanation of how a query would be resolved.
  - **Parameters**: `sessionId` (path) - The ID of the session.
  - **Request Body**:
    ```json
    {
      "query": "Who are Mary's grandparents?",
      "options": {
        // Optional
        "debug": true // To request debug information
      }
    }
    ```
  - **Response (200 OK)**:
    ```json
    {
      "explanation": "The query asks for individuals who are grandparents of Mary...",
      "cost": {
        "translation": {
          "prompt_tokens": 45,
          "completion_tokens": 15,
          "total_tokens": 60
        },
        "explanation": {
          "prompt_tokens": 60,
          "completion_tokens": 150,
          "total_tokens": 210
        }
      },
      "debugInfo": {
        "level": "basic",
        "prologQuery": "grandparent(X, mary)."
      }
    }
    ```
  - **Response (400 Bad Request)**: If `query` is missing.
  - **Response (404 Not Found)**: If session does not exist.

#### Direct Translation Endpoints

- `POST /api/v1/translate/nl-to-rules`
  - **Description**: Translates natural language text into a list of Prolog facts/rules.
  - **Request Body**:
    ```json
    {
      "text": "Birds can fly. Penguins are birds but cannot fly.",
      "context": "Optional additional context for the translation." // Optional
    }
    ```
  - **Response (200 OK)**:
    ```json
    {
      "rules": [
        "can_fly(X) :- bird(X).",
        "bird(penguin).",
        "not(can_fly(penguin))."
      ],
      "strategyId": "SIR-R1-Assert",
      "cost": {
        "prompt_tokens": 70,
        "completion_tokens": 40,
        "total_tokens": 110
      }
    }
    ```
  - **Response (400 Bad Request)**: If `text` is missing.

- `POST /api/v1/translate/rules-to-nl`
  - **Description**: Translates a string of Prolog rules/facts into a natural language explanation.
  - **Request Body**:
    ```json
    {
      "rules": "parent(X, Y) :- father(X, Y).\nparent(X, Y) :- mother(X, Y).", // Prolog rules as a single string
      "style": "formal" // Optional: "conversational" (default) or "formal"
    }
    ```
  - **Response (200 OK)**:
    ```json
    {
      "explanation": "A parent (X) is defined as either a father (X) of Y or a mother (X) of Y.",
      "cost": {
        "prompt_tokens": 30,
        "completion_tokens": 50,
        "total_tokens": 80
      }
    }
    ```
  - **Response (400 Bad Request)**: If `rules` are missing or invalid.

#### Ontology Management Endpoints

Ontologies are global collections of Prolog facts/rules.

- `POST /api/v1/ontologies`
  - **Description**: Creates a new global ontology.
  - **Request Body**:
    ```json
    {
      "name": "family_relations", // Unique name for the ontology
      "rules": "parent(X,Y) :- father(X,Y).\nparent(X,Y) :- mother(X,Y)." // Prolog rules as a string
    }
    ```
  - **Response (201 Created)**: The created ontology object.
    ```json
    {
      "name": "family_relations",
      "rules": "parent(X,Y) :- father(X,Y).\nparent(X,Y) :- mother(X,Y)."
    }
    ```
  - **Response (400 Bad Request)**: If `name` or `rules` are missing, or name conflict.

- `GET /api/v1/ontologies`
  - **Description**: Retrieves a list of all global ontologies.
  - **Query Parameters**: `?includeRules=true` (optional) to include the `rules` content in the list.
  - **Response (200 OK)**: Array of ontology objects.
    ```json
    [
      { "name": "family_relations" /*, "rules": "..." if includeRules=true */ },
      { "name": "common_sense" }
    ]
    ```

- `GET /api/v1/ontologies/:name`
  - **Description**: Retrieves a specific global ontology by its name.
  - **Parameters**: `name` (path) - The name of the ontology.
  - **Response (200 OK)**: The ontology object.
  - **Response (404 Not Found)**: If ontology does not exist.

- `PUT /api/v1/ontologies/:name`
  - **Description**: Updates an existing global ontology.
  - **Parameters**: `name` (path) - The name of the ontology to update.
  - **Request Body**:
    ```json
    {
      "rules": "child(X,Y) :- parent(Y,X).\n% Updated rules"
    }
    ```
  - **Response (200 OK)**: The updated ontology object.
  - **Response (404 Not Found)**: If ontology does not exist.

- `DELETE /api/v1/ontologies/:name`
  - **Description**: Deletes a global ontology by its name.
  - **Parameters**: `name` (path) - The name of the ontology.
  - **Response (200 OK)**:
    ```json
    {
      "message": "Ontology <name> deleted successfully."
    }
    ```
  - **Response (404 Not Found)**: If ontology does not exist.

#### Utility & Debugging Endpoints

- `GET /api/v1/prompts`
  - **Description**: Retrieves all raw prompt templates loaded by the MCR server.
  - **Response (200 OK)**: An object where keys are template names (e.g., `NL_TO_RULES`) and values are the template strings.
    ```json
    {
      "NL_TO_RULES": "You are an expert AI...",
      "QUERY_TO_PROLOG": "Translate the natural language question..."
      // ... other templates
    }
    ```

- `POST /api/v1/prompts/debug`
  - **Description**: Formats a specific prompt template with given input variables (a "dry run" without making an LLM call).
  - **Request Body**:
    ```json
    {
      "templateName": "QUERY_TO_PROLOG", // Name of the prompt template
      "variables": {
        // Key-value pairs for template variables
        "question": "What is the capital of France?"
      }
    }
    ```
  - **Response (200 OK)**:
    ```json
    {
      "templateName": "QUERY_TO_PROLOG",
      "rawTemplate": "The original template string...",
      "formattedUserPrompt": "The prompt string after variable substitution, as sent to the LLM.",
      "inputVariables": {
        "question": "What is the capital of France?"
      }
    }
    ```
  - **Response (400 Bad Request)**: If `templateName` or `variables` are invalid/missing.

## MCP Integration (for AI Clients like Claude Desktop)

MCR can expose its capabilities as tools to AI clients supporting the Model Context Protocol (MCP), such as Anthropic's Claude Desktop.

**Server Endpoint for MCP**: `GET /mcp/sse`
This endpoint uses Server-Sent Events (SSE) for communication.

**Available Tools via MCP**:

- `create_reasoning_session`
- `assert_facts_to_session`
- `query_session`
- `translate_nl_to_rules`
- `translate_rules_to_nl`

**Configuring Claude Desktop**:
To connect Claude Desktop to this MCR server:

1.  Locate your `claude_desktop_config.json` file (e.g., on macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`).
2.  Add or update the `mcpServers` object:
    ```json
    {
      "mcpServers": {
        "mcr-local-server": {
          // Choose any unique key
          "type": "url",
          "url": "http://localhost:8080/mcp/sse", // Adjust if MCR runs on a different port/host
          "name": "MCR Local Reasoner", // Display name in Claude
          "tool_configuration": {
            "enabled": true,
            "allowed_tools": [
              "create_reasoning_session",
              "assert_facts_to_session",
              "query_session",
              "translate_nl_to_rules",
              "translate_rules_to_nl"
            ]
          }
        }
      }
      // ... other existing configurations ...
    }
    ```
3.  Restart Claude Desktop.

Claude should then be able to discover and use the MCR tools.

## Code Guidelines

- Aim for self-documenting code through clear naming and structure.
- Use JSDoc for public functions/modules: document parameters, return values, and purpose.
- Comment complex or non-obvious logic.

## Extensibility

### Adding a New LLM Provider

To add support for a new LLM provider (e.g., "MyNewLLM"):

1.  **Create Provider Module**:
    - Add a new file, e.g., `src/llmProviders/myNewLlmProvider.js`.
    - This module must export an object with at least:
      - `name` (string): The identifier for the provider (e.g., `'mynewllm'`).
      - `generate` (async function): A function `async (systemPrompt, userPrompt, options) => { ... }` that interacts with the LLM and returns the generated text string.
    - Example:

      ```javascript
      // src/llmProviders/myNewLlmProvider.js
      const logger = require('../logger'); // Assuming logger is available
      // const { SomeApiClient } = require('some-llm-sdk');

      const MyNewLlmProvider = {
        name: 'mynewllm',
        async generate(systemPrompt, userPrompt, options = {}) {
          // const apiKey = config.llm.mynewllm.apiKey; // Get from config
          // const model = config.llm.mynewllm.model;
          // if (!apiKey) throw new Error('MyNewLLM API key not configured');
          logger.debug(
            `MyNewLlmProvider generating text with model: ${model}`,
            { systemPrompt, userPrompt, options }
          );
          // ... logic to call the LLM API ...
          // return generatedText;
          throw new Error('MyNewLlmProvider not implemented yet');
        },
      };
      module.exports = MyNewLlmProvider;
      ```

2.  **Register in `src/llmService.js`**:
    - Import your new provider: `const MyNewLlmProvider = require('./llmProviders/myNewLlmProvider');`
    - Add a `case` for `'mynewllm'` in the `switch` statement within the `getProvider()` function to set `selectedProvider = MyNewLlmProvider;`.

3.  **Update Configuration (`src/config.js`)**:
    - Add a configuration section for your provider under `config.llm`:
      ```javascript
      // In config.js, inside the config object:
      llm: {
        provider: process.env.MCR_LLM_PROVIDER || 'ollama',
        // ... other providers ...
        mynewllm: { // Add this section
          apiKey: process.env.MYNEWLLM_API_KEY,
          model: process.env.MCR_LLM_MODEL_MYNEWLLM || 'default-model-for-mynewllm',
          // ... other specific settings for MyNewLLM
        },
      }
      ```
    - Update `validateConfig()` in `src/config.js` if your provider has mandatory configuration (e.g., API key).

4.  **Update `.env.example`**:
    - Add environment variable examples for your new provider (e.g., `MYNEWLLM_API_KEY`, `MCR_LLM_MODEL_MYNEWLLM`).

5.  **Documentation**:
    - Briefly mention the new provider in this README if applicable.

---

_Note: This README is based on analysis of the current project structure and information from `old/README.md` and `old/CODE.md`. Some details, especially example responses, might need further refinement based on live testing._

```

```

---

Of course. Here is a complete, self-contained, and implementation-agnostic specification for the Model Context Reasoner (MCR) system.

This document formalizes the architecture, components, and processes, focusing on the core concept of interchangeable Translation Strategies.

---

### **System Specification: Model Context Reasoner (MCR)**

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

- **Presentation Layer:** Any user-facing application that consumes the MCR's API.
- **API Layer:** Defines the formal contract for interacting with the MCR. It is stateless and forwards requests to the Service Layer.
- **Service Layer:** The core orchestrator (`MCR Service`). It manages the business logic of a request (e.g., "assert this text") by invoking the currently selected Translation Strategy and the necessary providers.
- **Provider & Strategy Interfaces:** A set of abstract contracts that define the capabilities of key components. This allows for pluggable implementations.
- **Implementation Layer:** Concrete implementations of the interfaces (e.g., a specific `OllamaProvider` for an LLM, a `PrologProvider` for reasoning, and various `TranslationStrategy` modules).

#### 4.0 Component Specification

**4.1. MCR Service (Orchestrator)**
The central service responsible for executing user requests.

- **Responsibilities:**
  - Managing the lifecycle of a request.
  - Selecting and invoking the appropriate Translation Strategy.
  - Coordinating calls between the LLM Provider and the Reasoner Provider.
  - Managing session state via the Context Provider (not shown in diagram for simplicity, but implied for stateful operations).

**4.2. ITranslationStrategy (Interface)**
Defines the contract for any Translation Strategy.

- **Methods:**
  - `getName(): string`: Returns the unique name of the strategy (e.g., "SIR-R1").
  - `assert(text: string, llmProvider: ILlmProvider): Promise<Clause[]>`: Takes natural language text and returns a list of one or more symbolic clauses.
  - `query(text: string, llmProvider: ILlmProvider): Promise<QueryString>`: Takes a natural language question and returns a single, well-formed query string.
- **Types:**
  - `Clause`: A string representing a single, syntactically correct fact or rule.
  - `QueryString`: A string representing a single, syntactically correct query.

**4.3. ILlmProvider (Interface)**
Defines the contract for an LLM service provider.

- **Methods:**
  - `generate(prompt: string): Promise<string>`: Sends a prompt to the LLM and returns its raw text response.

**4.4. IReasonProvider (Interface)**
Defines the contract for a symbolic reasoning engine.

- **Methods:**
  - `query(kb: string, query: QueryString): Promise<QueryResult>`: Executes a query against a knowledge base and returns the results.
  - `validate(kb: string): Promise<ValidationResult>`: Checks a knowledge base for syntactic correctness.
- **Types:**
  - `QueryResult`: A structured representation of the reasoner's findings (e.g., a list of variable bindings or a boolean).
  - `ValidationResult`: An object indicating whether the KB is valid and providing an error message if not.

#### 5.0 Example Translation Strategies

**5.1. Strategy: `Direct-S1` (Direct-to-Symbolic, Level 1)**

- **Description:** A baseline strategy that prompts the LLM for direct symbolic output. Prone to errors but useful for benchmarking.
- **`assert` Logic:**
  1.  Generate a simple prompt asking the LLM to convert the input text into one or more symbolic facts or rules.
  2.  Invoke the `ILlmProvider`.
  3.  Perform minimal, regex-based post-processing on the returned string to split it into clauses.
  4.  Return the resulting list of clauses.
- **`query` Logic:**
  1.  Generate a simple prompt asking the LLM to convert the input question into a symbolic query.
  2.  Invoke the `ILlmProvider`.
  3.  Return the cleaned-up string.

**5.2. Strategy: `SIR-R1` (Structured Intermediate Representation, Robust, Level 1)**

- **Description:** A robust, multi-stage strategy that uses a Structured Intermediate Representation (SIR) to ensure syntactic correctness. This is the recommended production-grade approach.
- **`assert` Logic:**
  1.  **Intent Classification:** Generate a prompt to classify the input text as asserting `FACTS` or a `RULE`. Invoke the LLM.
  2.  **SIR Generation:** Based on the intent, select a prompt that instructs the LLM to generate an SIR. The prompt must include the SIR schema definition and few-shot examples. Invoke the LLM.
  3.  **SIR Validation:** Parse and validate the returned string against the expected SIR schema.
  4.  **Syntactic Translation:** Programmatically traverse the validated SIR data structure and deterministically generate the corresponding, syntactically perfect symbolic clauses.
  5.  Return the list of generated clauses.
- **`query` Logic:**
  1.  Generate a prompt instructing the LLM to produce a symbolic query, providing strict instructions on variable casing.
  2.  Invoke the `ILlmProvider`.
  3.  Perform minimal cleaning (e.g., trim whitespace) and return the result.

#### 6.0 API Specification

The MCR service exposes a RESTful API for interaction.

- **`POST /sessions`**
  - **Description:** Creates a new reasoning session.
  - **Response Body:** `{ "sessionId": "string" }`

- **`POST /sessions/{sessionId}/assert`**
  - **Description:** Asserts new knowledge into the session's KB using the currently configured Translation Strategy.
  - **Request Body:** `{ "text": "string" }`
  - **Response Body:** `{ "addedClauses": ["string"], "knowledgeBase": "string" }`

- **`POST /sessions/{sessionId}/query`**
  - **Description:** Poses a natural language query to the session's KB.
  - **Request Body:** `{ "query": "string" }`
  - **Response Body:** `{ "prologQuery": "string", "rawResult": object, "naturalLanguageAnswer": "string" }`

- **`PUT /sessions/{sessionId}/kb`**
  - **Description:** Directly overwrites the entire KB of a session. The new KB is validated before being saved.
  - **Request Body:** `{ "knowledgeBase": "string" }`
  - **Response Body:** `200 OK`

- **`PUT /config/translationStrategy`**
  - **Description:** Sets the active Translation Strategy for the system.
  - **Request Body:** `{ "strategyName": "string" }`
  - **Response Body:** `200 OK`

#### 7.0 Evolution & Advanced Capabilities

The MCR architecture is designed to support future enhancements.

**7.1. Strategy Management & Evaluation**
A meta-layer service responsible for managing the lifecycle of Translation Strategies.

- **Benchmarking:** The system shall support a standardized benchmark suite (a "golden dataset" of NL-to-Symbolic mappings) to evaluate strategies against metrics like syntactic accuracy, semantic correctness, and resource cost (latency, tokens).
- **Automated Optimization:** The system should facilitate an automated loop where a "Strategy Optimizer" agent can programmatically generate variations of existing strategy prompts, benchmark them, and promote superior versions.

**7.2. Operational Enhancements**

- **Self-Correction:** If a strategy step fails (e.g., the LLM produces an invalid SIR), the system should be capable of automatically re-prompting the LLM with the context of the error, asking it to correct its previous output.
- **Knowledge Retraction:** The system shall be extended to understand commands for retracting or modifying existing knowledge, requiring extensions to intent classification and the generation of retraction clauses.
- **Explanatory Reasoning:** The `IReasonProvider` interface shall be extended to optionally return a proof trace. A dedicated LLM prompt will then translate this formal trace into a human-readable explanation of the reasoning steps.

**7.3. Paradigm Expansion**

- **Hybrid Reasoning:** The system shall support a fallback mechanism where, if a symbolic query yields no results, the query can be re-posed to the base `ILlmProvider` for a general, sub-symbolic lookup.
- **Agentic Tooling:** The MCR service shall be designed to be easily integrated as a "tool" within a larger AI agent framework, allowing an autonomous agent to delegate structured reasoning tasks to the MCR.
