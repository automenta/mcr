import type { ILlmProvider } from '../interfaces/ILlmProvider';

export interface OllamaConfig {
  baseURL?: string; // Optional: defaults to http://localhost:11434
  model: string;   // Required: the model name to use
  format?: 'json'; // Optional: to get JSON output from Ollama
  options?: Record<string, any>; // Optional: e.g., temperature, top_p for the model
  keep_alive?: string | number; // Optional: keep_alive parameter for Ollama
  systemPrompt?: string; // Optional: A system prompt to use with the generation
}

interface OllamaGenerateRequest {
  model: string;
  prompt: string;
  system?: string;
  template?: string;
  context?: number[]; // Context from previous generations
  stream?: boolean;
  raw?: boolean;
  format?: 'json';
  options?: Record<string, any>;
  keep_alive?: string | number;
}

interface OllamaGenerateResponse {
  model: string;
  created_at: string;
  response: string; // This is the full response string
  done: boolean;
  context?: number[]; // Context for next generation
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

/**
 * LLM provider for Ollama.
 * Interacts with an Ollama server instance.
 */
export class OllamaLlmProvider implements ILlmProvider {
  private baseURL: string;
  private model: string;
  private format?: 'json';
  private llmOptions?: Record<string, any>;
  private keep_alive: string | number;
  private systemPrompt?: string;

  constructor(config: OllamaConfig) {
    this.baseURL = config.baseURL || 'http://localhost:11434';
    this.model = config.model;
    this.format = config.format;
    this.llmOptions = config.options;
    this.keep_alive = config.keep_alive || '5m'; // Default keep_alive for Ollama
    this.systemPrompt = config.systemPrompt;

    if (!this.model) {
      throw new Error("Ollama 'model' must be specified in the configuration.");
    }
  }

  getName(): string {
    return `ollama-${this.model}`;
  }

  /**
   * Generates text using the Ollama API.
   * @param prompt The user prompt.
   * @param systemPromptOverride Optional system prompt to override the one from constructor config.
   * @returns The generated text from the LLM.
   */
  async generate(prompt: string, systemPromptOverride?: string): Promise<string> {
    const endpoint = `${this.baseURL}/api/generate`;

    const effectiveSystemPrompt = systemPromptOverride || this.systemPrompt;

    const requestBody: OllamaGenerateRequest = {
      model: this.model,
      prompt: prompt,
      stream: false, // We want the full response, not a stream
      format: this.format,
      options: this.llmOptions,
      keep_alive: this.keep_alive,
    };

    if (effectiveSystemPrompt) {
      requestBody.system = effectiveSystemPrompt;
    }

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        // Attempt to parse error if it's JSON
        try {
          const parsedError = JSON.parse(errorBody);
          if (parsedError && parsedError.error) {
            throw new Error(`Ollama API request failed: ${parsedError.error} (Status: ${response.status})`);
          }
        } catch (e) {
          // Not a JSON error, use text
        }
        throw new Error(`Ollama API request failed with status ${response.status}: ${errorBody}`);
      }

      const data = (await response.json()) as OllamaGenerateResponse;
      return data.response;
    } catch (error: any) {
      // console.error("Error calling Ollama API:", error.message);
      throw new Error(`Failed to generate text with Ollama: ${error.message}`);
    }
  }
}
