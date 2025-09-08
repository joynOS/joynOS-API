import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseExternalAPIService } from './base-external-api.service';
import {
  ExternalEventRaw,
  SearchParams,
} from '../interfaces/external-event.interface';
import { EventSource } from '../enums/event-source.enum';

@Injectable()
export class SeatGeekService extends BaseExternalAPIService {
  readonly name = 'SeatGeek';
  readonly source = EventSource.SEATGEEK;
  private readonly baseUrl = 'https://api.seatgeek.com/2';

  constructor(configService: ConfigService) {
    super(configService);
  }

  protected getApiKey(): string {
    return this.configService.get<string>('SEATGEEK_CLIENT_ID') || '';
  }

  isEnabled(): boolean {
    return (
      this.configService.get('SEATGEEK_API_ENABLED') === 'true' &&
      !!this.getApiKey()
    );
  }

  async searchEvents(params: SearchParams): Promise<ExternalEventRaw[]> {
    if (!this.isEnabled()) {
      this.logger.debug('SeatGeek API disabled');
      return [];
    }

    try {
      const events = await this.makeRequest(`${this.baseUrl}/events`, {
        method: 'GET',
        params: {
          geoip: `${params.lat},${params.lng}`,
          range: `${Math.round(params.radius / 1609)}mi`, // Convert to miles
          'datetime_utc.gte': params.startDate?.toISOString(),
          'datetime_utc.lte': params.endDate?.toISOString(),
          'taxonomies.name': 'theater,comedy,classical,jazz', // Focus on intimate events
          per_page: params.limit || 50,
          client_id: this.getApiKey(),
        },
      });

      return ((events as any).events || []).map((event: any) =>
        this.seatgeekEventToExternal(event),
      );
    } catch (error) {
      this.logger.error(`SeatGeek search failed: ${error.message}`);
      return [];
    }
  }

  private seatgeekEventToExternal(event: any): ExternalEventRaw {
    return {
      source: this.source,
      sourceId: event.id.toString(),
      title: event.short_title || event.title,
      description: `${event.performers?.map((p: any) => p.name).join(', ')} at ${event.venue.name}`,
      startTime: new Date(event.datetime_utc),
      venue: event.venue.name,
      address: `${event.venue.address}, ${event.venue.extended_address}`,
      lat: event.venue.location?.lat,
      lng: event.venue.location?.lon,
      externalBookingUrl: event.url,
      priceDisplay: this.formatSeatgeekPrice(event.stats),
      priceLevel: this.mapSeatgeekPriceToLevel(event.stats),
      categories: event.taxonomies?.map((t: any) => t.name) || [],
      images: [event.performers?.[0]?.image, event.venue.image].filter(Boolean),
      tags: this.generateSeatgeekTags(event),
      sourceUrl: event.url,
      lastUpdated: new Date(),
    };
  }

  private formatSeatgeekPrice(stats: any): string {
    if (!stats?.lowest_price || !stats?.highest_price) return 'Price varies';

    const low = stats.lowest_price;
    const high = stats.highest_price;

    if (low === high) return `$${low}`;
    return `$${low}-${high}`;
  }

  private mapSeatgeekPriceToLevel(stats: any): number {
    if (!stats?.average_price) return 0;

    const avg = stats.average_price;
    if (avg <= 25) return 1;
    if (avg <= 75) return 2;
    if (avg <= 150) return 3;
    return 4;
  }

  private generateSeatgeekTags(event: any): string[] {
    const tags = ['tickets', 'entertainment'];

    if (event.stats?.average_price <= 50) tags.push('affordable');
    if (event.venue?.capacity && event.venue.capacity < 500)
      tags.push('intimate');

    // Add taxonomy-based tags
    const taxonomies =
      event.taxonomies?.map((t: any) => t.name.toLowerCase()) || [];
    if (taxonomies.includes('theater')) tags.push('theater', 'culture');
    if (taxonomies.includes('comedy')) tags.push('comedy', 'entertainment');
    if (taxonomies.includes('classical')) tags.push('classical', 'music');

    return tags;
  }
}
