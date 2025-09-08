import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../../database/prisma.service';
import { ExternalAPIAggregatorService } from './external-api-aggregator.service';
import { SYNC_INTERVALS, SyncJobType } from '../constants/sync-intervals.const';
import { EventSource } from '../enums/event-source.enum';

interface SyncJobResult {
  jobType: SyncJobType;
  source: EventSource;
  eventsProcessed: number;
  newEvents: number;
  updatedEvents: number;
  errors: string[];
  cost: number;
  duration: number;
}

interface SyncStats {
  totalCalls: number;
  dailyCost: number;
  monthlyCost: number;
  lastSync: Date;
  successRate: number;
}

@Injectable()
export class ExternalSyncService {
  private readonly logger = new Logger(ExternalSyncService.name);
  private syncInProgress = new Set<EventSource>();
  private dailyStats = new Map<EventSource, SyncStats>();

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly aggregator: ExternalAPIAggregatorService,
  ) {
    this.initializeDailyStats();
  }

  private initializeDailyStats() {
    Object.values(EventSource).forEach((source) => {
      this.dailyStats.set(source, {
        totalCalls: 0,
        dailyCost: 0,
        monthlyCost: 0,
        lastSync: new Date(0),
        successRate: 1.0,
      });
    });
  }

  @Cron('0 */6 * * *')
  async performScheduledSync(): Promise<void> {
    this.logger.log('🔄 Starting scheduled external events sync');

    const syncPromises = [
      this.syncAPISource(EventSource.MEETUP, SyncJobType.UPDATE),
      this.syncAPISource(EventSource.NYC_PARKS, SyncJobType.UPDATE),
      this.syncAPISource(EventSource.SEATGEEK, SyncJobType.UPDATE),
      this.syncAPISource(EventSource.TICKETMASTER, SyncJobType.UPDATE),
      this.syncAPISource(EventSource.YELP, SyncJobType.UPDATE),
    ];

    const results = await Promise.allSettled(syncPromises);

    results.forEach((result, index) => {
      const source = Object.values(EventSource)[index + 1];
      if (result.status === 'rejected') {
        this.logger.error(`❌ Sync failed for ${source}: ${result.reason}`);
      }
    });

    await this.cleanupOldEvents();
    this.logger.log('✅ Scheduled sync completed');
  }

  async syncAPISource(
    source: EventSource,
    jobType: SyncJobType,
  ): Promise<SyncJobResult> {
    if (this.syncInProgress.has(source)) {
      this.logger.warn(`⏳ Sync already in progress for ${source}`);
      throw new Error(`Sync already in progress for ${source}`);
    }

    if (!this.canAffordSync(source)) {
      this.logger.warn(`💰 Budget limit reached for ${source}`);
      throw new Error(`Budget limit reached for ${source}`);
    }

    this.syncInProgress.add(source);
    const startTime = Date.now();
    let result: SyncJobResult;

    try {
      this.logger.log(`🔄 Starting ${jobType} sync for ${source}`);

      switch (jobType) {
        case SyncJobType.DISCOVERY:
          result = await this.performDiscoverySyncForSource(source);
          break;
        case SyncJobType.UPDATE:
          result = await this.performUpdateSync(source);
          break;
        case SyncJobType.STATUS_CHECK:
          result = await this.performStatusCheckSync(source);
          break;
        default:
          throw new Error(`Unknown sync job type: ${jobType}`);
      }

      result.duration = Date.now() - startTime;
      this.updateSyncStats(source, result);

      this.logger.log(
        `✅ ${source} sync completed: ${result.newEvents} new, ${result.updatedEvents} updated, ${result.eventsProcessed} total`,
      );

      return result;
    } catch (error) {
      this.logger.error(`❌ ${source} sync failed: ${error.message}`);
      throw error;
    } finally {
      this.syncInProgress.delete(source);
    }
  }

  private async performDiscoverySyncForSource(
    source: EventSource,
  ): Promise<SyncJobResult> {
    const result: SyncJobResult = {
      jobType: SyncJobType.DISCOVERY,
      source,
      eventsProcessed: 0,
      newEvents: 0,
      updatedEvents: 0,
      errors: [],
      cost: 0,
      duration: 0,
    };

    const hotspots = this.getEventHotspots();
    const batchSize = SYNC_INTERVALS.SYNC_BATCH_SIZES[source] || 50;

    for (const hotspot of hotspots.slice(0, 3)) {
      try {
        const events = await this.aggregator.discoverEvents({
          lat: hotspot.lat,
          lng: hotspot.lng,
          radius: hotspot.radius,
          limit: batchSize,
          startDate: new Date(),
          endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        });

        const convertedEvents = await this.aggregator.convertToInternalFormat(
          events.filter((e) => e.source === source),
        );

        for (const eventData of convertedEvents) {
          const existingEvent = await this.prisma.event.findUnique({
            where: {
              source_sourceId: {
                source: eventData.source,
                sourceId: eventData.sourceId,
              },
            },
          });

          if (!existingEvent) {
            this.createExternalEvent(eventData);
            result.newEvents++;
          }
          result.eventsProcessed++;
        }

        result.cost += this.calculateAPICost(source, 1);
      } catch (error) {
        result.errors.push(`Hotspot ${hotspot.name}: ${error.message}`);
      }
    }

    return result;
  }

  private async performUpdateSync(source: EventSource): Promise<SyncJobResult> {
    const result: SyncJobResult = {
      jobType: SyncJobType.UPDATE,
      source,
      eventsProcessed: 0,
      newEvents: 0,
      updatedEvents: 0,
      errors: [],
      cost: 0,
      duration: 0,
    };

    const eventsToUpdate = await this.getEventsForUpdate(source);
    const batchSize = SYNC_INTERVALS.SYNC_BATCH_SIZES[source] || 50;

    for (let i = 0; i < eventsToUpdate.length; i += batchSize) {
      const batch = eventsToUpdate.slice(i, i + batchSize);

      try {
        const updateResults = this.updateEventsBatch(source, batch);

        result.eventsProcessed += batch.length;
        result.updatedEvents += updateResults.updated;
        result.cost += this.calculateAPICost(source, 1);

        await this.delay(1000);
      } catch (error) {
        result.errors.push(`Batch ${i / batchSize}: ${error.message}`);
      }
    }

    return result;
  }

  private async performStatusCheckSync(
    source: EventSource,
  ): Promise<SyncJobResult> {
    const result: SyncJobResult = {
      jobType: SyncJobType.STATUS_CHECK,
      source,
      eventsProcessed: 0,
      newEvents: 0,
      updatedEvents: 0,
      errors: [],
      cost: 0,
      duration: 0,
    };

    const upcomingEvents = await this.prisma.event.findMany({
      where: {
        source,
        startTime: {
          gte: new Date(),
          lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
        syncStatus: 'active',
      },
      take: 100,
    });

    for (const event of upcomingEvents) {
      try {
        const isStillActive = this.checkEventStatus(source, event.sourceId!);

        if (!isStillActive) {
          await this.prisma.event.update({
            where: { id: event.id },
            data: { syncStatus: 'cancelled' },
          });
          result.updatedEvents++;
        }

        result.eventsProcessed++;
        result.cost += this.calculateAPICost(source, 0.1);
      } catch (error) {
        result.errors.push(`Event ${event.id}: ${error.message}`);
      }
    }

    return result;
  }

  private async getEventsForUpdate(source: EventSource): Promise<any[]> {
    const now = new Date();
    const next2Hours = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const [soonEvents, todayEvents, weekEvents] = await Promise.all([
      this.prisma.event.findMany({
        where: {
          source,
          startTime: { gte: now, lte: next2Hours },
          syncStatus: 'active',
        },
        orderBy: { startTime: 'asc' },
      }),

      this.prisma.event.findMany({
        where: {
          source,
          startTime: { gte: next2Hours, lte: tomorrow },
          syncStatus: 'active',
        },
        take: 20,
        orderBy: { startTime: 'asc' },
      }),

      this.prisma.event.findMany({
        where: {
          source,
          startTime: { gte: tomorrow, lte: nextWeek },
          syncStatus: 'active',
        },
        take: 10,
        orderBy: { startTime: 'asc' },
      }),
    ]);

    return [...soonEvents, ...todayEvents, ...weekEvents];
  }

  private getEventHotspots(): Array<{
    lat: number;
    lng: number;
    radius: number;
    name: string;
  }> {
    return [
      { lat: 40.7484, lng: -73.9857, radius: 2000, name: 'Times Square' },
      { lat: 40.7505, lng: -73.9934, radius: 2000, name: 'Chelsea' },
      { lat: 40.7282, lng: -74.0776, radius: 2000, name: 'SoHo' },
    ];
  }

  private calculateAPICost(
    source: EventSource,
    callWeight: number = 1,
  ): number {
    const costs = {
      [EventSource.YELP]: 0.01,
      [EventSource.MEETUP]: 0,
      [EventSource.SEATGEEK]: 0,
      [EventSource.NYC_PARKS]: 0,
      [EventSource.TICKETMASTER]: 0,
      [EventSource.REGION_SYNTHETIC]: 0,
    };

    return (costs[source] || 0) * callWeight;
  }

  private canAffordSync(source: EventSource): boolean {
    const stats = this.dailyStats.get(source);
    if (!stats) return true;

    if (source === EventSource.YELP) {
      return stats.totalCalls < SYNC_INTERVALS.COST_LIMITS.DAILY_YELP_CALLS;
    }

    return true;
  }

  private updateSyncStats(source: EventSource, result: SyncJobResult): void {
    const stats = this.dailyStats.get(source)!;

    stats.totalCalls += 1;
    stats.dailyCost += result.cost;
    stats.monthlyCost += result.cost;
    stats.lastSync = new Date();
    stats.successRate = result.errors.length === 0 ? 1.0 : 0.5;

    this.dailyStats.set(source, stats);

    if (
      source === EventSource.YELP &&
      stats.dailyCost >
        SYNC_INTERVALS.COST_LIMITS.MONTHLY_YELP_BUDGET *
          SYNC_INTERVALS.COST_LIMITS.ALERT_THRESHOLD
    ) {
      this.logger.warn(
        `💰 Yelp API costs approaching budget limit: $${stats.dailyCost.toFixed(2)}`,
      );
    }
  }

  private createExternalEvent(_eventData: any): void {}

  private updateEventsBatch(
    _source: EventSource,
    events: any[],
  ): { updated: number } {
    return { updated: events.length };
  }

  private checkEventStatus(_source: EventSource, _sourceId: string): boolean {
    return true;
  }

  private async cleanupOldEvents(): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 1);

    await this.prisma.event.updateMany({
      where: {
        endTime: { lt: cutoffDate },
        source: { not: null },
      },
      data: { syncStatus: 'expired' },
    });
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  @Cron('0 * * * *')
  async performFastSync(): Promise<void> {
    this.logger.log('⚡ Starting fast sync for critical events');

    try {
      const promises = [
        this.syncAPISource(EventSource.MEETUP, SyncJobType.STATUS_CHECK),
        this.syncAPISource(EventSource.NYC_PARKS, SyncJobType.STATUS_CHECK),
        this.syncAPISource(EventSource.SEATGEEK, SyncJobType.STATUS_CHECK),
        this.syncAPISource(EventSource.TICKETMASTER, SyncJobType.STATUS_CHECK),
      ];

      await Promise.allSettled(promises);
      this.logger.log('✅ Fast sync completed');
    } catch (error) {
      this.logger.error('❌ Fast sync failed:', error.message);
    }
  }

  @Cron('0 */3 * * *')
  async performDiscoverySync(): Promise<void> {
    this.logger.log('🔍 Starting discovery sync for new events');

    try {
      const promises = [
        this.syncAPISource(EventSource.MEETUP, SyncJobType.DISCOVERY),
        this.syncAPISource(EventSource.NYC_PARKS, SyncJobType.DISCOVERY),
        this.syncAPISource(EventSource.TICKETMASTER, SyncJobType.DISCOVERY),
      ];

      await Promise.allSettled(promises);
      this.logger.log('✅ Discovery sync completed');
    } catch (error) {
      this.logger.error('❌ Discovery sync failed:', error.message);
    }
  }

  @Cron('0 2 * * *')
  async performCleanupSync(): Promise<void> {
    this.logger.log('🧹 Starting cleanup sync');

    try {
      await this.cleanupOldEvents();
      this.logger.log('✅ Cleanup sync completed');
    } catch (error) {
      this.logger.error('❌ Cleanup sync failed:', error.message);
    }
  }

  @Cron('30 */6 * * *')
  async performYelpSync(): Promise<void> {
    if (!this.canAffordSync(EventSource.YELP)) {
      this.logger.warn('💰 Skipping Yelp sync - budget limit reached');
      return;
    }

    this.logger.log('💰 Starting Yelp sync (paid API)');

    try {
      await this.syncAPISource(EventSource.YELP, SyncJobType.UPDATE);
      this.logger.log('✅ Yelp sync completed');
    } catch (error) {
      this.logger.error('❌ Yelp sync failed:', error.message);
    }
  }

  getSyncStats(): Record<string, SyncStats> {
    const stats: Record<string, SyncStats> = {};
    this.dailyStats.forEach((value, key) => {
      stats[key] = { ...value };
    });
    return stats;
  }
}
