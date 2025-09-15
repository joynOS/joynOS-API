import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseExternalAPIService } from './base-external-api.service';
import {
  ExternalEventRaw,
  SearchParams,
} from '../interfaces/external-event.interface';
import { EventSource } from '../enums/event-source.enum';

@Injectable()
export class NYCParksService extends BaseExternalAPIService {
  readonly name = 'NYC Parks';
  readonly source = EventSource.NYC_PARKS;
  private readonly baseUrl = 'https://data.cityofnewyork.us/resource';

  constructor(configService: ConfigService) {
    super(configService);
  }

  protected getApiKey(): string {
    return ''; // NYC Open Data is free
  }

  isEnabled(): boolean {
    return this.configService.get('NYC_PARKS_API_ENABLED') === 'true';
  }

  async searchEvents(params: SearchParams): Promise<ExternalEventRaw[]> {
    if (!this.isEnabled()) {
      this.logger.debug('NYC Parks API disabled');
      return [];
    }

    try {
      // NYC Parks Events dataset
      const queryParams: Record<string, any> = {
        $where: `within_circle(location, ${params.lat}, ${params.lng}, ${Math.round(params.radius * 3.28084)})`, // Convert meters to feet
        $limit: params.limit || 100,
        $order: 'start_date_time ASC',
      };

      // Add date filters as query parameters (not nested objects)
      if (params.startDate) {
        const whereClause = queryParams.$where;
        queryParams.$where = `${whereClause} AND start_date_time >= '${params.startDate.toISOString()}'`;
      }

      if (params.endDate) {
        const whereClause = queryParams.$where;
        queryParams.$where = `${whereClause} AND start_date_time <= '${params.endDate.toISOString()}'`;
      }

      const events = await this.makeRequest(`${this.baseUrl}/fudw-fgrp.json`, {
        method: 'GET',
        params: queryParams,
      });

      const eventsArray = (events as any[]) || [];
      return eventsArray
        .filter((event: any) => this.isValidEvent(event))
        .map((event: any) => this.nycEventToExternal(event));
    } catch (error) {
      this.logger.error(`NYC Parks search failed: ${error.message}`);
      return [];
    }
  }

  private isValidEvent(event: any): boolean {
    // Filter out invalid or past events
    if (!event.event_name || !event.start_date_time) return false;

    const startTime = new Date(event.start_date_time);
    if (startTime < new Date()) return false;

    // Filter out very far future events
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + 90);
    if (startTime > maxDate) return false;

