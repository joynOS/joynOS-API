import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../database/prisma.service';
import { AIService } from '../../ai/ai.service';
import { RegionIngestionService } from './region-ingestion.service';

@Injectable()
export class DailyIngestionCronService {
  private readonly logger = new Logger(DailyIngestionCronService.name);
  private isRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AIService,
    private readonly regionIngestion: RegionIngestionService,
    private readonly configService: ConfigService,
  ) {}

  // Run every day at 3 AM (when API usage is typically lower)
  // @Cron('0 3 * * *', {
  //   name: 'daily-event-ingestion',
  //   timeZone: 'America/New_York',
  // })
  @Cron('*/5 * * * *', {
    name: 'every-5-minutes-ingestion',
    timeZone: 'America/New_York',
  })
  async handleDailyIngestion() {
    // Skip if disabled via environment variable
    if (this.configService.get('DISABLE_CRON_JOBS') === 'true') {
      this.logger.debug('Cron jobs are disabled');
      return;
    }

    // Prevent overlapping runs
    if (this.isRunning) {
      this.logger.warn('Previous ingestion still running, skipping...');
      return;
    }

    this.isRunning = true;
    this.logger.log('🔄 Starting daily event ingestion...');

    try {
      // 1. CRITICAL: Test AI health first
      await this.testAIHealth();

      // 2. Get today's regions (rotate based on day)
      const regions = this.getTodaysRegions();
      this.logger.log(`Processing ${regions.length} regions today`);

      // 3. Process each region
      const results = await this.processRegions(regions);

      // 4. Clean old events (optional)
      await this.cleanOldEvents();

      // 5. Log summary
      this.logSummary(results);
    } catch (error: any) {
      this.logger.error(
        `Daily ingestion failed: ${error.message}`,
        error.stack,
      );

      // Send alert if AI is down (you can integrate with monitoring service)
      if (error.message?.includes('AI') || error.message?.includes('quota')) {
        this.logger.error(
          '⛔ CRITICAL: AI service is down! Events cannot be processed.',
        );
        // TODO: Send alert to monitoring service or admin
      }
    } finally {
      this.isRunning = false;
    }
  }

  private async testAIHealth(): Promise<void> {
    this.logger.debug('Testing AI health...');

    try {
      const testPlans = await this.aiService.buildTwoPlans({
        title: 'Health Check',
        venue: 'Test Venue',
        address: 'NYC',
        start: new Date().toISOString(),
      });

      if (!testPlans || testPlans.length === 0) {
        throw new Error('AI returned empty response');
      }

      this.logger.debug('✅ AI health check passed');
    } catch (error: any) {
      this.logger.error('❌ AI health check failed');

      if (error.message?.includes('quota') || error.message?.includes('429')) {
        throw new Error('AI quota exceeded - cannot continue without AI');
      }

      throw new Error(`AI is not responding: ${error.message}`);
    }
  }

  private getTodaysRegions() {
    const allRegions = [
      // Manhattan Core
      { name: 'SoHo, Manhattan', lat: 40.7223, lng: -74.002, vibe: 'ARTSY' },
      {
        name: 'Tribeca, Manhattan',
        lat: 40.7163,
        lng: -74.0086,
        vibe: 'CHILL',
      },
      {
        name: 'Chelsea, Manhattan',
        lat: 40.7465,
        lng: -74.0014,
        vibe: 'DATE_NIGHT',
      },
      {
        name: 'East Village, Manhattan',
        lat: 40.7264,
        lng: -73.9818,
        vibe: 'PARTY',
      },
      {
        name: 'West Village, Manhattan',
        lat: 40.7358,
        lng: -74.0036,
        vibe: 'CULTURAL',
      },
      {
        name: 'Lower East Side, Manhattan',
        lat: 40.715,
        lng: -73.9843,
        vibe: 'SOCIAL',
      },

      // Manhattan Uptown
      {
        name: 'Upper East Side, Manhattan',
        lat: 40.7736,
        lng: -73.9566,
        vibe: 'RELAXED',
      },
      {
        name: 'Upper West Side, Manhattan',
        lat: 40.787,
        lng: -73.9754,
        vibe: 'MORNING',
      },
      {
        name: 'Harlem, Manhattan',
        lat: 40.8116,
        lng: -73.9465,
        vibe: 'CULTURAL',
      },
      {
        name: 'Midtown, Manhattan',
        lat: 40.7549,
        lng: -73.984,
        vibe: 'SOCIAL',
      },

      // Brooklyn
      {
        name: 'Williamsburg, Brooklyn',
        lat: 40.7081,
        lng: -73.9571,
        vibe: 'ARTSY',
      },
      {
        name: 'DUMBO, Brooklyn',
        lat: 40.7033,
        lng: -73.9881,
        vibe: 'DATE_NIGHT',
      },
      {
        name: 'Park Slope, Brooklyn',
        lat: 40.6681,
        lng: -73.9806,
        vibe: 'RELAXED',
      },
      {
        name: 'Brooklyn Heights, Brooklyn',
        lat: 40.696,
        lng: -73.9929,
        vibe: 'CULTURAL',
      },
      {
        name: 'Bushwick, Brooklyn',
        lat: 40.6981,
        lng: -73.9189,
        vibe: 'PARTY',
      },

      // Queens
      { name: 'Astoria, Queens', lat: 40.772, lng: -73.9304, vibe: 'SOCIAL' },
      {
        name: 'Long Island City, Queens',
        lat: 40.7447,
        lng: -73.9485,
        vibe: 'CHILL',
      },
      {
        name: 'Flushing, Queens',
        lat: 40.7674,
        lng: -73.833,
        vibe: 'CULTURAL',
      },

      // Bronx
      { name: 'Riverdale, Bronx', lat: 40.89, lng: -73.9129, vibe: 'RELAXED' },
      {
        name: 'Arthur Avenue, Bronx',
        lat: 40.8543,
        lng: -73.8884,
        vibe: 'CULTURAL',
      },
    ];

    // Rotate regions based on day of week to avoid duplicates
    const dayOfWeek = new Date().getDay();
    const startIndex = (dayOfWeek * 5) % allRegions.length;
    const selectedRegions: typeof allRegions = [];

    // Select 6 regions for today
    for (let i = 0; i < 6; i++) {
      selectedRegions.push(allRegions[(startIndex + i) % allRegions.length]);
    }

    return selectedRegions;
  }

  private async processRegions(regions: any[]) {
    const results = {
      totalCreated: 0,
      totalFailed: 0,
      bySource: {} as Record<string, number>,
    };

    const maxEventsPerRegion = parseInt(
      this.configService.get('MAX_EVENTS_PER_REGION') || '3',
    );

    for (const region of regions) {
      try {
        this.logger.debug(`Processing ${region.name}...`);

        // Quick AI health check before each region
        await this.aiService.analyzeEventVibe({
          regionName: region.name,
          venues: [],
        });

        // Generate mixed events from all sources
        const events = await this.regionIngestion.generateMixedEvents({
          lat: region.lat,
          lng: region.lng,
          radius: 1500, // 1.5km radius
          maxEvents: maxEventsPerRegion,
          regionName: region.name,
          eventSourceMix: {
            external: 65, // External APIs (Yelp, Ticketmaster, etc)
            synthetic: 35, // Google Places generated events
          },
        });

        // Track source statistics
        events.forEach((event: any) => {
          const source = event.source || 'synthetic';
          results.bySource[source] = (results.bySource[source] || 0) + 1;
        });

        results.totalCreated += events.length;
        this.logger.log(`✅ Created ${events.length} events in ${region.name}`);
      } catch (error: any) {
        results.totalFailed++;
        this.logger.error(`Failed to process ${region.name}: ${error.message}`);

        // Stop everything if AI fails
        if (
          error.message?.includes('quota') ||
          error.message?.includes('AI') ||
          error.message?.includes('429')
        ) {
          this.logger.error('AI service failed - stopping all processing');
          throw error;
        }
      }
    }

    return results;
  }

  private async cleanOldEvents(): Promise<void> {
    try {
      const daysToKeep = parseInt(
        this.configService.get('EVENTS_RETENTION_DAYS') || '30',
      );

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      const deleted = await this.prisma.event.deleteMany({
        where: {
          createdAt: { lt: cutoffDate },
          // Only delete events with no members
          members: { none: {} },
          // Don't delete events that haven't happened yet
          startTime: { lt: new Date() },
        },
      });

      if (deleted.count > 0) {
        this.logger.log(`🧹 Cleaned ${deleted.count} old events`);
      }
    } catch (error: any) {
      this.logger.warn(`Failed to clean old events: ${error.message}`);
    }
  }

  private logSummary(results: any): void {
    this.logger.log('═'.repeat(60));
    this.logger.log('📊 DAILY INGESTION SUMMARY');
    this.logger.log('═'.repeat(60));
    this.logger.log(`✅ Total events created: ${results.totalCreated}`);
    this.logger.log(`❌ Total regions failed: ${results.totalFailed}`);

    if (Object.keys(results.bySource).length > 0) {
      this.logger.log('📈 Events by source:');
      Object.entries(results.bySource).forEach(([source, count]) => {
        this.logger.log(`   ${source}: ${count as unknown as number}`);
      });
    }

    this.logger.log(`📅 Next run: Tomorrow at 3:00 AM EST`);
  }

  // Manual trigger for testing
  async triggerManually(maxEventsPerRegion?: number) {
    this.logger.log('🔧 Manually triggering daily ingestion...');

    if (maxEventsPerRegion) {
      process.env.MAX_EVENTS_PER_REGION = maxEventsPerRegion.toString();
    }

    await this.handleDailyIngestion();
  }
}
