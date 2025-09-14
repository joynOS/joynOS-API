import { Injectable } from '@nestjs/common';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { AIProvider } from '../interfaces/ai-provider.interface';

@Injectable()
export class GeminiProvider implements AIProvider {
  private readonly gen: GoogleGenerativeAI;
  private readonly model: any;

  constructor() {
    this.gen = new GoogleGenerativeAI(process.env.GEMINI_API_KEY as string);
    this.model = this.gen.getGenerativeModel({ model: 'gemini-1.5-flash' });
  }

  async generateContent(prompt: string): Promise<string> {
    const result = await this.model.generateContent(prompt);
    return result.response.text();
  }

  async generateStructuredContent<T>(prompt: string): Promise<T> {
    const response = await this.generateContent(prompt);
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