import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import ollama from 'ollama';

async function getOpenAIProvider(config) {
  console.log('getOpenAIProvider: start');
  const openai = new OpenAI({ apiKey: config.apiKey });
  console.log('getOpenAIProvider: end');
  return {
    generate: async (prompt) => {
      const completion = await openai.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        model: config.model,
      });
      return completion.choices[0].message.content;
    },
  };
}

async function getGeminiProvider(config) {
  console.log('getGeminiProvider: start');
  const genAI = new GoogleGenerativeAI(config.apiKey);
  const model = genAI.getGenerativeModel({ model: config.model });
  console.log('getGeminiProvider: end');
  return {
    generate: async (prompt) => {
      const result = await model.generateContent(prompt);
      const response = await result.response;
      return response.text();
    },
  };
}

async function getOllamaProvider(config) {
  console.log('getOllamaProvider: start');
  console.log('getOllamaProvider: end');
  return {
    generate: async (prompt) => {
      const result = await ollama.generate({
        model: config.model,
        prompt,
      });
      return result.response;
    },
  };
}

export async function getLLMProvider(config) {
  console.log('getLLMProvider: start');
  let provider;
  switch (config.provider) {
    case 'openai':
      provider = await getOpenAIProvider(config);
      break;
    case 'gemini':
      provider = await getGeminiProvider(config);
      break;
    case 'ollama':
      provider = await getOllamaProvider(config);
      break;
    default:
      if (typeof config.provider === 'function') {
        provider = await config.provider(config);
      } else {
        throw new Error(`Unsupported LLM provider: ${config.provider}`);
      }
  }
  console.log('getLLMProvider: end');
  return provider;
}
