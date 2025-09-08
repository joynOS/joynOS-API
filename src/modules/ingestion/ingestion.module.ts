import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { IngestionService } from './ingestion.service';
import { AIModule } from '../ai/ai.module';
import { AssetsModule } from '../assets/assets.module';
import { ExternalAPIsModule } from '../external-apis/external-apis.module';
import { RegionIngestionService } from './services/region-ingestion.service';
import { GooglePlacesService } from './services/google-places.service';
import { VibeMappingService } from './services/vibe-mapping.service';
import { DiscoveryService } from './services/discovery.service';

@Module({
  imports: [ConfigModule, AIModule, AssetsModule, ExternalAPIsModule],
  providers: [
    IngestionService,
    RegionIngestionService,
    GooglePlacesService,
    VibeMappingService,
    DiscoveryService,
  ],
  exports: [
    IngestionService,
    RegionIngestionService,
    GooglePlacesService,
    VibeMappingService,
    DiscoveryService,
  ],
})
export class IngestionModule {}
