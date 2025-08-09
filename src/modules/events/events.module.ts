import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { EventsRepository } from './events.repository';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Module({
  imports: [JwtModule.register({})],
  controllers: [EventsController],
  providers: [EventsService, EventsRepository, JwtAuthGuard],
  exports: [EventsService, JwtModule],
})
export class EventsModule {}