    return true;
  }

  private nycEventToExternal(event: any): ExternalEventRaw {
    return {
      source: this.source,
      sourceId: event.event_id || this.generateEventId(event),
      title: this.cleanEventName(event.event_name),
      description: this.buildDescription(event),
      startTime: new Date(event.start_date_time),
      endTime: event.end_date_time
        ? new Date(event.end_date_time)
        : this.estimateEndTime(new Date(event.start_date_time)),
      venue: event.park_site_name,
      address: this.buildAddress(event),
      lat: event.location?.latitude
        ? parseFloat(event.location.latitude)
        : undefined,
      lng: event.location?.longitude
        ? parseFloat(event.location.longitude)
        : undefined,
      externalBookingUrl: this.buildBookingUrl(event),
      priceDisplay: this.formatPrice(event.cost),
      priceLevel: this.mapPriceLevel(event.cost),
      organizerName: 'NYC Parks',
      requiresRSVP: this.requiresRegistration(event),
      categories: this.buildCategories(event),
      tags: this.generateNYCTags(event),
      sourceUrl: event.event_website || 'https://www.nycgovparks.org/events',
      lastUpdated: new Date(),
    };
  }

  private generateEventId(event: any): string {
    // Generate consistent ID from event data
    const name =
      event.event_name?.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'event';
    const date = event.start_date_time?.split('T')[0] || 'nodate';
    const park =
      event.park_site_name?.replace(/[^a-z0-9]/gi, '').toLowerCase() ||
      'nopark';
    return `${name}-${park}-${date}`;
  }

  private cleanEventName(name: string): string {
    if (!name) return 'NYC Parks Event';

    // Clean up common formatting issues
    return name
      .replace(/\s+/g, ' ')
      .replace(/^\s*-\s*/, '')
      .trim();
  }

  private buildDescription(event: any): string {
    const parts: string[] = [];

    if (event.event_description) {
      parts.push(event.event_description);
    } else {
      parts.push(`Join us for ${event.event_name} at ${event.park_site_name}.`);
    }

    if (event.borough) {
      parts.push(`Located in ${event.borough}.`);
    }

    if (event.cost && event.cost.toLowerCase() !== 'free') {
      parts.push(`Cost: ${event.cost}.`);
    } else {
      parts.push('This is a free event!');
    }

    return parts.join(' ');
  }

  private buildAddress(event: any): string {
    const parts: string[] = [];

    if (event.park_site_name) parts.push(event.park_site_name);
    if (event.borough) parts.push(event.borough);
    parts.push('NYC');

    return parts.join(', ');
  }

  private buildBookingUrl(event: any): string {
    if (event.registration_url) return event.registration_url;
    if (event.event_website) return event.event_website;

    // Default to NYC Parks events page
    return 'https://www.nycgovparks.org/events';
  }

  private formatPrice(cost?: string): string {
    if (!cost) return 'Free';

    const cleaned = cost.toLowerCase().trim();
    if (cleaned === 'free' || cleaned === '$0' || cleaned === '0')
      return 'Free';

    // Clean up price formatting
    return cost.replace(/^\$?/, '$');
  }

  private mapPriceLevel(cost?: string): number {
    if (!cost || cost.toLowerCase().includes('free')) return 0;

    // Extract numeric value
    const match = cost.match(/\$?(\d+)/);
    if (!match) return 0;

    const amount = parseInt(match[1]);
    if (amount <= 10) return 1;
    if (amount <= 25) return 2;
    if (amount <= 50) return 3;
    return 4;
  }

  private requiresRegistration(event: any): boolean {
    return !!(event.registration_url || event.registration_required);
  }

  private buildCategories(event: any): string[] {
    const categories = ['parks', 'outdoor', 'public'];

    if (event.event_type) {
      categories.push(event.event_type.toLowerCase());
    }

    // Infer categories from event name
    const name = (event.event_name || '').toLowerCase();
    if (name.includes('workshop') || name.includes('class'))
      categories.push('workshop');
    if (name.includes('tour')) categories.push('tour');
    if (name.includes('festival')) categories.push('festival');
    if (name.includes('concert') || name.includes('music'))
      categories.push('music');
    if (name.includes('art')) categories.push('art');
    if (name.includes('family')) categories.push('family');
    if (name.includes('fitness') || name.includes('yoga'))
      categories.push('fitness');

    return [...new Set(categories)]; // Remove duplicates
  }

  private generateNYCTags(event: any): string[] {
    const tags = ['nyc-parks', 'public', 'outdoor'];

    if (!event.cost || event.cost.toLowerCase().includes('free'))
      tags.push('free');
    if (event.borough) tags.push(event.borough.toLowerCase().replace(' ', '-'));
    if (event.event_type)
      tags.push(event.event_type.toLowerCase().replace(' ', '-'));

    // Add seasonal tags
    const month = new Date(event.start_date_time).getMonth();
    if (month >= 2 && month <= 4) tags.push('spring');
    else if (month >= 5 && month <= 7) tags.push('summer');
    else if (month >= 8 && month <= 10) tags.push('fall');
    else tags.push('winter');

    return tags;
  }

  private estimateEndTime(startTime: Date): Date {
    const endTime = new Date(startTime);
    // Most park events are 1-2 hours
    endTime.setHours(endTime.getHours() + 1.5);
    return endTime;
  }
}
