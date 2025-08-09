import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { EventsRepository } from './events.repository';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AIModule } from '../ai/ai.module';
import { MatchingModule } from '../matching/matching.module';
import { QueueModule } from '../queue/queue.module';
import { forwardRef } from '@nestjs/common';

@Module({
  imports: [JwtModule.register({}), AIModule, MatchingModule, forwardRef(() => QueueModule)],
  controllers: [EventsController],
  providers: [EventsService, EventsRepository, JwtAuthGuard],
  exports: [EventsService, JwtModule],
})
export class EventsModule {}
