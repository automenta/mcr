import { ILlmProvider } from '../interfaces';

export class NullLlmProvider implements ILlmProvider {
  async generate(prompt: string): Promise<string> {
    return "This is a mock response from the null LLM provider.";
  }
  
  getName(): string {
    return "null";
  }
}