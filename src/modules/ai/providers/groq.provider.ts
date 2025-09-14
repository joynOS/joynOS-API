import { Injectable } from '@nestjs/common';
import Groq from 'groq-sdk';
import { AIProvider } from '../interfaces/ai-provider.interface';

@Injectable()
export class GroqProvider implements AIProvider {
  private readonly groq: Groq;

  constructor() {
    this.groq = new Groq({
      apiKey: process.env.GROQ_API_KEY,
    });
  }

  async generateContent(prompt: string): Promise<string> {
    const chatCompletion = await this.groq.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: 'llama-3.1-8b-instant',
      temperature: 0.7,
      max_tokens: 2048,
    });

    return chatCompletion.choices[0]?.message?.content || '';
  }

  async generateStructuredContent<T>(prompt: string): Promise<T> {
    const enhancedPrompt = `${prompt}\n\nRespond with valid JSON only. No markdown, no explanations, just the JSON object.`;
    const response = await this.generateContent(enhancedPrompt);
    return this.parseJson<T>(response);
  }

  private parseJson<T>(raw: string): T {
    try {
      const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      return JSON.parse(cleaned);
    } catch (error) {
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        return JSON.parse(match[0]);
      }
      throw new Error(`Failed to parse AI response: ${raw}`);
    }
  }
}