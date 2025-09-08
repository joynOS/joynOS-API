import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseExternalAPIService } from './base-external-api.service';
import {
  ExternalEventRaw,
  SearchParams,
} from '../interfaces/external-event.interface';
import { EventSource } from '../enums/event-source.enum';

@Injectable()
export class MeetupGraphQLService extends BaseExternalAPIService {
  readonly name = 'Meetup GraphQL';
  readonly source = EventSource.MEETUP;
  private readonly baseUrl = 'https://api.meetup.com/gql-ext';

  constructor(configService: ConfigService) {
    super(configService);
  }

  protected getApiKey(): string {
    return this.configService.get<string>('MEETUP_ACCESS_TOKEN') || '';
  }

  isEnabled(): boolean {
    return (
      this.configService.get('MEETUP_API_ENABLED') === 'true' &&
      !!this.getApiKey()
    );
  }

  async searchEvents(params: SearchParams): Promise<ExternalEventRaw[]> {
    if (!this.isEnabled()) {
      this.logger.debug('Meetup API disabled');
      return [];
    }

    try {
      const keywords = this.buildSearchKeywords(params);
      const allEvents: any[] = [];

      for (const keyword of keywords) {
        const events = await this.searchEventsByKeyword({
          ...params,
          keyword,
        });
        allEvents.push(...events);
      }

      // Remove duplicates and filter
      const uniqueEvents = this.removeDuplicates(allEvents);
      const filteredEvents = this.filterEvents(uniqueEvents, params);

      return filteredEvents.map((event) => this.meetupEventToExternal(event));
    } catch (error) {
      this.logger.error(`Meetup search failed: ${error.message}`);
      return [];
    }
  }

  private buildSearchKeywords(params: SearchParams): string[] {
    const baseKeywords = [
      'art walk',
      'gallery opening',
      'workshop',
      'wine tasting',
      'cooking class',
      'food',
      'networking',
      'social',
      'creative',
      'photography',
      'design',
      'startup',
      'music',
      'dance',
      'wellness',
      'yoga',
      'book club',
      'learning',
      'skill building',
    ];

    // Add custom keywords from params
    if (params.keywords?.length) {
      return [...params.keywords, ...baseKeywords.slice(0, 5)];
    }

    return baseKeywords;
  }

  private async searchEventsByKeyword(
    params: SearchParams & { keyword: string },
  ): Promise<any[]> {
    const query = `
      query($filter: SearchConnectionFilter!) {
        keywordSearch(filter: $filter) {
          count
          edges {
            node {
              ... on Event {
                id
                title
                description
                dateTime
                endTime
                eventUrl
                venue {
                  name
                  address
                  lat
                  lon
                }
                group {
                  name
                  id
                }
                maxTickets
                going
                waitlistCount
                topics {
                  name
                }
                images {
                  source
                }
                feeRequired
                fees {
                  amount
                  currency
                  label
                }
                rsvpState
                eventType
              }
            }
          }
        }
      }
    `;

    const variables = {
      filter: {
        query: params.keyword,
        lat: params.lat,
        lon: params.lng,
        radius: Math.round(params.radius / 1000), // Convert to km
        source: 'EVENTS',
      },
    };

    try {
      const response = await this.graphqlRequest(query, variables);
      return (
        response.data?.keywordSearch?.edges?.map((edge: any) => edge.node) || []
      );
    } catch (error) {
      this.logger.warn(
        `Meetup keyword search failed for "${params.keyword}": ${error.message}`,
      );
      return [];
    }
  }

