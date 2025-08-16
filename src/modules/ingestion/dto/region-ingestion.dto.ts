import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsNumber,
  IsDateString,
  ValidateNested,
  IsArray,
} from 'class-validator';
import { Type } from 'class-transformer';

export class RegionInputDto {
  @ApiPropertyOptional({ description: 'Google Places place_id' })
  @IsOptional()
  @IsString()
  placeId?: string;

  @ApiPropertyOptional({ description: 'Region name for text search' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Latitude for biased search' })
  @IsOptional()
  @IsNumber()
  lat?: number;

  @ApiPropertyOptional({ description: 'Longitude for biased search' })
  @IsOptional()
  @IsNumber()
  lng?: number;
}

export class CreateRegionEventDto {
  @ApiProperty({ description: 'Region information', type: RegionInputDto })
  @ValidateNested()
  @Type(() => RegionInputDto)
  region: RegionInputDto;

  @ApiProperty({
    description: 'Vibe key for venue search',
    enum: [
      'RELAXED',
      'DATE_NIGHT',
      'PARTY',
      'ARTSY',
      'MORNING',
      'CHILL',
      'SOCIAL',
      'CULTURAL',
    ],
  })
  @IsString()
  vibeKey: string;

  @ApiPropertyOptional({
    description: 'Search radius in meters',
    minimum: 300,
    maximum: 2000,
  })
  @IsOptional()
  @IsNumber()
  searchRadiusM?: number;

  @ApiPropertyOptional({ description: 'Event start time' })
  @IsOptional()
  @IsDateString()
  startTime?: string;

  @ApiPropertyOptional({ description: 'Event end time' })
  @IsOptional()
  @IsDateString()
  endTime?: string;
}

export class BulkCreateRegionEventsDto {
  @ApiProperty({
    description: 'Array of region events to create',
    type: [CreateRegionEventDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateRegionEventDto)
  events: CreateRegionEventDto[];
}
