# Model Context Reasoner (MCR)

The **Model Context Reasoner (MCR)** is a powerful, API-driven system designed to act as a bridge between Large Language Models (LLMs) and formal logic reasoners (specifically Prolog). It enables applications to leverage sophisticated logical reasoning capabilities by translating natural language into formal logic and managing a persistent knowledge base through stateful sessions.

MCR is built with a "guitar pedal" philosophy: a single, plug-and-play unit that adds advanced reasoning to your AI stack with minimal setup.

## Core Concepts

1.  **MCR as a Service**: MCR runs as a background HTTP server, exposing its functionality via a RESTful API. Any application (web frontend, Python script, another backend service) can integrate with it.
2.  **Stateful Sessions**: This is central to MCR's power. Clients create a `sessionId` to establish a persistent reasoning context. Facts asserted within that session are remembered for subsequent queries, building a dynamic and evolving knowledge base.
3.  **LLM-Powered Translation**: MCR utilizes LLMs to seamlessly translate between human language and the formal syntax of a reasoner (e.g., Prolog), abstracting this complexity from the end-user. This includes:
    - Natural language to Prolog facts/rules.
    - Natural language questions to Prolog queries.
    - Prolog query results back to conversational natural language.

## Features

- **Modularity**: The codebase is structured into logical components (Config, Logger, LLM Service, Reasoner Service, API Handlers) for improved readability and maintainability.
- **Extensible LLM Support**: Natively supports multiple LLM providers out-of-the-box:
  - **OpenAI** (e.g., GPT-4o)
  - **Google Gemini** (e.g., `gemini-pro`)
  - Local **Ollama** models (e.g., `llama3`)
    The LLM provider is easily selectable via configuration.
- **Robust Error Handling**: Features a custom `ApiError` class and centralized error-handling middleware for consistent and predictable API responses.
- **Configuration Validation**: Robust configuration loading with clear startup checks for required API keys.
- **Dependency Management**: Uses a standard `package.json` file for managing Node.js dependencies.

## Setup and Installation

1.  **Clone or Download the Code**: Obtain the source code, including `mcr.js`, `package.json`, and the `src/` directory.
2.  **Install Dependencies**: Navigate to the project directory in your terminal and run:
    ```bash
    npm install
    ```
3.  **Create `.env` file**: In the same directory as `mcr.js`, create a file named `.env`. You only need to add the API keys for the LLM services you intend to use.

    ```dotenv
    # --- CHOOSE ONE LLM PROVIDER ---

    # For OpenAI
    # OPENAI_API_KEY="sk-..."
    # MCR_LLM_MODEL_OPENAI="gpt-4o" # Optional, defaults to gpt-4o

    # For Google Gemini
    # GEMINI_API_KEY="..."
    # MCR_LLM_MODEL_GEMINI="gemini-pro" # Optional, defaults to gemini-pro

    # For local Ollama (no key needed, but set the model)
    # MCR_LLM_PROVIDER="ollama"
    # MCR_LLM_MODEL_OLLAMA="llama3" # Optional, defaults to llama3
    # MCR_LLM_OLLAMA_BASE_URL="http://localhost:11434" # Optional, defaults to http://localhost:11434

    # --- OPTIONAL GENERAL SETTINGS ---
    # MCR_API_URL="http://localhost:8080" # For CLI: defaults to http://localhost:8080 if server is local
    # HOST="0.0.0.0" # Defaults to 0.0.0.0
    # PORT="8080"    # Defaults to 8080
    # LOG_LEVEL="info" # Defaults to info (options: error, warn, info, http, verbose, debug, silly)
    ```

    The server will validate this configuration on startup. If critical settings for the chosen `MCR_LLM_PROVIDER` (like API keys or Ollama URL) are missing or invalid, the server will log an error and exit.

4.  **Run the Script**:
    ```bash
    node mcr.js
    ```
    The script will then start the server, indicating which LLM provider is active.

## Interactive TUI (Primary Interface)

The primary way to interact with MCR is through its comprehensive Text User Interface (TUI).
To launch the TUI, run:

```bash
node mcr.js chat
# Or if mcr is in your PATH (e.g. via npm link or global install)
mcr chat
```

The `mcr chat` command starts a full-application TUI that serves as your "home" for all MCR operations.

