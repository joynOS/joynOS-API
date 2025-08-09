import { Module } from '@nestjs/common'
import { IngestionService } from './ingestion.service'
import { AIModule } from '../ai/ai.module'

@Module({ imports: [AIModule], providers: [IngestionService], exports: [IngestionService] })
export class IngestionModule {}
