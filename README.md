# Model Context Reasoner (MCR)

The **Model Context Reasoner (MCR)** is a standalone Node.js server application designed to act as a powerful, API-driven bridge between Large Language Models (LLMs) and formal logic reasoners (specifically Prolog). It enables applications to leverage sophisticated logical reasoning capabilities by translating natural language into formal logic and managing a persistent knowledge base through stateful sessions.

MCR is built with a "guitar pedal" philosophy: a single, plug-and-play unit that adds advanced reasoning to your AI stack with minimal setup.

## Core Concepts

1.  **MCR as a Service**: MCR runs as a background HTTP server, exposing its functionality via a RESTful API. Any application (web frontend, Python script, another backend service) can integrate with it.
2.  **Stateful Sessions**: This is central to MCR's power. Clients create a `sessionId` to establish a persistent reasoning context. Facts asserted within that session are remembered for subsequent queries, building a dynamic and evolving knowledge base.
3.  **LLM-Powered Translation**: MCR utilizes LLMs to seamlessly translate between human language and the formal syntax of a reasoner (e.g., Prolog), abstracting this complexity from the end-user. This includes:
    *   Natural language to Prolog facts/rules.
    *   Natural language questions to Prolog queries.
    *   Prolog query results back to conversational natural language.

## Features

*   **Modularity**: The codebase is structured into logical components (Config, Logger, LLM Service, Reasoner Service, API Handlers) for improved readability and maintainability.
*   **Extensible LLM Support**: Natively supports multiple LLM providers out-of-the-box:
    *   **OpenAI** (e.g., GPT-4o)
    *   **Google Gemini** (e.g., `gemini-pro`)
    *   Local **Ollama** models (e.g., `llama3`)
    The LLM provider is easily selectable via configuration.
*   **Robust Error Handling**: Features a custom `ApiError` class and centralized error-handling middleware for consistent and predictable API responses.
*   **Configuration Validation**: Robust configuration loading with clear startup checks for required API keys.
*   **Automatic Dependency Installation**: The script automatically checks for and installs missing Node.js dependencies upon first run.

## Setup and Installation

1.  **Save the Code**: Save the `mcr.js` file (provided in this repository) to your desired project directory.
2.  **Create `.env` file**: In the same directory as `mcr.js`, create a file named `.env`. You only need to add the API keys for the LLM services you intend to use.

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

3.  **Run the Script**:
    ```bash
    node mcr.js
    ```
    The script will automatically install any missing dependencies and then start the server, indicating which LLM provider is active.

## API Reference

MCR exposes a RESTful API for interaction. All requests and responses are JSON-based.

### 1. Root Endpoint

*   `GET /`
    *   **Description**: Checks the server status and returns basic application information.
    *   **Response**:
        ```json
        {
          "status": "ok",
          "name": "Model Context Reasoner",
          "version": "2.0.0"
        }
        ```

### 2. Session Management

Sessions are stateful contexts where facts are stored and reasoned upon.

*   `POST /sessions`
    *   **Description**: Creates a new reasoning session.
    *   **Response**:
        ```json
        {
          "sessionId": "a-unique-uuid",
          "createdAt": "2023-10-27T10:00:00.000Z",
          "facts": [],
          "factCount": 0
        }
        ```

*   `GET /sessions/:sessionId`
    *   **Description**: Retrieves the details of a specific session.
    *   **Parameters**: `sessionId` (path) - The ID of the session.
    *   **Response**: (Same as `POST /sessions` response, but with current facts)
        ```json
        {
          "sessionId": "a-unique-uuid",
          "createdAt": "2023-10-27T10:00:00.000Z",
          "facts": ["fact1.", "fact2."],
          "factCount": 2
        }
        ```

*   `DELETE /sessions/:sessionId`
    *   **Description**: Terminates and deletes a session and its associated facts.
    *   **Parameters**: `sessionId` (path) - The ID of the session to terminate.
    *   **Response**:
        ```json
        {
          "message": "Session a-unique-uuid terminated."
        }
        ```

### 3. Asserting Facts

Add natural language statements to a session's knowledge base. MCR uses an LLM to translate these into Prolog facts/rules.

*   `POST /sessions/:sessionId/assert`
    *   **Description**: Translates natural language text into Prolog facts/rules and adds them to the specified session.
    *   **Parameters**: `sessionId` (path) - The ID of the session.
    *   **Request Body**:
        ```json
        {
          "text": "The cat is on the mat. All cats like milk."
        }
        ```
    *   **Response**:
        ```json
        {
          "addedFacts": ["on(cat, mat).", "likes(X, milk) :- cat(X)."],
          "totalFactsInSession": 2,
          "metadata": { "success": true }
        }
        ```

### 4. Querying the Knowledge Base

Ask natural language questions against a session's knowledge base. MCR translates the question to Prolog, runs the query, and translates the result back to natural language.

*   `POST /sessions/:sessionId/query`
    *   **Description**: Translates a natural language question into a Prolog query, executes it against the session's knowledge base (including a common-sense ontology), and returns a natural language answer.
    *   **Parameters**: `sessionId` (path) - The ID of the session.
    *   **Request Body**:
        ```json
        {
          "query": "Is the cat on the mat?",
          "options": {
            "style": "conversational", // Optional: "conversational" (default) or "formal"
            "debug": true              // Optional: Include debug info (facts in session)
          }
        }
        ```
    *   **Response**:
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
        *   If no solution is found, `result` will be "No solution found." and `answer` will reflect that.

### 5. Direct Translation Endpoints

These endpoints allow direct translation without session management.

*   `POST /translate/nl-to-rules`
    *   **Description**: Translates natural language text into a list of Prolog facts/rules.
    *   **Request Body**:
        ```json
        {
          "text": "Birds can fly. Penguins are birds but cannot fly."
        }
        ```
    *   **Response**:
        ```json
        {
          "rules": ["can_fly(X) :- bird(X).", "bird(penguin).", "not(can_fly(penguin))."]
        }
        ```

*   `POST /translate/rules-to-nl`
    *   **Description**: Translates a list of Prolog rules into a cohesive natural language explanation.
    *   **Request Body**:
        ```json
        {
          "rules": ["parent(X, Y) :- father(X, Y).", "parent(X, Y) :- mother(X, Y)."],
          "style": "formal" // Optional: "conversational" or "formal" (default)
        }
        ```
    *   **Response**:
        ```json
        {
          "text": "A parent (X) is defined as either a father (X) of Y or a mother (X) of Y."
        }
        ```

---

## TODO

*   Advanced error handling and debugging to diagnose translation and reasoner issues.
*   Prompt template editing and debugging.
*   Unit test framework.
*   Demo framework: try individual operations.
*   Extensibility.
*   Integrate RAG / datastores through dynamic Prolog assertions / overlay.