import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { EventsRepository } from '../events/events.repository';
import { IngestionService } from '../ingestion/ingestion.service';
import { RegionIngestionService } from '../ingestion/services/region-ingestion.service';
import {
  CreateRegionEventDto,
  BulkCreateRegionEventsDto,
} from '../ingestion/dto/region-ingestion.dto';

@ApiTags('Admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class AdminController {
  constructor(
    private readonly eventsRepo: EventsRepository,
    private readonly ingestion: IngestionService,
    private readonly regionIngestion: RegionIngestionService,
  ) {}
  @Post('events')
  @ApiOperation({ summary: 'Create event' })
  @ApiResponse({ status: 201 })
  createEvent(
    @Body()
    body: {
      title: string;
      externalBookingUrl?: string;
      source?: string;
      sourceId?: string;
    },
  ) {
    return this.eventsRepo.createEvent(body);
  }

  @Post('events/:id/ai/build-plans')
  @ApiOperation({ summary: 'Force AI plan build' })
  @ApiResponse({ status: 202 })
  async buildPlans(@Param('id') id: string) {
    return { ok: true };
  }

  @Post('events/:id/ai/relabel')
  @ApiOperation({ summary: 'Re-run normalization' })
  @ApiResponse({ status: 202 })
  async relabel(@Param('id') id: string) {
    return { ok: true };
  }

  @Post('ingestion/run')
  @ApiOperation({ summary: 'Run ingestion' })
  @ApiResponse({ status: 202 })
  async runIngestion() {
    await this.ingestion.pullTicketmasterNYC();
    return { ok: true };
  }

  @Post('ingestion/region')
  @ApiOperation({ summary: 'Create region-based event' })
  @ApiResponse({
    status: 201,
    description: 'Region event created successfully',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        title: { type: 'string' },
        regionName: { type: 'string' },
        vibeKey: { type: 'string' },
        gallery: { type: 'array', items: { type: 'string' } },
        plans: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              title: { type: 'string' },
              venue: { type: 'string' },
              rating: { type: 'number' },
              externalBookingUrl: { type: 'string' },
            },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid input or insufficient venues found',
  })
  async createRegionEvent(@Body() dto: CreateRegionEventDto) {
    const input = {
      region: dto.region,
      vibeKey: dto.vibeKey,
      searchRadiusM: dto.searchRadiusM,
      startTime: dto.startTime ? new Date(dto.startTime) : undefined,
      endTime: dto.endTime ? new Date(dto.endTime) : undefined,
    };

    const event = await this.regionIngestion.generateRegionEvent(input);
    return event;
  }

  @Post('ingestion/region/bulk')
  @ApiOperation({ summary: 'Create multiple region-based events' })
  @ApiResponse({
    status: 201,
    description: 'Bulk region events created',
    schema: {
      type: 'object',
      properties: {
        created: { type: 'number' },
        failed: { type: 'number' },
        results: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              event: { type: 'object', nullable: true },
              error: { type: 'string', nullable: true },
            },
          },
        },
      },
    },
  })
  async createRegionEventsBulk(@Body() dto: BulkCreateRegionEventsDto) {
    const results: Array<{
      success: boolean;
      event: any;
      error: string | null;
    }> = [];
    let created = 0;
    let failed = 0;

    for (const eventDto of dto.events) {
      try {
        const input = {
          region: eventDto.region,
          vibeKey: eventDto.vibeKey,
          searchRadiusM: eventDto.searchRadiusM,
          startTime: eventDto.startTime
            ? new Date(eventDto.startTime)
            : undefined,
          endTime: eventDto.endTime ? new Date(eventDto.endTime) : undefined,
        };

        const event = await this.regionIngestion.generateRegionEvent(input);
        results.push({ success: true, event, error: null });
        created++;
      } catch (error) {
        results.push({ success: false, event: null, error: error.message });
        failed++;
      }
    }

    return {
      created,
      failed,
      results,
    };
  }
}
