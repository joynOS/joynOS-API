import { 
  Controller, 
  Post, 
  Body, 
  UseGuards,
  HttpCode,
  HttpStatus,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { DailyIngestionCronService } from './services/daily-ingestion-cron.service';

@ApiTags('ingestion')
@Controller('ingestion')
export class IngestionController {
  constructor(
    private readonly dailyIngestionCron: DailyIngestionCronService,
  ) {}

  @Post('trigger-daily')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ 
    summary: 'Manually trigger daily event ingestion',
    description: 'Triggers the daily cron job manually. Useful for testing or emergency runs.'
  })
  @ApiQuery({ 
    name: 'maxEventsPerRegion', 
    required: false, 
    type: Number,
    description: 'Override max events per region (default: 3)'
  })
  async triggerDailyIngestion(
    @Query('maxEventsPerRegion') maxEventsPerRegion?: number,
  ) {
    await this.dailyIngestionCron.triggerManually(maxEventsPerRegion);
    
    return {
      message: 'Daily ingestion triggered successfully',
      timestamp: new Date().toISOString(),
      maxEventsPerRegion: maxEventsPerRegion || 3,
    };
  }
}