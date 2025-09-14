import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AIProvider } from '../interfaces/ai-provider.interface';
import { GeminiProvider } from '../providers/gemini.provider';
import { GroqProvider } from '../providers/groq.provider';

@Injectable()
export class AIProviderFactory {
  constructor(private readonly configService: ConfigService) {}

  createProvider(): AIProvider {
    const aiProvider = this.configService.get('AI_PROVIDER', 'gemini');

    switch (aiProvider.toLowerCase()) {
      case 'groq':
        return new GroqProvider();
      case 'gemini':
      default:
        return new GeminiProvider();
    }
  }
}