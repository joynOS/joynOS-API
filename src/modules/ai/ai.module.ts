import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AIService } from './ai.service';
import { AIProviderFactory } from './services/ai-provider.factory';
import { GeminiProvider } from './providers/gemini.provider';
import { GroqProvider } from './providers/groq.provider';

@Module({
  imports: [ConfigModule],
  providers: [AIService, AIProviderFactory, GeminiProvider, GroqProvider],
  exports: [AIService],
})
export class AIModule {}
