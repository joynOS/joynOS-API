import { EventSource } from '../enums/event-source.enum';

export interface ExternalEventRaw {
  // Required fields
  source: EventSource;
  sourceId: string;
  title: string;
  startTime: Date;
  externalBookingUrl: string;

  // Optional fields (aproveitando schema atual)
  description?: string;
  endTime?: Date;
  venue?: string;
  address?: string;
  lat?: number;
  lng?: number;
  rating?: number;
  priceLevel?: number; // 0-4 scale
  priceDisplay?: string; // "Free", "$15-25", "$$"
  organizerName?: string;
  organizerId?: string; // ID of organizer in external system
  capacity?: number;
  attendeeCount?: number;
  requiresRSVP?: boolean;
  categories?: string[];
  images?: string[];
  reviewCount?: number;
  tags?: string[];

  // Metadata
  sourceUrl?: string; // Original event URL
  lastUpdated?: Date;
}

export interface SearchParams {
  lat: number;
  lng: number;
  radius: number; // meters
  startDate?: Date;
  endDate?: Date;
  keywords?: string[];
  categories?: string[];
  priceMax?: number;
  limit?: number;
}

export interface ExternalAPIProvider {
  readonly name: string;
  readonly source: EventSource;

  searchEvents(params: SearchParams): Promise<ExternalEventRaw[]>;
  getEventDetails?(eventId: string): Promise<ExternalEventRaw | null>;
  isEnabled(): boolean;
}

export interface ConvertedEvent {
  // Event data
  title: string;
  description?: string;
  source: string;
  sourceId: string;
  externalBookingUrl?: string;
  startTime?: Date;
  endTime?: Date;
  venue?: string;
  address?: string;
  lat?: string; // Prisma Decimal as string
  lng?: string;
  rating?: number;
  priceLevel?: number;
  tags: string[];

  // New fields
  organizerName?: string;
  attendeeCount?: number;
  capacity?: number;
  priceDisplay?: string;
  requiresRSVP?: boolean;
  categories?: string[];
  syncStatus: 'active';
  lastSyncAt: Date;

  // AI will determine these
  vibeKey?: string;
  regionName?: string;
  regionProvider?: string;
  regionPlaceId?: string;
  gallery?: string[];
}
