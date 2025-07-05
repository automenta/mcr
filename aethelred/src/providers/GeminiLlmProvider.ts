import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold, GenerationConfig, SystemInstruction } from '@google/generative-ai';
import type { ILlmProvider } from '../interfaces/ILlmProvider';

export interface GeminiConfig {
  apiKey: string;
  model: string; // e.g., "gemini-1.5-flash-latest" or "gemini-pro"
  systemPrompt?: string; // Optional default system prompt
  generationConfig?: GenerationConfig; // Optional: e.g., { temperature: 0.7, topP: 0.9, maxOutputTokens: 2048 }
  safetySettings?: Array<{ category: HarmCategory, threshold: HarmBlockThreshold }>;
}

/**
 * LLM provider for Google's Gemini models.
 */
export class GeminiLlmProvider implements ILlmProvider {
  private genAI: GoogleGenerativeAI;
  private modelName: string;
  private systemInstruction?: SystemInstruction;
  private generationConfig?: GenerationConfig;
  private safetySettings?: Array<{ category: HarmCategory, threshold: HarmBlockThreshold }>;


  constructor(config: GeminiConfig) {
    if (!config.apiKey) {
      throw new Error("Gemini API key must be provided in the configuration.");
    }
    if (!config.model) {
      throw new Error("Gemini model name must be provided in the configuration.");
    }
    this.genAI = new GoogleGenerativeAI(config.apiKey);
    this.modelName = config.model;

    if (config.systemPrompt) {
      this.systemInstruction = {
        role: "system", // Typically "system", could also be "user" or "model" based on API needs
        parts: [{ text: config.systemPrompt }],
      };
    }
    this.generationConfig = config.generationConfig;
    this.safetySettings = config.safetySettings || [ // Default safety settings
      { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
      { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
      { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
      { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    ];
  }

  getName(): string {
    return `gemini-${this.modelName}`;
  }

  /**
   * Generates text using the Gemini API.
   * @param prompt The user prompt.
   * @param systemPromptOverride Optional system prompt to override the one from constructor config.
   * @returns The generated text from the LLM.
   */
  async generate(prompt: string, systemPromptOverride?: string): Promise<string> {
    try {
      const modelInstance = this.genAI.getGenerativeModel({
        model: this.modelName,
        generationConfig: this.generationConfig,
        safetySettings: this.safetySettings,
        systemInstruction: systemPromptOverride
          ? { role: "system", parts: [{text: systemPromptOverride}] }
          : this.systemInstruction,
      });

      const result = await modelInstance.generateContent(prompt);
      const response = await result.response;

      if (response.promptFeedback && response.promptFeedback.blockReason) {
        throw new Error(`Gemini API call blocked: ${response.promptFeedback.blockReason}. Details: ${JSON.stringify(response.promptFeedback)}`);
      }
      if (!response.candidates || response.candidates.length === 0) {
        // This case might indicate an issue even if no explicit blockReason is given,
        // or if the model simply couldn't generate content for the prompt.
        const finishReason = response.candidates?.[0]?.finishReason;
        if (finishReason && finishReason !== "STOP" && finishReason !== "MAX_TOKENS") {
             throw new Error(`Gemini API call returned no candidates and finished with reason: ${finishReason}.`);
        }
        throw new Error("Gemini API call returned no candidates. The prompt might have been filtered or the model could not generate a response.");
      }

      const candidate = response.candidates[0];
      // Log if content is missing but there's no explicit block, could be safety filtering not reported in promptFeedback
      if (!candidate.content || !candidate.content.parts || candidate.content.parts.length === 0 || !candidate.content.parts.some(p => p.text && p.text.trim() !== "")) {
        if (candidate.finishReason && candidate.finishReason !== "STOP" && candidate.finishReason !== "MAX_TOKENS") {
            console.warn(`Gemini generation finished with reason: ${candidate.finishReason} but returned no substantive content.`);
            // Depending on strictness, could throw an error here
        } else if (!candidate.finishReason && !response.promptFeedback?.blockReason) {
            // This is an unusual state - no block, no clear finish reason, but no content
            console.warn(`Gemini generation returned no substantive content without a clear block or finish reason. Input prompt: "${prompt.substring(0,100)}..."`);
        }
      }

      return response.text();
    } catch (error: any) {
      // console.error('Gemini API error:', error.message);
      // Ensure the error message is helpful
      let message = `Gemini API call failed: ${error.message}`;
      if (error.response && error.response.data) { // For axios-like errors
        message += ` - ${JSON.stringify(error.response.data)}`;
      } else if (error.cause) { // For errors with a 'cause' property
        message += ` - Caused by: ${error.cause}`;
      }
      throw new Error(message);
    }
  }
}
