import type { ILlmProvider } from '../interfaces/ILlmProvider';

/**
 * A Null LLM provider that returns fixed responses. Useful for testing workflows
 * without actual LLM calls.
 */
export class NullLlmProvider implements ILlmProvider {
  private responseMap: Map<string, string>;
  private defaultResponse: string;

  constructor(defaultResponse: string = "NullLlmProvider default response.", responseMap?: Record<string, string>) {
    this.defaultResponse = defaultResponse;
    this.responseMap = new Map(Object.entries(responseMap || {}));
  }

  /**
   * Sets a specific response for a given prompt.
   * @param prompt - The prompt string to match.
   * @param response - The response string to return.
   */
  setResponseForPrompt(prompt: string, response: string): void {
    this.responseMap.set(prompt, response);
  }

  /**
   * Sets the default response to return when no specific prompt is matched.
   * @param response - The default response string.
   */
  setDefaultResponse(response: string): void {
    this.defaultResponse = response;
  }

  async generate(prompt: string): Promise<string> {
    if (this.responseMap.has(prompt)) {
      const response = this.responseMap.get(prompt) as string;
      // console.log(`NullLlmProvider: Returning specific response for prompt "${prompt}": "${response}"`);
      return response;
    }
    // console.log(`NullLlmProvider: Returning default response for prompt "${prompt}": "${this.defaultResponse}"`);
    return this.defaultResponse;
  }

  getName(): string {
    return "null";
  }
}