**Key TUI Features:**

- **Unified Interface**: Access chat, session management, ontology management, translations, prompt utilities, and demos all from one place.
- **Server Management**:
  - Automatically starts the MCR server if it's not already running.
  - Shuts down the server on exit *if* the TUI started it.
  - Seamlessly uses an existing MCR server if one is detected.
- **Status Bar**: Displays current session ID, startup ontology context (from `-o` flag), server status, and chat debug mode.
- **Command System**:
  - Type natural language messages directly for chat.
  - Use slash commands (e.g., `/help`, `/status`, `/create-session`) to perform specific operations.
- **Interactive Output**: View responses from MCR, command outputs, and demo progress in the main content area.
- **Startup Ontology**: Use the `mcr chat -o path/to/your_ontology.pl` option to specify an ontology file at startup.
  - The content of this file will be automatically included as dynamic context in the `ontology` field for:
    - All natural language chat messages sent to the MCR.
    - All `/query <question>` commands.
  - This allows you to have a base set of rules or facts active for your TUI session without manually asserting them or including them in every query.
  - The name of the startup ontology file is displayed in the status bar.

**Navigating the TUI:**

- **Chat**: Simply type your message and press Enter. If no session is active, one will be created for you.
- **Commands**: Type `/` followed by a command name and any arguments. For example:
  - `/help`: Shows a list of all available TUI commands.
  - `/status`: Checks and displays the MCR server status.
  - `/create-session`: Creates a new reasoning session.
  - `/list-ontologies`: Lists all globally stored ontologies.
  - `/run-demo simpleQA`: Runs the Simple Q&A demo.
- **Exiting**: Type `/exit`, `/quit`, or press `Ctrl+C`.

**Available TUI Commands (obtain the full up-to-date list with `/help` inside the TUI):**

*   **Core:**
    *   `/help`: Show help message.
    *   `/status`: Check MCR server status.
    *   `/exit`, `/quit`: Exit the application.
*   **Session Management:**
    *   `/create-session`: Create a new session.
    *   `/get-session [id]`: Get details for a session (current if no id).
    *   `/delete-session [id]`: Delete a session (current if no id).
*   **Knowledge & Querying:**
    *   `/assert <text>`: Assert facts to the current session.
    *   `/query <question>`: Query the current session.
    *   `/explain <question>`: Explain a query for the current session.
*   **Ontology Management:**
    *   `/list-ontologies`: List all global ontologies.
    *   `/get-ontology <name>`: Get details of a specific ontology.
    *   `/add-ontology <name> <path>`: Add a new ontology from a rules file.
    *   `/update-ontology <name> <path>`: Update an ontology from a rules file.
    *   `/delete-ontology <name>`: Delete an ontology.
*   **Translation:**
    *   `/nl2rules <text> [--facts "..."] [--ontology path/file.pl]`: Translate NL to Prolog rules.
    *   `/rules2nl <path> [--style formal|conversational]`: Translate Prolog rules from a file to NL.
*   **Prompts:**
    *   `/list-prompts`: List all prompt templates.
    *   `/show-prompt <templateName>`: Show a specific prompt template.
    *   `/debug-prompt <templateName> <json>`: Debug a prompt template with JSON variables.
*   **Demos & Utilities:**
    *   `/run-demo <simpleQA|family>`: Run a demo script (e.g., `simpleQA`, `family`).
    *   `/toggle-debug-chat`: Toggle verbose debug output for chat messages and `/query` commands.

## Legacy CLI Commands (Secondary)

While the TUI (`mcr chat`) is the recommended primary interface, some of the original CLI commands are still available for scripting or direct, non-interactive use. These commands typically require the MCR server to be running independently.

You can see the list of all available top-level commands with `mcr --help`.

Examples of legacy commands:

- `mcr status`: Checks server status.
- `mcr create-session`: Creates a session and prints its ID.
- `mcr assert <sessionId> "Fact"`: Asserts a fact to a given session.
- `mcr query <sessionId> "Question?"`: Queries a session.
- `mcr list-ontologies`: Lists ontologies.

The `mcr agent` command also remains available for its specific interactive demo menu, though its demo functionalities are now also integrated into the main TUI via `/run-demo`.
The `mcr agent` command still requires the MCR server to be running separately.

