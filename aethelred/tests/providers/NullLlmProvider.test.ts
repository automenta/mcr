import { describe, it, expect, beforeEach } from '@jest/globals';
import { NullLlmProvider } from '../../src/providers/NullLlmProvider';

describe('NullLlmProvider', () => {
  let provider: NullLlmProvider;

  beforeEach(() => {
    provider = new NullLlmProvider();
  });

  it('should return the default response if no specific prompt is matched', async () => {
    const defaultResponse = "This is the default response.";
    provider.setDefaultResponse(defaultResponse);
    const result = await provider.generate("unknown_prompt");
    expect(result).toBe(defaultResponse);
  });

  it('should return a specific response for a matched prompt', async () => {
    const prompt = "hello";
    const specificResponse = "Hello there!";
    provider.setResponseForPrompt(prompt, specificResponse);
    const result = await provider.generate(prompt);
    expect(result).toBe(specificResponse);
  });

  it('should prioritize specific prompt response over default response', async () => {
    const prompt = "test_prompt";
    const specificResponse = "Specific";
    const defaultResponse = "Default";

    provider.setDefaultResponse(defaultResponse);
    provider.setResponseForPrompt(prompt, specificResponse);

    const result = await provider.generate(prompt);
    expect(result).toBe(specificResponse);
  });

  it('should return the initial default response if nothing else is configured', async () => {
    // Constructor default is "NullLlmProvider default response."
    const providerWithInitialDefault = new NullLlmProvider();
    const result = await providerWithInitialDefault.generate("any_prompt");
    expect(result).toBe("NullLlmProvider default response.");
  });

  it('should allow constructor to set a different initial default response', async () => {
    const customDefault = "Custom default from constructor.";
    const providerWithCustomDefault = new NullLlmProvider(customDefault);
    const result = await providerWithCustomDefault.generate("any_prompt");
    expect(result).toBe(customDefault);
  });

  it('should allow constructor to set specific responses', async () => {
    const prompt1 = "prompt1";
    const response1 = "response1";
    const prompt2 = "prompt2";
    const response2 = "response2";
    const providerWithMap = new NullLlmProvider("default", {
      [prompt1]: response1,
      [prompt2]: response2,
    });

    expect(await providerWithMap.generate(prompt1)).toBe(response1);
    expect(await providerWithMap.generate(prompt2)).toBe(response2);
    expect(await providerWithMap.generate("other_prompt")).toBe("default");
  });

  it('getName() should return "null"', () => {
    expect(provider.getName()).toBe("null");
  });
});
