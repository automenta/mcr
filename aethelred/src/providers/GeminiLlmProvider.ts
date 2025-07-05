import { GoogleGenerativeAI } from '@google/generative-ai';
import { ILlmProvider } from '../interfaces';

export interface GeminiConfig {
  apiKey: string;
  model: string;
}

export class GeminiLlmProvider implements ILlmProvider {
  private genAI: GoogleGenerativeAI;
  private config: GeminiConfig;

  constructor(config: GeminiConfig) {
    this.config = config;
    this.genAI = new GoogleGenerativeAI(config.apiKey);
  }

  async generate(prompt: string): Promise<string> {
    try {
      const model = this.genAI.getGenerativeModel({ model: this.config.model });
      const result = await model.generateContent(prompt);
      const response = await result.response;
      return response.text();
    } catch (error) {
      console.error('Gemini API error:', error);
      throw new Error(`Gemini API call failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  getName(): string {
    return `gemini-${this.config.model}`;
  }
}