## API Reference

MCR exposes a RESTful API for interaction. All requests and responses are JSON-based.

### General Considerations

- **`X-Correlation-ID` Header**: All responses will include an `X-Correlation-ID` header, containing a unique ID for the request. This ID is also included in server logs and can be useful for debugging and tracing.

- **Error Responses**: Errors are returned in a consistent JSON format.
  - **API Errors (Client-side or expected issues, e.g., 4xx status codes):**

    ```json
    {
      "error": {
        "message": "Descriptive error message",
        "type": "ApiError", // Or a more specific type like 'SyntaxError' if applicable
        "code": "SPECIFIC_ERROR_CODE", // Optional: A machine-readable error code
        "correlationId": "a-unique-uuid"
      }
    }
    ```

    The `code` field provides a specific identifier for the error, which can be useful for programmatic error handling if needed. Not all ApiErrors will have a `code`.

  - **Internal Server Errors (Server-side unexpected issues, e.g., 5xx status codes):**
    ```json
    {
      "error": {
        "message": "An internal server error occurred.",
        "details": "Specific error message from the server (may be hidden in production)",
        "type": "InternalServerError",
        "correlationId": "a-unique-uuid"
      }
    }
    ```

### 1. Root Endpoint

- `GET /`
  - **Description**: Checks the server status and returns basic application information.
  - **Response**:
    ```json
    {
      "status": "ok",
      "name": "Model Context Reasoner", // Name from package.json
      "version": "2.1.0", // Version from package.json
      "description": "MCR API" // Description from package.json
    }
    ```

### 2. Session Management

Sessions are stateful contexts where facts are stored and reasoned upon.

- `POST /sessions`
  - **Description**: Creates a new reasoning session.
  - **Response**:
    ```json
    {
      "sessionId": "a-unique-uuid",
      "createdAt": "2023-10-27T10:00:00.000Z",
      "facts": [],
      "factCount": 0
    }
    ```

- `GET /sessions/:sessionId`
  - **Description**: Retrieves the details of a specific session.
  - **Parameters**: `sessionId` (path) - The ID of the session.
  - **Response**: (Same as `POST /sessions` response, but with current facts)
    ```json
    {
      "sessionId": "a-unique-uuid",
      "createdAt": "2023-10-27T10:00:00.000Z",
      "facts": ["fact1.", "fact2."],
      "factCount": 2
    }
    ```

- `DELETE /sessions/:sessionId`
  - **Description**: Terminates and deletes a session and its associated facts.
  - **Parameters**: `sessionId` (path) - The ID of the session to terminate.
  - **Response**:
    ```json
    {
      "message": "Session a-unique-uuid terminated.",
      "sessionId": "a-unique-uuid"
    }
    ```

### 3. Asserting Facts

Add natural language statements to a session's knowledge base. MCR uses an LLM to translate these into Prolog facts/rules.

- `POST /sessions/:sessionId/assert`
  - **Description**: Translates natural language text into Prolog facts/rules and adds them to the specified session.
  - **Parameters**: `sessionId` (path) - The ID of the session.
  - **Request Body**:
    ```json
    {
      "text": "The cat is on the mat. All cats like milk."
    }
    ```
  - **Response**:
    ```json
    {
      "addedFacts": ["on(cat, mat).", "likes(X, milk) :- cat(X)."],
      "totalFactsInSession": 2,
      "metadata": { "success": true }
    }
    ```

### 4. Querying the Knowledge Base

Ask natural language questions against a session's knowledge base. MCR translates the question to Prolog, runs the query, and translates the result back to natural language.

