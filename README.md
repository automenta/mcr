# Model Context Reasoner (MCR)

The **Model Context Reasoner (MCR)** is a standalone Node.js server application designed to act as a powerful, API-driven bridge between Large Language Models (LLMs) and formal logic reasoners (specifically Prolog). It enables applications to leverage sophisticated logical reasoning capabilities by translating natural language into formal logic and managing a persistent knowledge base through stateful sessions.

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
    # HOST="0.0.0.0" # Defaults to 0.0.0.0
    # PORT="8080"    # Defaults to 8080
    # LOG_LEVEL="info" # Defaults to info (options: error, warn, info, http, verbose, debug, silly)
    ```

4.  **Run the Script**:
    ```bash
    node mcr.js
    ```
    The script will then start the server, indicating which LLM provider is active.

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
        "correlationId": "a-unique-uuid"
        // "internalCode": "SPECIFIC_ERROR_CODE" // May be present in development/debug mode
      }
    }
    ```
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
      "name": "Model Context Reasoner",
      "version": "2.0.0"
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
      "message": "Session a-unique-uuid terminated."
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
      "message": "Ontology family_relations deleted."
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
