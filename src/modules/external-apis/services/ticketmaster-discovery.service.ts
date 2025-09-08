import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosResponse } from 'axios';
import { BaseExternalAPIService } from './base-external-api.service';
import {
  ExternalEventRaw,
  SearchParams,
} from '../interfaces/external-event.interface';
import { EventSource } from '../enums/event-source.enum';

interface TicketmasterEvent {
  id: string;
  name: string;
  url: string;
  dates: {
    start: {
      localDate: string;
      localTime?: string;
      dateTime?: string;
    };
    end?: {
      localDate: string;
      localTime?: string;
      dateTime?: string;
    };
    status: {
      code: string;
    };
  };
  _embedded?: {
    venues?: Array<{
      name: string;
      address?: {
        line1?: string;
        line2?: string;
      };
      city?: {
        name: string;
      };
      state?: {
        name: string;
        stateCode: string;
      };
      location?: {
        latitude: string;
        longitude: string;
      };
    }>;
  };
  priceRanges?: Array<{
    type: string;
    currency: string;
    min: number;
    max: number;
  }>;
  classifications?: Array<{
    primary: boolean;
    segment: {
      id: string;
      name: string;
    };
    genre: {
      id: string;
      name: string;
    };
    subGenre?: {
      id: string;
      name: string;
    };
  }>;
  promoter?: {
    name: string;
  };
  pleaseNote?: string;
  info?: string;
  images?: Array<{
    ratio: string;
    url: string;
    width: number;
    height: number;
    fallback: boolean;
  }>;
}

interface TicketmasterResponse {
  _embedded?: {
    events: TicketmasterEvent[];
  };
  page: {
    size: number;
    totalElements: number;
    totalPages: number;
    number: number;
  };
}

@Injectable()
export class TicketmasterDiscoveryService extends BaseExternalAPIService {
  protected readonly logger = new Logger(TicketmasterDiscoveryService.name);
  private readonly baseUrl = 'https://app.ticketmaster.com/discovery/v2';
  private readonly rateLimit = { requestsPerSecond: 5, dailyLimit: 5000 };
  readonly name = 'Ticketmaster';
  readonly source = EventSource.TICKETMASTER;

  constructor(protected readonly configService: ConfigService) {
    super(configService);
  }

  protected getApiKey(): string {
    const apiKey = this.configService.get<string>('TICKETMASTER_API_KEY');
    if (!apiKey) {
      throw new Error('TICKETMASTER_API_KEY is not configured');
    }
    return apiKey;
  }

  async searchEvents(params: SearchParams): Promise<ExternalEventRaw[]> {
    if (!this.isEnabled()) {
      this.logger.warn('Ticketmaster API is disabled (no API key)');
      return [];
    }

    try {
      await this.respectRateLimit();

      const ticketmasterParams = this.buildSearchParams(params);
      const response: AxiosResponse<TicketmasterResponse> = await axios.get(
        `${this.baseUrl}/events.json`,
        { params: ticketmasterParams, timeout: 10000 },
      );

      const events = response.data._embedded?.events || [];
      this.logger.log(`Found ${events.length} Ticketmaster events`);

      return events
        .filter((event) => this.isValidEvent(event))
        .map((event) => this.convertToExternalEvent(event));
    } catch (error: any) {
      this.logger.error(
        'Ticketmaster API error:',
        error.response?.data || error.message,
      );
      return [];
    }
  }

  private buildSearchParams(params: SearchParams): Record<string, any> {
    const searchParams: Record<string, any> = {
      apikey: this.getApiKey(),
      countryCode: 'US',
      city: 'New York',
      size: Math.min(params.limit || 50, 200),
      sort: 'date,asc',
    };

    if (params.startDate) {
      searchParams.startDateTime = params.startDate.toISOString();
    }

    if (params.endDate) {
      searchParams.endDateTime = params.endDate.toISOString();
    }

    if (params.lat && params.lng) {
      searchParams.latlong = `${params.lat},${params.lng}`;
      if (params.radius) {
        searchParams.radius = Math.round(params.radius / 1000);
        searchParams.unit = 'km';
      }
    }

    return searchParams;
  }

  private isValidEvent(event: TicketmasterEvent): boolean {
    return Boolean(
      event.id &&
        event.name &&
        event.url &&
        event.dates?.start?.localDate &&
        event.dates.status.code === 'onsale' &&
        event._embedded?.venues?.[0],
    );
  }

