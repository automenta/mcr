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
- **🛡️ Robust Error Handling**: Custom `ApiError` class and centralized error-handling.
- **✅ Configuration Validation**: Checks for required API keys and settings on startup.
- **📦 Dependency Management**: Uses `package.json` for Node.js dependencies.
- **💬 Interactive TUI**: An Ink-based Terminal User Interface for chat, session management, and more.
- **⚙️ CLI**: A command-line interface for server control, direct API interaction, demos, and a sandbox mode.
- **📃 API**: A comprehensive RESTful API for programmatic integration.

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
- `./cli.js demo run <simpleQA|family>`: Runs predefined demonstrations.
- `./cli.js sandbox`: Starts an interactive sandbox for experimenting with NL to Logic steps.

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
      "message": "Facts asserted successfully", // Or a more descriptive message from the service
      // "sessionId": "unique-session-uuid", // Often included, but main info is below
      "addedFacts": ["on(cat, mat).", "likes(X, milk) :- cat(X)."], // Actual Prolog facts added
      "strategy": "SIR-R1" // Name of the translation strategy used
      // "originalText": "The cat is on the mat. All cats like milk.",
      // "currentFactCount": 2 // Updated fact count in the session
    }
    ```
    _(Note: Exact response structure for `addedFacts`, `message` may vary slightly based on `mcrService` output)_
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
      // "sessionId": "unique-session-uuid",
      // "originalQuery": "Is the cat on the mat?",
      "debugInfo": {
        // Included if options.debug was true and info is available
        "llmTranslationQueryToProlog": "on(cat, mat)?",
        "prologQuery": "on(cat, mat).", // Actual query sent to reasoner
        "prologResultsJSON": "[\"true\"]", // JSON string of Prolog results
        "knowledgeBaseSnapshot": "on(cat, mat).\nlikes(X, milk) :- cat(X).", // KB at query time
        "llmTranslationResultToNL": "The LLM's raw text used to form the 'answer'.",
        "strategy": "SIR-R1" // Name of the translation strategy used
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
      "query": "Who are Mary's grandparents?"
    }
    ```
  - **Response (200 OK)**:
    ```json
    {
      "explanation": "The query asks for individuals who are grandparents of Mary...",
      // "sessionId": "unique-session-uuid",
      // "originalQuery": "Who are Mary's grandparents?",
      "debugInfo": {
        /* Optional: relevant facts/rules considered for the explanation */
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
        // Array of Prolog rule strings
        "can_fly(X) :- bird(X).",
        "bird(penguin).",
        "not(can_fly(penguin))."
      ],
      // "rawOutput": "Full LLM output string (strategy-dependent, e.g., not typically present for SIR-R1)",
      "strategy": "SIR-R1" // Name of the translation strategy used
      // "originalText": "Birds can fly. Penguins are birds but cannot fly."
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
      "explanation": "A parent (X) is defined as either a father (X) of Y or a mother (X) of Y."
      // "originalRules": "parent(X, Y) :- father(X, Y).\nparent(X, Y) :- mother(X, Y)."
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