  private async graphqlRequest(query: string, variables: any): Promise<any> {
    return this.makeRequest(this.baseUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.getApiKey()}`,
        'Content-Type': 'application/json',
      },
      data: {
        query,
        variables,
      },
    });
  }

  private removeDuplicates(events: any[]): any[] {
    const seen = new Set<string>();
    return events.filter((event) => {
      if (seen.has(event.id)) return false;
      seen.add(event.id);
      return true;
    });
  }

  private filterEvents(events: any[], params: SearchParams): any[] {
    return events.filter((event) => {
      // Filter out past events
      const eventDate = new Date(event.dateTime);
      if (eventDate < new Date()) return false;

      // Filter by date range if specified
      if (params.startDate && eventDate < params.startDate) return false;
      if (params.endDate && eventDate > params.endDate) return false;

      // Filter out events too far in future (more than 90 days)
      const maxDate = new Date();
      maxDate.setDate(maxDate.getDate() + 90);
      if (eventDate > maxDate) return false;

      // Filter by location if we have venue coordinates
      if (event.venue?.lat && event.venue?.lon) {
        const distance = this.calculateDistance(
          params.lat,
          params.lng,
          event.venue.lat,
          event.venue.lon,
        );
        if (distance > params.radius) return false;
      }

      return true;
    });
  }

  private meetupEventToExternal(event: any): ExternalEventRaw {
    return {
      source: this.source,
      sourceId: event.id,
      title: event.title,
      description: this.cleanDescription(event.description),
      startTime: new Date(event.dateTime),
      endTime: event.endTime
        ? new Date(event.endTime)
        : this.estimateEndTime(new Date(event.dateTime)),
      venue: event.venue?.name,
      address: event.venue?.address,
      lat: event.venue?.lat,
      lng: event.venue?.lon,
      externalBookingUrl: event.eventUrl,
      priceDisplay: this.formatMeetupPrice(event),
      priceLevel: this.mapMeetupPriceToLevel(event),
      organizerName: event.group?.name,
      organizerId: event.group?.id,
      capacity: event.maxTickets,
      attendeeCount: event.going || 0,
      requiresRSVP: true,
      categories: event.topics?.map((t: any) => t.name) || [],
      images: event.images?.map((i: any) => i.source) || [],
      tags: this.generateMeetupTags(event),
      sourceUrl: event.eventUrl,
      lastUpdated: new Date(),
    };
  }

  private cleanDescription(description?: string): string {
    if (!description) return '';

    // Remove HTML tags and excessive whitespace
    return description
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim()
      .substring(0, 500); // Limit length
  }

  private estimateEndTime(startTime: Date): Date {
    const endTime = new Date(startTime);
    // Most meetups are 2-3 hours
    endTime.setHours(endTime.getHours() + 2.5);
    return endTime;
  }

  private formatMeetupPrice(event: any): string {
    if (!event.feeRequired || !event.fees?.length) return 'Free';

    const fee = event.fees[0];
    const amount = fee.amount || 0;
    const currency = fee.currency || 'USD';

    return `${currency === 'USD' ? '$' : currency}${amount}`;
  }

  private mapMeetupPriceToLevel(event: any): number {
    if (!event.feeRequired || !event.fees?.length) return 0;

    const amount = event.fees[0]?.amount || 0;
    if (amount === 0) return 0;
    if (amount <= 20) return 1;
    if (amount <= 50) return 2;
    if (amount <= 100) return 3;
    return 4;
  }

  private generateMeetupTags(event: any): string[] {
    const tags = ['meetup', 'community', 'social'];

    if (!event.feeRequired) tags.push('free');
    if (event.going > 50) tags.push('popular');
    if (event.maxTickets && event.going >= event.maxTickets * 0.8)
      tags.push('filling-up');

    // Add topic-based tags
    const topics = event.topics?.map((t: any) => t.name.toLowerCase()) || [];
    if (topics.some((t: string) => t.includes('art') || t.includes('creative')))
      tags.push('art', 'creative');
    if (topics.some((t: string) => t.includes('tech') || t.includes('startup')))
      tags.push('tech', 'professional');
    if (topics.some((t: string) => t.includes('food') || t.includes('wine')))
      tags.push('food-drink');
    if (
      topics.some(
        (t: string) => t.includes('fitness') || t.includes('wellness'),
      )
    )
      tags.push('wellness');

    return tags;
  }
}
