import axios from 'axios';
import { ILlmProvider } from '../interfaces';

export interface OllamaConfig {
  baseUrl: string;
  model: string;
}

export class OllamaLlmProvider implements ILlmProvider {
  private config: OllamaConfig;

  constructor(config: OllamaConfig) {
    this.config = config;
  }

  async generate(prompt: string): Promise<string> {
    try {
      const response = await axios.post(`${this.config.baseUrl}/api/generate`, {
        model: this.config.model,
        prompt: prompt,
        stream: false
      });

      return response.data.response || '';
    } catch (error) {
      console.error('Ollama API error:', error);
      throw new Error(`Ollama API call failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  getName(): string {
    return `ollama-${this.config.model}`;
  }
}