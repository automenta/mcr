## Code Guidelines / Conventions

- Complete (fully functional)
- Professional-grade, not explanatory/educational
- Correct (bug-free and logically sound)
- Compact (minimal codebase size)
  - Using space-saving syntax constructs, like ternary/switch/etc..., to minimize lines and tokens
  - Using the latest language version's syntax options to best express code
- Consolidated (avoids unnecessary separation)
- Deduplicated (no redundant logic)
  - Introduce helpful abstractions functions, parameters, and classes to share common code
  - Apply "don't repeat yourself" principles
- Modular (logically organized, supporting abstraction, OOP principles)
- **Prioritize self-documenting code** through clear naming, concise logic, and good structure.
- **Use comments judiciously where they add significant value:**
  - **JSDoc for public functions/modules:** Document parameters, return values, and purpose for all exported functions and class methods that form the public API of a module.
  - **Explain complex or non-obvious logic:** If a piece of code is intricate or its reasoning isn't immediately clear from the code itself, a brief comment explaining the "why" can be very helpful.
  - **Document workarounds or important assumptions.**
- **Avoid redundant comments** that merely restate what the code clearly shows (e.g., `// increment i` for `i++`).
- Use the latest version of the language, APIs, and dependencies

## Extensibility

This section outlines how the MCR application can be extended, focusing on key areas like LLM providers and reasoning engines.

### LLM Provider Integration

The system supports multiple LLM providers (e.g., OpenAI, Gemini, Ollama, Anthropic, Generic OpenAI-compatible) via a strategy pattern implemented in `src/llmService.js`.

**To add a new LLM provider (e.g., "MyNewProvider"):**

1.  **Create Provider Module:**
    - Add a new file, for example, `src/llmProviders/myNewProvider.js`.
    - This module must export an object with at least two properties:
      - `name` (string): The unique identifier for the provider (e.g., `'mynewprovider'`). This name will be used in the configuration.
      - `initialize` (function): A function that takes the LLM configuration section (`llmConfig` from the global application config) as an argument. It should:
        - Perform any necessary setup (e.g., check for API keys using `llmConfig.apiKey.mynewprovider`).
        - Return an instance of a LangChain-compatible chat model client (e.g., an object that exposes an `invoke()` method or can be used in a LangChain `chain.pipe()` sequence).
        - Return `null` or throw an error if initialization fails (e.g., missing API key). `LlmService` will handle `null` by logging an error.
    - Example structure for `src/llmProviders/myNewProvider.js`:

      ```javascript
      const { SomeChatClient } = require('some-llm-sdk'); // Hypothetical SDK
      const logger = require('../logger').logger;

      const MyNewProvider = {
        name: 'mynewprovider',
        initialize: (llmConfig) => {
          const apiKey = llmConfig.apiKey?.mynewprovider;
          const modelName = llmConfig.model?.mynewprovider;
          if (!apiKey) {
            logger.warn(
              'MyNewProvider API key not provided. Service will not be available.'
            );
            return null;
          }
          try {
            return new SomeChatClient({
              apiKey,
              model: modelName /*, ...other options */,
            });
          } catch (error) {
            logger.error(
              `Failed to initialize MyNewProvider client: ${error.message}`
            );
            return null;
          }
        },
      };
      module.exports = MyNewProvider;
      ```

2.  **Register Provider in `LlmService`:**
    - Open `src/llmService.js`.
    - Import your new provider module: `const MyNewProvider = require('./llmProviders/myNewProvider');`
    - In the `LlmService.init()` method, add a call to register your provider: `this.registerProvider(MyNewProvider);`

3.  **Update Configuration Management (`src/config.js`):**
    - Add `'mynewprovider'` to the `VALID_LLM_PROVIDERS` array.
    - Update the configuration validation logic within `ConfigManager.validateConfig(config)` to check for necessary settings when `MCR_LLM_PROVIDER` is `'mynewprovider'`. This typically involves ensuring `config.llm.apiKey.mynewprovider` and `config.llm.model.mynewprovider` are present.
    - Add default model name for your provider in `defaultConfig.llm.model`.
    - If your provider requires unique top-level configuration keys (like `ollamaBaseUrl` or `genericOpenaiBaseUrl`), add them to `defaultConfig.llm` and `loadedConfig.llm`.
    - Ensure API keys are handled correctly in `defaultConfig.llm.apiKey` and `loadedConfig.llm.apiKey`.

4.  **Update Documentation:**
    - Add configuration instructions for the new provider to `.env.example` and `README.md`.
    - Briefly mention the new provider in the introduction to this "LLM Provider Integration" section.

**Further Enhancements (Future Considerations):**

- **Dynamic Provider Loading:** To avoid modifying `LlmService.init()` for each new provider, a dynamic loading mechanism could be implemented (e.g., scanning the `src/llmProviders/` directory).
- **Data-Driven Config Validation:** `ConfigManager` validation could be made more generic if provider modules exported their required configuration keys.

### Reasoner Integration

The MCR is currently designed specifically for a **Prolog reasoner**, using the `tau-prolog` library via `src/reasonerService.js`.

**Extending to other types of reasoners (e.g., Datalog, Answer Set Programming) would be a major architectural change and would involve:**

1.  **Abstracting the Reasoner Interface:**
    - Defining a common interface (e.g., `initialize(config)`, `assert(data)`, `query(queryString)`, `getName()`) that different reasoner services would implement.
    - Refactoring `src/reasonerService.js` to either become this interface or a dispatcher that loads a specific reasoner implementation based on configuration.

2.  **Modifying LLM Translation:**
    - `LlmService` and its associated prompts (in `src/prompts.js`) are currently geared towards generating Prolog facts, rules, and queries.
    - These would need to be adapted or made configurable to generate syntax compatible with the new reasoner type. This is a significant task, as prompt engineering is crucial.

3.  **Data Format Changes:**
    - The structure of "facts" asserted into sessions and the "query" language would change based on the reasoner.

4.  **Configuration Changes:**
    - A new configuration option would be needed to select the active reasoner type.

Given these complexities, supporting alternative reasoner types is a significant future enhancement rather than a simple extension.

### Other Areas

- **Prompt Management:** Prompts are hardcoded in `src/prompts.js`. A more extensible system might load templates from files or a database, potentially allowing user-defined templates via an API (as noted in `TODO.md`).
- **Session and Ontology Storage:** Both are currently file-system based (`src/sessionManager.js`). Supporting alternative backends (e.g., databases) would require abstracting the storage operations behind a common interface (adapter pattern), similar to the suggestions for reasoner integration.
