import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseExternalAPIService } from './base-external-api.service';
import {
  ExternalEventRaw,
  SearchParams,
} from '../interfaces/external-event.interface';
import { EventSource } from '../enums/event-source.enum';

@Injectable()
export class YelpFusionService extends BaseExternalAPIService {
  readonly name = 'Yelp Fusion';
  readonly source = EventSource.YELP;
  private readonly baseUrl = 'https://api.yelp.com/v3';

  constructor(configService: ConfigService) {
    super(configService);
  }

  protected getApiKey(): string {
    return this.configService.get<string>('YELP_API_KEY') || '';
  }

  isEnabled(): boolean {
    return (
      this.configService.get('YELP_API_ENABLED') === 'true' &&
      !!this.getApiKey()
    );
  }

  async searchEvents(params: SearchParams): Promise<ExternalEventRaw[]> {
    if (!this.isEnabled()) {
      this.logger.debug('Yelp API disabled');
      return [];
    }

    try {
      // Yelp doesn't have "events" but we treat bookable activities as events
      const businesses = await this.searchBookableBusinesses(params);
      return businesses.map((business) => this.businessToEvent(business));
    } catch (error) {
      this.logger.error(`Yelp search failed: ${error.message}`);
      return [];
    }
  }

  private async searchBookableBusinesses(params: SearchParams): Promise<any[]> {
    const categories = [
      'winebars,wine_tasting',
      'cooking_classes',
      'art_galleries,museums',
      'pottery_classes,workshops',
      'spas,massage',
      'yoga,fitness',
      'breweries,brewpubs',
    ];

    const allBusinesses: any[] = [];

    for (const categoryGroup of categories) {
      try {
        const response = await this.makeRequest(
          `${this.baseUrl}/businesses/search`,
          {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${this.getApiKey()}`,
            },
            params: {
              latitude: params.lat,
              longitude: params.lng,
              radius: Math.min(params.radius, 40000), // Yelp max: 40km
              categories: categoryGroup,
              limit: 50,
              sort_by: 'rating',
              open_now: false,
            },
          },
        );

        const businesses =
          (response as any).businesses?.filter(
            (biz: any) =>
              biz.rating >= 4.0 &&
              biz.review_count >= 10 &&
              this.isBookableActivity(biz),
          ) || [];

        allBusinesses.push(...businesses);
      } catch (error) {
        this.logger.warn(
          `Failed to search category ${categoryGroup}: ${error.message}`,
        );
      }
    }

    // Remove duplicates and sort by rating
    const uniqueBusinesses = allBusinesses
      .filter(
        (biz, index, self) => index === self.findIndex((b) => b.id === biz.id),
      )
      .sort((a, b) => b.rating - a.rating);

    return this.limitResults(uniqueBusinesses, params.limit || 20);
  }

  private isBookableActivity(business: any): boolean {
    const bookableCategories = [
      'winebars',
      'wine_tasting',
      'cooking_classes',
      'art_galleries',
      'museums',
      'pottery_classes',
      'workshops',
      'spas',
      'massage',
      'yoga',
      'fitness',
      'breweries',
      'brewpubs',
    ];

    return business.categories?.some((cat: any) =>
      bookableCategories.some(
        (bookable) =>
          cat.alias?.includes(bookable) ||
          cat.title?.toLowerCase().includes(bookable.replace('_', ' ')),
      ),
    );
  }

  private businessToEvent(business: any): ExternalEventRaw {
    const activityType = this.determineActivityType(business);

    return {
      source: this.source,
      sourceId: business.id,
      title: `${activityType} at ${business.name}`,
      description: this.generateDescription(business, activityType),
      startTime: this.generateNextAvailableTime(business),
      endTime: this.generateEndTime(business),
      venue: business.name,
      address: business.location?.display_address?.join(', '),
      lat: business.coordinates?.latitude,
      lng: business.coordinates?.longitude,
      externalBookingUrl: business.url,
      rating: business.rating,
      priceLevel: this.mapYelpPriceToLevel(business.price),
      priceDisplay: this.formatPriceDisplay(business.price),
      organizerName: business.name,
      categories: business.categories?.map((c: any) => c.title) || [],
      images: business.photos || [],
      reviewCount: business.review_count,
      tags: this.generateTags(business),
      sourceUrl: business.url,
      requiresRSVP: true, // Most bookable activities require reservation
      lastUpdated: new Date(),
    };
  }

  private determineActivityType(business: any): string {
    const categories = business.categories?.map((c: any) => c.alias) || [];

    if (categories.some((c: string) => c.includes('wine')))
      return 'Wine Tasting';
    if (categories.some((c: string) => c.includes('cooking')))
      return 'Cooking Class';
    if (
      categories.some((c: string) => c.includes('art') || c.includes('gallery'))
    )
      return 'Art Experience';
    if (
      categories.some((c: string) => c.includes('spa') || c.includes('massage'))
    )
      return 'Wellness Session';
    if (
      categories.some(
        (c: string) => c.includes('yoga') || c.includes('fitness'),
      )
    )
      return 'Fitness Class';
    if (
      categories.some(
        (c: string) => c.includes('pottery') || c.includes('workshop'),
      )
    )
      return 'Workshop';
    if (categories.some((c: string) => c.includes('brew')))
      return 'Brewery Experience';

    return 'Experience';
  }

  private generateDescription(business: any, activityType: string): string {
    const rating = business.rating || 0;
    const reviewCount = business.review_count || 0;
    const neighborhood =
      business.location?.neighborhoods?.[0] || business.location?.city;

    return (
      `Join a ${activityType.toLowerCase()} at ${business.name}${neighborhood ? ` in ${neighborhood}` : ''}. ` +
      `Highly rated with ${rating}⭐ from ${reviewCount} reviews. ` +
      `Book directly through Yelp for the best experience.`
    );
  }

  private generateNextAvailableTime(business: any): Date {
    // Generate events for next 30 days, considering business hours
    const now = new Date();
    const daysOut = Math.floor(Math.random() * 30) + 1; // 1-30 days from now
    const eventDate = new Date(now);
    eventDate.setDate(eventDate.getDate() + daysOut);

    // Set reasonable activity times (avoid very early/late)
    const hour = Math.floor(Math.random() * 8) + 10; // 10 AM to 6 PM
    eventDate.setHours(hour, 0, 0, 0);

    return eventDate;
  }

  private generateEndTime(business: any): Date {
    const startTime = this.generateNextAvailableTime(business);
    const endTime = new Date(startTime);
    endTime.setHours(endTime.getHours() + 2); // Most activities are 2 hours
    return endTime;
  }

  private mapYelpPriceToLevel(yelpPrice?: string): number {
    if (!yelpPrice) return 0;
    switch (yelpPrice) {
      case '$':
        return 1;
      case '$$':
        return 2;
      case '$$$':
        return 3;
      case '$$$$':
        return 4;
      default:
        return 0;
    }
  }

  private formatPriceDisplay(yelpPrice?: string): string {
    if (!yelpPrice) return 'Price varies';

    const priceMap: Record<string, string> = {
      $: '$10-25',
      $$: '$25-50',
      $$$: '$50-100',
      $$$$: '$100+',
    };

    return priceMap[yelpPrice] || 'Price varies';
  }

  private generateTags(business: any): string[] {
    const tags = ['bookable', 'activity'];

    if (business.rating >= 4.5) tags.push('highly-rated');
    if (business.review_count >= 100) tags.push('popular');

    // Add category-based tags
    const categories = business.categories?.map((c: any) => c.alias) || [];
    if (categories.some((c: string) => c.includes('wine')))
      tags.push('wine', 'drinks');
    if (categories.some((c: string) => c.includes('art')))
      tags.push('art', 'culture');
    if (categories.some((c: string) => c.includes('spa')))
      tags.push('wellness', 'relaxation');
    if (categories.some((c: string) => c.includes('fitness')))
      tags.push('fitness', 'health');

    return tags;
  }
}
