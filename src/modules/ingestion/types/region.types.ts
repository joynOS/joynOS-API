export interface RegionInput {
  placeId?: string;
  name?: string;
  lat?: number;
  lng?: number;
}

export interface RegionEventInput {
  region: RegionInput;
  vibeKey: string;
  searchRadiusM?: number;
  startTime?: Date;
  endTime?: Date;
}

export interface GooglePlaceDetails {
  place_id: string;
  name: string;
  geometry: {
    location: {
      lat: number;
      lng: number;
    };
  };
  photos?: Array<{
    photo_reference: string;
    height: number;
    width: number;
  }>;
  rating?: number;
  price_level?: number;
  website?: string;
  url?: string;
  formatted_address?: string;
  types?: string[];
}

export interface VenueCandidate {
  placeId: string;
  name: string;
  rating: number;
  priceLevel?: number;
  lat: number;
  lng: number;
  address: string;
  photoReference?: string;
  website?: string;
  types: string[];
}

export type VibeKey =
  | 'RELAXED'
  | 'DATE_NIGHT'
  | 'PARTY'
  | 'ARTSY'
  | 'MORNING'
  | 'CHILL'
  | 'SOCIAL'
  | 'CULTURAL';