- `POST /sessions/:sessionId/query`
  - **Description**: Translates a natural language question into a Prolog query, executes it against the session's knowledge base (including a common-sense ontology), and returns a natural language answer.
  - **Parameters**: `sessionId` (path) - The ID of the session.
  - **Request Body**:
    ```json
    {
      "query": "Is the cat on the mat?",
      "options": {
        "style": "conversational", // Optional: "conversational" (default) or "formal"
        "debug": true // Optional: Include debug info (facts in session)
      }
    }
    ```
  - **Response**:

    ```json
    {
      "queryProlog": "on(cat, mat)?",
      "result": "true",
      "answer": "Yes, the cat is on the mat.",
      "metadata": { "success": true, "steps": 1 },
      "debug": {
        "factsInSession": ["on(cat, mat).", "likes(X, milk) :- cat(X)."]
      }
    }
    ```

    - If no solution is found, `result` will be "No solution found." and `answer` will reflect that.

  - **Dynamic Knowledge Injection (for RAG, etc.)**: The `ontology` field in the request body is optional. If provided, it should be a string containing Prolog facts or rules (newline-separated). These will be added to the knowledge base _for this query only_, alongside existing session facts and globally configured ontologies. This allows clients to implement Retrieval Augmented Generation (RAG) by fetching context from a datastore, converting it to Prolog facts, and injecting it into the query.

    _Example with dynamic `ontology` data:_

    ```json
    {
      "query": "Is the newly discovered particle stable?",
      "ontology": "particle(p1).\nproperty(p1, unstable).\n% End of dynamic facts",
      "options": { "debug": true }
    }
    ```

  - **Implementing Retrieval Augmented Generation (RAG) with Dynamic Knowledge Injection**:
    The `ontology` field is key to implementing RAG with MCR. The workflow is typically as follows:
    1.  **User Query**: The user submits a natural language query to your application.
    2.  **Context Retrieval (Application Responsibility)**: Your application preprocesses the user's query (e.g., identifies keywords, entities). It then queries an external knowledge source (vector database, document store, knowledge graph, etc.) to retrieve relevant contextual information.
    3.  **Context Transformation (Application Responsibility)**: The retrieved context (which might be text chunks, structured data, etc.) needs to be transformed into Prolog facts or rules. This transformation can be done programmatically by your application or by using an LLM to convert natural language context into Prolog statements.
        _Example_: If retrieved context is "The P1 particle has a half-life of 10 seconds, and particles with half-lives under 1 minute are considered unstable," your application might transform this into Prolog:
        `has_half_life(p1, 10).`
        `unit_half_life(p1, seconds).`
        `is_unstable(Particle) :- has_half_life(Particle, Value), unit_half_life(Particle, seconds), Value < 60.`
    4.  **MCR Query with Dynamic Knowledge**: Your application then calls the MCR `/sessions/:sessionId/query` endpoint, providing the original user query and the dynamically generated Prolog facts/rules in the `ontology` field of the request body.
    5.  **MCR Reasoning**: MCR uses these dynamically injected facts/rules (along with any facts already in the session) to reason about the user's query and generate an answer. The dynamic knowledge in the `ontology` field is used _only for this specific query_ and does not persist in the session or global ontologies.

    This approach allows MCR to leverage up-to-date, external information for its reasoning process without needing to permanently store vast amounts of contextual data within its own session management.

- `POST /sessions/:sessionId/explain-query`
  - **Description**: Uses an LLM to generate a natural language explanation of how a given query would be resolved against the session's current knowledge base (including facts and ontologies). This does not execute the query but explains the reasoning steps.
  - **Parameters**: `sessionId` (path) - The ID of the session.
  - **Request Body**:
    ```json
    {
      "query": "Who are Mary's grandparents?"
    }
    ```
  - **Response**:
    ```json
    {
      "query": "Who are Mary's grandparents?",
      "explanation": "The query asks for individuals who are grandparents of Mary. This would typically involve finding parents of Mary (e.g., `parent(X, mary)`) and then finding parents of those individuals (e.g., `parent(Y, X)`). The combined results for Y would be Mary's grandparents..."
    }
    ```

### 5. Direct Translation Endpoints

These endpoints allow direct translation without session management.

- `POST /translate/nl-to-rules`
  - **Description**: Translates natural language text into a list of Prolog facts/rules.
  - **Request Body**:
    ```json
    {
      "text": "Birds can fly. Penguins are birds but cannot fly."
    }
    ```
  - **Response**:
    ```json
    {
      "rules": [
        "can_fly(X) :- bird(X).",
        "bird(penguin).",
        "not(can_fly(penguin))."
      ]
    }
    ```

