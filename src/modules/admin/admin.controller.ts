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

@ApiTags('Admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class AdminController {
  constructor(private readonly eventsRepo: EventsRepository, private readonly ingestion: IngestionService) {}
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
  buildPlans(@Param('id') id: string) {
    return { enqueued: true };
  }

  @Post('events/:id/ai/relabel')
  @ApiOperation({ summary: 'Re-run normalization' })
  @ApiResponse({ status: 202 })
  relabel(@Param('id') id: string) {
    return { enqueued: true };
  }

  @Post('ingestion/run')
  @ApiOperation({ summary: 'Run ingestion' })
  @ApiResponse({ status: 202 })
  async runIngestion() { await this.ingestion.pullTicketmasterNYC(); return { ok: true } }
}
