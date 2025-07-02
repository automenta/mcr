````markdown
# 🧠 Model Context Reasoner (MCR) ✨

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
       console.error('Error creating MCR session:', error.response ? error.response.data : error.message);
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
      "facts": [], // Initial facts (empty)
      "factCount": 0, // Initial fact count
      "llmProvider": "current-llm-provider",
      "reasonerProvider": "prolog" // Current reasoner
    }
    ```

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
      "addedFacts": ["on(cat, mat).", "likes(X, milk) :- cat(X)."] // Actual Prolog facts added
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
        "llmTranslationResultToNL": "The LLM's raw text used to form the 'answer'."
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
      "rawOutput": "Full LLM output string, may include comments or partial rules."
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
      - `generateStructured` (async function): A function `async (systemPrompt, userPrompt, options) => { ... }` that interacts with the LLM and returns the generated text string.
    - Example:

      ```javascript
      // src/llmProviders/myNewLlmProvider.js
      const logger = require('../logger'); // Assuming logger is available
      // const { SomeApiClient } = require('some-llm-sdk');

      const MyNewLlmProvider = {
        name: 'mynewllm',
        async generateStructured(systemPrompt, userPrompt, options = {}) {
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