  private convertToExternalEvent(event: TicketmasterEvent): ExternalEventRaw {
    const venue = event._embedded?.venues?.[0];
    const primaryClassification = event.classifications?.find((c) => c.primary);
    const priceRange = event.priceRanges?.[0];
    const bestImage = this.getBestImage(event.images);

    const startDateTime = this.parseEventDateTime(event.dates.start);
    const endDateTime = event.dates.end
      ? this.parseEventDateTime(event.dates.end)
      : null;

    const location = venue?.location
      ? {
          lat: parseFloat(venue.location.latitude),
          lng: parseFloat(venue.location.longitude),
        }
      : null;

    const address = this.buildAddress(venue);

    return {
      source: EventSource.TICKETMASTER,
      sourceId: event.id,
      title: event.name,
      description: this.buildDescription(event),
      startTime: startDateTime,
      endTime: endDateTime || undefined,
      lat: location?.lat,
      lng: location?.lng,
      address: address,
      venue: venue?.name || 'TBD',
      organizerName: event.promoter?.name || 'Ticketmaster',
      externalBookingUrl: event.url,
      images: bestImage ? [bestImage] : undefined,
      categories: this.extractCategories(event),
      priceDisplay: this.buildPriceDisplay(priceRange) || undefined,
      attendeeCount: undefined,
      capacity: undefined,
      requiresRSVP: true,
    };
  }

  private parseEventDateTime(dateInfo: any): Date {
    if (dateInfo.dateTime) {
      return new Date(dateInfo.dateTime);
    }

    const dateStr = dateInfo.localTime
      ? `${dateInfo.localDate}T${dateInfo.localTime}`
      : `${dateInfo.localDate}T19:00:00`;

    return new Date(dateStr);
  }

  private buildAddress(venue: any): string {
    if (!venue) return 'New York, NY';

    const parts: string[] = [];
    if (venue.address?.line1) parts.push(venue.address.line1);
    if (venue.city?.name) parts.push(venue.city.name);
    if (venue.state?.stateCode) parts.push(venue.state.stateCode);

    return parts.length > 0 ? parts.join(', ') : 'New York, NY';
  }

  private buildDescription(event: TicketmasterEvent): string {
    const parts: string[] = [];

    if (event.info) {
      parts.push(event.info);
    }

    if (event.pleaseNote) {
      parts.push(`Note: ${event.pleaseNote}`);
    }

    const classification = event.classifications?.find((c) => c.primary);
    if (classification) {
      const genre = classification.genre?.name;
      const segment = classification.segment?.name;
      if (genre && segment) {
        parts.push(`Genre: ${genre} (${segment})`);
      }
    }

    return (
      parts.join('\n\n') || `${event.name} - Don't miss this exciting event!`
    );
  }

  private extractCategories(event: TicketmasterEvent): string[] {
    const categories: string[] = [];

    const classification = event.classifications?.find((c) => c.primary);
    if (classification) {
      if (classification.segment?.name)
        categories.push(classification.segment.name.toLowerCase());
      if (classification.genre?.name)
        categories.push(classification.genre.name.toLowerCase());
      if (classification.subGenre?.name)
        categories.push(classification.subGenre.name.toLowerCase());
    }

    return categories.length > 0 ? categories : ['entertainment'];
  }

  private buildPriceDisplay(priceRange: any): string | null {
    if (!priceRange) return 'Price TBA';

    const { min, max, currency } = priceRange;
    const symbol = currency === 'USD' ? '$' : currency;

    if (min === max) {
      return `${symbol}${min}`;
    } else {
      return `${symbol}${min} - ${symbol}${max}`;
    }
  }

  private getBestImage(images?: any[]): string | null {
    if (!images?.length) return null;

    const preferred = images.find(
      (img) => img.ratio === '16_9' && img.width >= 640,
    );

    if (preferred) return preferred.url;

    const fallback = images.find((img) => img.width >= 300);
    return fallback?.url || images[0]?.url || null;
  }

  isEnabled(): boolean {
    try {
      this.getApiKey();
      return true;
    } catch {
      return false;
    }
  }

  private async respectRateLimit(): Promise<void> {
    await this.delay(200);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
