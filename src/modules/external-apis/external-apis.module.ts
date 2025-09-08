import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AIModule } from '../ai/ai.module';
import { DatabaseModule } from '../../database/database.module';

// Services
import { YelpFusionService } from './services/yelp-fusion.service';
import { MeetupGraphQLService } from './services/meetup-graphql.service';
import { SeatGeekService } from './services/seatgeek.service';
import { NYCParksService } from './services/nyc-parks.service';
import { TicketmasterDiscoveryService } from './services/ticketmaster-discovery.service';
import { ExternalAPIAggregatorService } from './services/external-api-aggregator.service';
import { ExternalSyncService } from './services/external-sync.service';

@Module({
  imports: [
    ConfigModule,
    ScheduleModule.forRoot(), // Enable cron jobs
    AIModule,
    DatabaseModule,
  ],
  providers: [
    YelpFusionService,
    MeetupGraphQLService,
    SeatGeekService,
    NYCParksService,
    TicketmasterDiscoveryService,
    ExternalAPIAggregatorService,
    ExternalSyncService,
  ],
  exports: [
    YelpFusionService,
    MeetupGraphQLService,
    SeatGeekService,
    NYCParksService,
    TicketmasterDiscoveryService,
    ExternalAPIAggregatorService,
    ExternalSyncService,
  ],
})
export class ExternalAPIsModule {}