- `POST /translate/rules-to-nl`
  - **Description**: Translates a list of Prolog rules into a cohesive natural language explanation.
  - **Request Body**:
    ```json
    {
      "rules": [
        "parent(X, Y) :- father(X, Y).",
        "parent(X, Y) :- mother(X, Y)."
      ],
      "style": "formal" // Optional: "conversational" or "formal" (default)
    }
    ```
  - **Response**:
    ```json
    {
      "text": "A parent (X) is defined as either a father (X) of Y or a mother (X) of Y."
    }
    ```

### 6. Ontology Management Endpoints

MCR allows for the management of global ontologies (collections of Prolog facts and rules) that can be applied to reasoning tasks. These ontologies are stored by MCR and can be created, updated, listed, retrieved, and deleted via the API. Ontologies are identified by a unique `name`.

- `POST /ontologies`
  - **Description**: Creates a new global ontology.
  - **Request Body**:
    ```json
    {
      "name": "family_relations",
      "rules": "parent(X,Y) :- father(X,Y).\nparent(X,Y) :- mother(X,Y).\ngrandparent(X,Z) :- parent(X,Y), parent(Y,Z)."
    }
    ```
  - **Response**: `201 Created`
    ```json
    {
      "name": "family_relations",
      "rules": "parent(X,Y) :- father(X,Y).\nparent(X,Y) :- mother(X,Y).\ngrandparent(X,Z) :- parent(X,Y), parent(Y,Z)."
    }
    ```

- `GET /ontologies`
  - **Description**: Retrieves a list of all global ontologies.
  - **Response**:
    ```json
    [
      { "name": "family_relations", "rules": "..." },
      { "name": "another_ontology", "rules": "..." }
    ]
    ```

- `GET /ontologies/:name`
  - **Description**: Retrieves a specific global ontology by its name.
  - **Parameters**: `name` (path) - The name of the ontology.
  - **Response**:
    ```json
    {
      "name": "family_relations",
      "rules": "parent(X,Y) :- father(X,Y).\nparent(X,Y) :- mother(X,Y).\ngrandparent(X,Z) :- parent(X,Y), parent(Y,Z)."
    }
    ```

- `PUT /ontologies/:name`
  - **Description**: Updates an existing global ontology.
  - **Parameters**: `name` (path) - The name of the ontology to update.
  - **Request Body**:
    ```json
    {
      "rules": "child(X,Y) :- parent(Y,X).\n% Updated rules"
    }
    ```
  - **Response**:
    ```json
    {
      "name": "family_relations",
      "rules": "child(X,Y) :- parent(Y,X).\n% Updated rules"
    }
    ```

- `DELETE /ontologies/:name`
  - **Description**: Deletes a global ontology by its name.
  - **Parameters**: `name` (path) - The name of the ontology.
  - **Response**:
    ```json
    {
      "message": "Ontology family_relations deleted.",
      "ontologyName": "family_relations"
    }
    ```

### 7. Utility & Debugging Endpoints

- `GET /prompts`
  - **Description**: Retrieves all raw prompt templates currently loaded by the MCR server. This is useful for understanding the base prompts used for LLM interactions.
  - **Response**:
    ```json
    {
      "NL_TO_RULES": "You are an expert AI...",
      "QUERY_TO_PROLOG": "Translate the natural language question...",
      "...": "..."
    }
    ```

- `POST /debug/format-prompt`
  - **Description**: Allows you to see how a specific prompt template would be formatted with given input variables, without making an actual LLM call. This is a "dry run" for prompt formatting.
  - **Request Body**:
    ```json
    {
      "templateName": "QUERY_TO_PROLOG",
      "inputVariables": {
        "question": "What is the capital of France?"
      }
    }
    ```
  - **Response**:
    ```json
    {
      "templateName": "QUERY_TO_PROLOG",
      "rawTemplate": "Translate the natural language question...",
      "inputVariables": {
        "question": "What is the capital of France?"
      },
      "formattedPrompt": "Translate the natural language question into a single, valid Prolog query string. The query must end with a period.\n        Question: \"What is the capital of France?\"\n        Prolog Query:"
    }
    ```

---

## TODO

- Advanced error handling and debugging to diagnose translation and reasoner issues.
- Prompt template editing and debugging.
- Unit test framework.
- Demo framework: try individual operations.
- Extensibility.
- Integrate RAG / datastores through dynamic Prolog assertions / overlay.
