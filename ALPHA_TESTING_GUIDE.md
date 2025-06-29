# Model Context Reasoner (MCR) - Alpha Testing Guide

Thank you for helping test the Model Context Reasoner! This guide provides an overview of key functionalities, setup instructions, and known limitations for this alpha release.

## What is MCR?

The Model Context Reasoner (MCR) is a server application that bridges Large Language Models (LLMs) with formal logic reasoners (Prolog). It allows applications to perform complex logical reasoning by translating natural language into formal logic, managing knowledge in stateful sessions, and translating results back to natural language.

## Key Functionalities to Test

We encourage you to test the following core features:

1.  **Server Operation**:

    - Starting the server (`node mcr.js`).
    - Checking server status (CLI: `node mcr-cli.js status`, API: `GET /`).

2.  **Session Management**:

    - Creating new sessions (CLI: `create-session`, API: `POST /sessions`).
    - Retrieving session details (CLI: `get-session <id>`, API: `GET /sessions/:sessionId`).
    - Asserting facts into a session (CLI: `assert <id> "fact"`, API: `POST /sessions/:sessionId/assert`).
      - Test with simple and more complex statements.
    - Querying a session (CLI: `query <id> "question"`, API: `POST /sessions/:sessionId/query`).
      - Test with questions that should yield "yes", "no", or specific variable bindings.
      - Try the `debug` option in the API query.
    - Deleting sessions (CLI: `delete-session <id>`, API: `DELETE /sessions/:sessionId`).

3.  **Ontology Management**:

    - The `family.pl` ontology is provided in the `ontologies/` directory.
    - Adding a new ontology (CLI: `add-ontology <name> <file.pl>`, API: `POST /ontologies`).
    - Listing ontologies (CLI: `get-ontologies`, API: `GET /ontologies`).
    - Retrieving a specific ontology (CLI: `get-ontology <name>`, API: `GET /ontologies/:name`).
    - Updating an ontology (CLI: `update-ontology <name> <file.pl>`, API: `PUT /ontologies/:name`).
    - Deleting an ontology (CLI: `delete-ontology <name>`, API: `DELETE /ontologies/:name`).
    - Querying with dynamic ontology content (see `ontology` field in `POST /sessions/:sessionId/query` API endpoint or `-o` flag in CLI `query` and `chat` commands).

4.  **Direct Translation Utilities**:

    - NL-to-Rules (API: `POST /translate/nl-to-rules`).
    - Rules-to-NL (API: `POST /translate/rules-to-nl`).

5.  **Debugging Utilities**:

    - Get prompt templates (API: `GET /prompts`).
    - Format prompt (dry run) (API: `POST /debug/format-prompt`).

6.  **Command Line Interface (CLI)**:
    - Use `node mcr-cli.js --help` to see all commands.
    - The `demo.sh` script provides a guided tour of CLI functionalities.
    - Try the interactive chat: `node mcr-cli.js chat`.
    - **Prompt Template Management (New CLI Commands)**:
      - List available prompt templates: `node mcr-cli.js prompt list`
      - Show a specific template: `node mcr-cli.js prompt show <templateName>` (e.g., `node mcr-cli.js prompt show NL_TO_RULES`)
      - Debug a template with variables: `node mcr-cli.js prompt debug <templateName> '<jsonInputVariables>'` (e.g., `node mcr-cli.js prompt debug QUERY_TO_PROLOG '{"question":"What is X?"}'`)
    - **Raw JSON Output**: For scripting or detailed inspection, all CLI commands support a global `--json` flag (e.g., `node mcr-cli.js status --json`). This will output the raw JSON response from the API.

## Setup

1.  **Prerequisites**: Node.js (version specified in `package.json` `engines` field, currently >=18.0.0).
2.  **Installation**:
    ```bash
    git clone <repository_url>
    cd model-context-reasoner
    npm install
    ```
3.  **Configuration**:
    - Create a `.env` file in the root directory. See `README.md` for LLM provider API keys and other options (e.g., `OPENAI_API_KEY`, `GEMINI_API_KEY`).
    - Select your LLM provider in `.env` (e.g., `MCR_LLM_PROVIDER="openai"`).
    - An `.env.example` file is provided as a template.
4.  **Running the Server**:
    ```bash
    node mcr.js
    ```
    The server will default to `http://localhost:8080`.

## Known Limitations & Issues (Alpha)

- **LLM Translation Quality**: The accuracy of translating natural language to Prolog, and Prolog results back to natural language, depends heavily on the chosen LLM and the complexity of the language/query. Some translations might be imperfect.
- **Prolog Reasoner Limits**: Tau Prolog is powerful but may have limitations with extremely complex or large knowledge bases compared to some desktop Prolog systems.
- **Error Reporting**: While improved, some error messages from deep within LLM or Prolog interactions might still be generic. The `X-Correlation-ID` in logs and API responses is key for debugging. When reporting API errors, please include the `type` and `code` (if present) from the error response object, along with the `message`.
  ```json
  {
    "error": {
      "message": "Descriptive error message",
      "type": "ApiError",
      "code": "SPECIFIC_ERROR_CODE", // Include this if available
      "correlationId": "a-unique-uuid"
    }
  }
  ```
- **Configuration Validation**: The server now performs stricter validation of `.env` settings on startup. If critical settings for your chosen `MCR_LLM_PROVIDER` are missing (e.g., API key for OpenAI/Gemini, or a valid URL for Ollama), the server will log a detailed error and refuse to start. This is intentional to prevent runtime issues.
- **Scalability**: The current session and ontology management is file-based (defaulting to `./sessions_data` and `./ontologies_data`) and in-memory, suited for single-user or light load. It's not designed for high-concurrency production loads without further enhancements.
- **Security Vulnerability**: The previously mentioned low-severity SQL Injection vulnerability in `@langchain/community` has been addressed by updating the dependency to version `^0.3.47`.
- **Ontology Storage**: Ontologies created via the API or CLI (`add-ontology`, `update-ontology`) are stored as `.pl` files in the `./ontologies_data/` directory by default. This directory is now included in `.gitignore` to prevent accidentally committing user-specific or test ontologies.
  - If you create an ontology that you believe is broadly useful and should be part of the core application, you can manually commit it by using `git add -f ontologies_data/your_ontology_name.pl`.
  - The application also loads ontologies from the `ontologies/` directory (which is version-controlled and intended for bundled, default ontologies like `family.pl`).

## Feedback

Please report any bugs, issues, or feedback to [Specify Feedback Channel - e.g., GitHub Issues, email address].
Include:

- Steps to reproduce the issue.
- Expected behavior vs. actual behavior.
- Relevant logs (especially messages with `X-Correlation-ID`).
- MCR version (e.g., from `GET /` API, which should now show `2.1.0` or similar, or `package.json`).

Thank you for your time and effort in testing MCR!
