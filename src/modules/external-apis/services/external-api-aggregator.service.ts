import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { YelpFusionService } from './yelp-fusion.service';
import { MeetupGraphQLService } from './meetup-graphql.service';
import { SeatGeekService } from './seatgeek.service';
import { NYCParksService } from './nyc-parks.service';
import { TicketmasterDiscoveryService } from './ticketmaster-discovery.service';
import {
  ExternalEventRaw,
  SearchParams,
  ConvertedEvent,
  ExternalAPIProvider,
} from '../interfaces/external-event.interface';
import { EventSource, EXTERNAL_SOURCES } from '../enums/event-source.enum';
import { AIService } from '../../ai/ai.service';

@Injectable()
export class ExternalAPIAggregatorService {
  private readonly logger = new Logger(ExternalAPIAggregatorService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly yelpService: YelpFusionService,
    private readonly meetupService: MeetupGraphQLService,
    private readonly seatgeekService: SeatGeekService,
    private readonly nycParksService: NYCParksService,
    private readonly ticketmasterService: TicketmasterDiscoveryService,
    private readonly aiService: AIService,
  ) {}

  async discoverEvents(params: SearchParams): Promise<ExternalEventRaw[]> {
    if (!this.isExternalAPIsEnabled()) {
      this.logger.debug('External APIs disabled');
      return [];
    }

    const enabledProviders = this.getEnabledProviders();
    this.logger.debug(
      `Searching with ${enabledProviders.length} enabled providers`,
    );

    // Search all providers in parallel
    const searchPromises = enabledProviders.map(async (provider) => {
      try {
        const results = await provider.searchEvents(params);
        this.logger.debug(`${provider.name}: found ${results.length} events`);
        return results;
      } catch (error) {
        this.logger.error(`${provider.name} search failed: ${error.message}`);
        return [];
      }
    });

    const results = await Promise.all(searchPromises);
    const allEvents = results.flat();

    // Process and deduplicate
    const deduplicatedEvents = this.deduplicateEvents(allEvents);
    const rankedEvents = this.rankEventsByQuality(deduplicatedEvents);
    const limitedEvents = this.limitResults(rankedEvents, params.limit);

    this.logger.debug(`Final results: ${limitedEvents.length} unique events`);
    return limitedEvents;
  }

  async convertToInternalFormat(
    externalEvents: ExternalEventRaw[],
  ): Promise<ConvertedEvent[]> {
    const convertedEvents = await Promise.all(
      externalEvents.map(async (extEvent) => {
        try {
          const converted = await this.convertSingleEvent(extEvent);
          return converted;
        } catch (error) {
          this.logger.error(
            `Failed to convert event ${extEvent.sourceId}: ${error.message}`,
          );
          return null;
        }
      }),
    );

    return convertedEvents.filter(
      (event): event is ConvertedEvent => event !== null,
    );
  }

  private async convertSingleEvent(
    extEvent: ExternalEventRaw,
  ): Promise<ConvertedEvent> {
    // AI enhancement for region and vibe
    const aiAnalysis = await this.enhanceEventWithAI(extEvent);

    return {
      title: extEvent.title,
      description: extEvent.description,
      source: extEvent.source,
      sourceId: extEvent.sourceId,
      externalBookingUrl: extEvent.externalBookingUrl,
      startTime: extEvent.startTime,
      endTime: extEvent.endTime,
      venue: extEvent.venue,
      address: extEvent.address,
      lat: extEvent.lat?.toString(),
      lng: extEvent.lng?.toString(),
      rating: extEvent.rating,
      priceLevel: extEvent.priceLevel,
      tags: extEvent.tags || [],

      // New external event fields
      organizerName: extEvent.organizerName,
      attendeeCount: extEvent.attendeeCount || 0,
      capacity: extEvent.capacity,
      priceDisplay: extEvent.priceDisplay,
      requiresRSVP: extEvent.requiresRSVP,
      categories: extEvent.categories,
      syncStatus: 'active' as const,
      lastSyncAt: new Date(),

      // AI-enhanced fields
      vibeKey: aiAnalysis.vibeKey,
      regionName: aiAnalysis.regionName,
      regionProvider: aiAnalysis.regionProvider,
      regionPlaceId: aiAnalysis.regionPlaceId,
      gallery: this.processEventImages(extEvent.images),
    };
  }

  private async enhanceEventWithAI(extEvent: ExternalEventRaw): Promise<{
    vibeKey?: string;
    regionName?: string;
    regionProvider?: string;
    regionPlaceId?: string;
  }> {
    try {
      const context = {
        title: extEvent.title,
        description: extEvent.description,
        venue: extEvent.venue,
        address: extEvent.address,
        categories: extEvent.categories,
        source: extEvent.source,
        organizerName: extEvent.organizerName,
      };

      const analysis = await this.aiService.analyzeExternalEvent(context);

      return {
        vibeKey: analysis.vibeKey,
        regionName:
          analysis.regionName ||
          this.extractRegionFromAddress(extEvent.address),
        regionProvider: 'external-api',
        regionPlaceId: `${extEvent.source}:${extEvent.sourceId}`,
      };
    } catch (error) {
      this.logger.warn(
        `AI analysis failed for event ${extEvent.sourceId}: ${error.message}`,
      );

      // Fallback logic
      return {
        vibeKey: this.inferVibeFromCategories(extEvent.categories),
        regionName: this.extractRegionFromAddress(extEvent.address),
        regionProvider: 'external-api',
        regionPlaceId: `${extEvent.source}:${extEvent.sourceId}`,
      };
    }
  }

