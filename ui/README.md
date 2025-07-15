# MCR Chat-Based UI

This is a React-based UI for the Model-Context-Reasoner (MCR). It provides a chat-based interface for interacting with the MCR, as well as visualizations for the different contexts (NL, Reasoning, KB, Evolution).

## Features

- **Chat-based interaction:** Interact with the MCR using natural language.
- **Slash commands:** Use slash commands for specific actions (e.g., `/assert`, `/query`).
- **Context visualization:** Visualize the different contexts (NL, Reasoning, KB, Evolution) as graphs.
- **Embedding visualization:** Node embeddings are visualized as bitmaps in the graph nodes.
- **Pure LM mode:** A "pure LM" mode is available for interacting with the language model without the reasoning components.
- **Onboarding:** A simple onboarding banner is shown to new users.

## How to use

1. Start the MCR backend.
2. Start the UI development server: `npm run dev:ui`
3. Open the UI in your browser.

You can then connect to a session and start interacting with the MCR. Use the sidebar to switch between different context views and to configure the MCR.
