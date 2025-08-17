import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import {
  GooglePlaceDetails,
  VenueCandidate,
  RegionInput,
} from '../types/region.types';

@Injectable()
export class GooglePlacesService {
  private readonly logger = new Logger(GooglePlacesService.name);
  private readonly apiKey: string;
  private readonly baseUrl = 'https://maps.googleapis.com/maps/api/place';

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('GOOGLE_MAPS_API_KEY') || '';
  }

  /**
   * Resolve region place details from placeId or text search
   */
  async resolveRegionPlace(region: RegionInput): Promise<GooglePlaceDetails> {
    if (region.placeId) {
      return this.getPlaceDetails(region.placeId);
    }

    if (region.name) {
      const candidates = await this.textSearch(
        region.name,
        region.lat,
        region.lng,
      );
      if (candidates.length === 0) {
        throw new Error(`No places found for region: ${region.name}`);
      }
      return this.getPlaceDetails(candidates[0].place_id);
    }

    throw new Error('Region must have either placeId or name');
  }

  /**
   * Get detailed information about a place
   */
  async getPlaceDetails(placeId: string): Promise<GooglePlaceDetails> {
    const url = `${this.baseUrl}/details/json`;
    const params = {
      place_id: placeId,
      fields:
        'place_id,name,geometry,photos,rating,price_level,website,url,formatted_address,types',
      key: this.apiKey,
    };

    try {
      this.logger.debug(`Getting place details for: ${placeId}`);
      const response = await axios.get(url, { params });

      if (response.data.status !== 'OK') {
        throw new Error(`Google Places API error: ${response.data.status}`);
      }

      return response.data.result;
    } catch (error) {
      this.logger.error(
        `Failed to get place details for ${placeId}:`,
        error.message,
      );
      throw new Error(`Failed to get place details: ${error.message}`);
    }
  }

  /**
   * Search for places by text query
   */
  async textSearch(
    query: string,
    lat?: number,
    lng?: number,
  ): Promise<GooglePlaceDetails[]> {
    const url = `${this.baseUrl}/textsearch/json`;
    const params: any = {
      query,
      key: this.apiKey,
    };

    if (lat && lng) {
      params.location = `${lat},${lng}`;
      params.radius = 50000; // 50km radius for region search
    }

    try {
      this.logger.debug(`Text search for: ${query}`);
      const response = await axios.get(url, { params });

      if (response.data.status !== 'OK') {
        throw new Error(`Google Places API error: ${response.data.status}`);
      }

      return response.data.results;
    } catch (error) {
      this.logger.error(`Failed to search for ${query}:`, error.message);
      throw new Error(`Failed to search places: ${error.message}`);
    }
  }

  /**
   * Find venues near a location with specific types
   */
  async findNearbyVenues(
    lat: number,
    lng: number,
    radius: number,
    types: string[],
    keywords: string[],
    startTime?: Date,
  ): Promise<VenueCandidate[]> {
    const url = `${this.baseUrl}/nearbysearch/json`;

    // Check if event is starting soon (within 2 hours)
    const shouldUseOpenNow =
      startTime &&
      startTime.getTime() - Date.now() < 2 * 60 * 60 * 1000 && // within 2 hours
      startTime.getTime() - Date.now() > -30 * 60 * 1000; // not more than 30 min ago

    // Google Places API accepts only one type at a time, so we'll search for each type
    const allCandidates: VenueCandidate[] = [];

    for (const type of types) {
      const params: any = {
        location: `${lat},${lng}`,
        radius: radius.toString(),
        type,
        key: this.apiKey,
        language: 'en',
        keyword: keywords.length > 0 ? keywords.join(' ') : undefined,
        opennow: shouldUseOpenNow ? true : undefined,
      };

      try {
        this.logger.debug(
          `Searching for ${type} venues near ${lat},${lng} within ${radius}m`,
        );
        const response = await axios.get(url, { params });

        if (response.data.status === 'OK') {
          const candidates = response.data.results
            .filter((place: any) => place.rating >= 4.0 && place.photos && place.photos.length > 0) // Only venues with good rating AND photos
            .map((place: any) => ({
              placeId: place.place_id,
              name: place.name,
              rating: place.rating || 0,
              priceLevel: place.price_level,
              lat: place.geometry.location.lat,
              lng: place.geometry.location.lng,
              address: place.vicinity || '',
              photoReference: place.photos?.[0]?.photo_reference,
              types: place.types || [],
            }))
            .filter(
              (candidate: VenueCandidate) =>
                // Filter by keywords if name/types match
                keywords.length === 0 ||
                keywords.some(
                  (keyword) =>
                    candidate.name
                      .toLowerCase()
                      .includes(keyword.toLowerCase()) ||
                    candidate.types.some((type) =>
                      type.toLowerCase().includes(keyword.toLowerCase()),
                    ),
                ),
            );

          allCandidates.push(...candidates);
        }
      } catch (error) {
        this.logger.error(
          `Failed to search for ${type} venues:`,
          error.message,
        );
      }
    }

    // Remove duplicates based on placeId and sort by rating
    const uniqueCandidates = allCandidates
      .filter(
        (candidate, index, self) =>
          index === self.findIndex((c) => c.placeId === candidate.placeId),
      )
      .sort((a, b) => b.rating - a.rating);

    this.logger.debug(
      `Found ${uniqueCandidates.length} unique venue candidates`,
    );
    return uniqueCandidates;
  }

  /**
   * Enrich venue candidate with additional details
   */
  async enrichVenue(
    candidate: VenueCandidate,
  ): Promise<VenueCandidate & { website?: string; mapUrl: string }> {
    try {
      const details = await this.getPlaceDetails(candidate.placeId);

      return {
        ...candidate,
        address: details.formatted_address || candidate.address,
        website: details.website,
        mapUrl:
          details.url ||
          `https://www.google.com/maps/place/?q=place_id:${candidate.placeId}`,
      };
    } catch (error) {
      this.logger.warn(
        `Failed to enrich venue ${candidate.placeId}:`,
        error.message,
      );
      return {
        ...candidate,
        mapUrl: `https://www.google.com/maps/place/?q=place_id:${candidate.placeId}`,
      };
    }
  }

  /**
   * Determine external booking URL from website
   */
  determineBookingUrl(website?: string, mapUrl?: string): string {
    if (!website) {
      return mapUrl || '';
    }

    // Check if website contains known booking platforms
    const bookingPlatforms = ['opentable', 'resy', 'sevenrooms', 'tock'];
    const hasBookingPlatform = bookingPlatforms.some((platform) =>
      website.toLowerCase().includes(platform),
    );

    return hasBookingPlatform ? website : mapUrl || website;
  }

  /**
   * Find region information for a given lat/lng using reverse geocoding
   */
  async findRegionInfo(lat: number, lng: number): Promise<{ name: string; placeId: string } | null> {
    try {
      const response = await axios.get(
        'https://maps.googleapis.com/maps/api/geocode/json',
        {
          params: {
            latlng: `${lat},${lng}`,
            key: this.apiKey,
            result_type: 'neighborhood|sublocality|locality',
          },
        },
      );

      if (response.data.status === 'OK' && response.data.results.length > 0) {
        const result = response.data.results[0];
        
        // Try to find the most specific location name
        const nameComponent = result.address_components.find(
          (component: any) =>
            component.types.includes('neighborhood') ||
            component.types.includes('sublocality') ||
            component.types.includes('locality'),
        );

        return {
          name: nameComponent?.long_name || result.formatted_address,
          placeId: result.place_id,
        };
      }

      return null;
    } catch (error) {
      this.logger.warn(`Failed to get region info for ${lat}, ${lng}:`, error.message);
      return null;
    }
  }
}
