import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Ollama } from 'ollama';

class OpenAIProvider {
  constructor(config) {
    this.openai = new OpenAI({ apiKey: config.apiKey });
    this.model = config.model;
  }

  async generate(prompt) {
    const response = await this.openai.chat.completions.create({
      model: this.model,
      messages: [{ role: 'user', content: prompt }],
    });
    return response.choices[0].message.content;
  }
}

class GeminiProvider {
  constructor(config) {
    this.genAI = new GoogleGenerativeAI(config.apiKey);
    this.model = this.genAI.getGenerativeModel({ model: config.model });
  }

  async generate(prompt) {
    const result = await this.model.generateContent(prompt);
    const response = await result.response;
    return response.text();
  }
}

class OllamaProvider {
  constructor(config) {
    this.ollama = new Ollama({ host: config.host || 'http://localhost:11434' });
    this.model = config.model;
  }

  async generate(prompt) {
    const response = await this.ollama.generate({
      model: this.model,
      prompt,
    });
    return response.response;
  }
}

export function getLLMProvider(config) {
  switch (config.provider) {
    case 'openai':
      return new OpenAIProvider(config);
    case 'gemini':
      return new GeminiProvider(config);
    case 'ollama':
      return new OllamaProvider(config);
    default:
      if (typeof config.provider === 'function') {
        return { generate: config.provider };
      }
      throw new Error(`Unsupported LLM provider: ${config.provider}`);
  }
}
