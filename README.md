# Model Context Reasoner (MCR)

A simplified, elegant neurosymbolic library for JavaScript.

MCR provides a simple and powerful way to integrate large language models (LLMs) with formal logic reasoners (Prolog) for advanced AI applications. It is designed to be a lightweight, embeddable library that can be used in any JavaScript or TypeScript project.

## Features

-   **Library-first design:** Easily embeddable in any JS/TS project.
-   **Pluggable LLM providers:** Supports OpenAI, Gemini, Ollama, and custom providers.
-   **In-process Prolog reasoner:** Uses tau-prolog for lightweight, in-process reasoning.
-   **Extensible plugin system:** Chainable functions for creating custom workflows.
-   **Zero-dependency core:** The core library has no dependencies other than tau-prolog.

## Getting Started

### Installation

```bash
npm install model-context-reasoner
```

### Usage

```javascript
import MCR from 'model-context-reasoner';

const config = {
  llm: {
    provider: 'openai',
    apiKey: 'sk-...',
  },
};

const mcr = await MCR.create(config);

const sessionId = await mcr.createSession('man(socrates). mortal(X) :- man(X).');
await mcr.assert(sessionId, 'Socrates is a man.');
const result = await mcr.query(sessionId, 'Is Socrates mortal?');

console.log(result.answer);

await mcr.retract(sessionId, 'Socrates is a man.');
const retractedResult = await mcr.query(sessionId, 'Is Socrates mortal?');
console.log(retractedResult.answer);
```

MCR now uses a `Session` class to manage the state of each conversation. You can create a new session with an initial knowledge base, and then use the `assert`, `retract`, and `query` methods to interact with it.
