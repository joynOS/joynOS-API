import { Type } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsBoolean,
  ValidateNested,
  Min,
  Max,
  IsString,
  IsDateString,
} from 'class-validator';

export class TimeWindowDto {
  @IsDateString()
  start: string;

  @IsDateString()
  end: string;
}

export class DiscoverAndGenerateDto {
  @IsNumber()
  @Min(-90)
  @Max(90)
  centerLat: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  centerLng: number;

  @IsNumber()
  @Min(0.5)
  @Max(50)
  radiusKm: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(20)
  maxRegions?: number = 6;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(5)
  maxEventsPerRegion?: number = 2;

  @IsOptional()
  @IsBoolean()
  diversityMode?: boolean = true;

  @IsOptional()
  @ValidateNested()
  @Type(() => TimeWindowDto)
  timeWindow?: TimeWindowDto;

  @IsOptional()
  @IsBoolean()
  dryRun?: boolean = false;
}

export class DiscoverPreviewDto {
  @IsNumber()
  @Min(-90)
  @Max(90)
  centerLat: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  centerLng: number;

  @IsNumber()
  @Min(0.5)
  @Max(50)
  radiusKm: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(20)
  maxRegions?: number = 6;

  @IsOptional()
  @IsBoolean()
  diversityMode?: boolean = true;
}

// Response types
export interface VibeCandidate {
  vibeKey: string;
  score: number;
}

export interface SampleVenue {
  placeId: string;
  name: string;
  types: string[];
  rating?: number;
}

export interface RegionCandidate {
  regionPlaceId?: string;
  regionName: string;
  center: { lat: number; lng: number };
  vibesRanked: VibeCandidate[];
  sampleVenues: SampleVenue[];
  venueCount: number;
  averageRating: number;
}

export interface DiscoveryPreviewResponse {
  regions: RegionCandidate[];
  summary: {
    totalVenuesFound: number;
    averageVenuesPerRegion: number;
    mostCommonVibes: string[];
  };
}

export interface CreatedEvent {
  eventId: string;
  regionName: string;
  vibeKey: string;
  startTime: string;
  endTime: string;
}

export interface SkippedEvent {
  reason: string;
  regionPlaceId?: string;
  regionName: string;
  vibeKey: string;
}

export interface DiscoverAndGenerateResponse {
  created: CreatedEvent[];
  skipped: SkippedEvent[];
  summary: {
    totalRegionsProcessed: number;
    eventsCreated: number;
    eventsSkipped: number;
  };
}