export interface ILlmProvider {
  /**
   * Sends a prompt to the LLM and returns its raw text response
   */
  generate(prompt: string): Promise<string>;
  
  /**
   * Returns the name/type of this LLM provider
   */
  getName(): string;
}