  private processEventImages(images?: string[]): string[] {
    if (!images?.length) return [];

    // Filter valid image URLs and limit to 5
    return images
      .filter(
        (img) => img && (img.startsWith('http') || img.startsWith('https')),
      )
      .slice(0, 5);
  }

  private extractRegionFromAddress(address?: string): string {
    if (!address) return 'Unknown';

    // Simple extraction of neighborhood/city from address
    const parts = address.split(',').map((p) => p.trim());
    if (parts.length >= 2) {
      return parts[parts.length - 2]; // Usually city/neighborhood
    }
    return parts[0] || 'Unknown';
  }

  private inferVibeFromCategories(categories?: string[]): string {
    if (!categories?.length) return 'SOCIAL';

    const categoryText = categories.join(' ').toLowerCase();

    if (
      categoryText.includes('art') ||
      categoryText.includes('gallery') ||
      categoryText.includes('creative')
    )
      return 'ARTSY';
    if (
      categoryText.includes('wine') ||
      categoryText.includes('tasting') ||
      categoryText.includes('dinner')
    )
      return 'DATE_NIGHT';
    if (
      categoryText.includes('party') ||
      categoryText.includes('dance') ||
      categoryText.includes('nightlife')
    )
      return 'PARTY';
    if (
      categoryText.includes('yoga') ||
      categoryText.includes('wellness') ||
      categoryText.includes('spa')
    )
      return 'RELAXED';
    if (
      categoryText.includes('morning') ||
      categoryText.includes('breakfast') ||
      categoryText.includes('coffee')
    )
      return 'MORNING';
    if (
      categoryText.includes('museum') ||
      categoryText.includes('theater') ||
      categoryText.includes('cultural')
    )
      return 'CULTURAL';
    if (
      categoryText.includes('networking') ||
      categoryText.includes('meetup') ||
      categoryText.includes('community')
    )
      return 'SOCIAL';

    return 'SOCIAL';
  }

  private isExternalAPIsEnabled(): boolean {
    return this.configService.get('EXTERNAL_APIS_ENABLED') === 'true';
  }

  private getEnabledProviders(): ExternalAPIProvider[] {
    const providers: ExternalAPIProvider[] = [];

    if (this.yelpService.isEnabled()) providers.push(this.yelpService);
    if (this.meetupService.isEnabled()) providers.push(this.meetupService);
    if (this.seatgeekService.isEnabled()) providers.push(this.seatgeekService);
    if (this.nycParksService.isEnabled()) providers.push(this.nycParksService);
    if (this.ticketmasterService.isEnabled())
      providers.push(this.ticketmasterService);

    return providers;
  }

  private deduplicateEvents(events: ExternalEventRaw[]): ExternalEventRaw[] {
    const uniqueEvents = new Map<string, ExternalEventRaw>();

    events.forEach((event) => {
      const key = this.generateEventKey(event);
      const existing = uniqueEvents.get(key);

      if (!existing || this.hasHigherPriority(event, existing)) {
        uniqueEvents.set(key, event);
      }
    });

    return Array.from(uniqueEvents.values());
  }

  private generateEventKey(event: ExternalEventRaw): string {
    // Create a key based on title, venue, and time (normalized)
    const titleKey = event.title.toLowerCase().replace(/[^a-z0-9]/g, '');
    const venueKey = event.venue?.toLowerCase().replace(/[^a-z0-9]/g, '') || '';
    const timeKey = event.startTime.toISOString().split('T')[0]; // Just the date

    return `${titleKey}:${venueKey}:${timeKey}`;
  }

  private hasHigherPriority(
    event1: ExternalEventRaw,
    event2: ExternalEventRaw,
  ): boolean {
    const sourcePriority = {
      [EventSource.MEETUP]: 3, // Highest priority (real scheduled events)
      [EventSource.YELP]: 2, // Medium priority (bookable activities)
      [EventSource.SEATGEEK]: 1,
      [EventSource.NYC_PARKS]: 1,
    };

    return sourcePriority[event1.source] > sourcePriority[event2.source];
  }

  private rankEventsByQuality(events: ExternalEventRaw[]): ExternalEventRaw[] {
    return events.sort((a, b) => {
      // Primary sort: source priority
      if (a.source !== b.source) {
        return this.hasHigherPriority(a, b) ? -1 : 1;
      }

      // Secondary sort: rating/quality
      const aRating = a.rating || 0;
      const bRating = b.rating || 0;
      if (aRating !== bRating) {
        return bRating - aRating;
      }

      // Tertiary sort: attendee count/popularity
      const aAttendees = a.attendeeCount || 0;
      const bAttendees = b.attendeeCount || 0;
      return bAttendees - aAttendees;
    });
  }

  private limitResults(
    events: ExternalEventRaw[],
    limit?: number,
  ): ExternalEventRaw[] {
    const defaultLimit = 20;
    const maxLimit = 50;
    const effectiveLimit = Math.min(limit || defaultLimit, maxLimit);

    return events.slice(0, effectiveLimit);
  }
}
