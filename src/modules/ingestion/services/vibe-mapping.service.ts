import { Injectable } from '@nestjs/common';
import { VibeKey } from '../types/region.types';

export interface VibeMapping {
  types: string[];
  keywords: string[];
  description: string;
}

@Injectable()
export class VibeMappingService {
  private readonly vibeMap: Record<VibeKey, VibeMapping> = {
    RELAXED: {
      types: ['cafe', 'bakery', 'book_store'],
      keywords: ['cozy', 'coffee', 'pastry', 'quiet'],
      description: 'Cozy and peaceful venues for relaxation',
    },
    DATE_NIGHT: {
      types: ['restaurant', 'wine_bar'],
      keywords: ['romantic', 'wine', 'bistro', 'intimate'],
      description: 'Romantic venues perfect for date nights',
    },
    PARTY: {
      types: ['bar', 'night_club'],
      keywords: ['live music', 'dj', 'dance', 'nightlife'],
      description: 'Energetic venues for nightlife and parties',
    },
    ARTSY: {
      types: ['art_gallery', 'museum', 'cafe'],
      keywords: ['art', 'gallery', 'exhibition', 'creative'],
      description: 'Cultural venues with artistic atmosphere',
    },
    MORNING: {
      types: ['cafe', 'restaurant'],
      keywords: ['breakfast', 'brunch', 'morning', 'coffee'],
      description: 'Perfect spots for morning activities',
    },
    CHILL: {
      types: ['cafe', 'bar', 'park'],
      keywords: ['laid-back', 'casual', 'comfortable'],
      description: 'Laid-back venues for casual hangouts',
    },
    SOCIAL: {
      types: ['restaurant', 'bar', 'sports_bar'],
      keywords: ['social', 'group', 'friends', 'lively'],
      description: 'Great venues for socializing and meeting people',
    },
    CULTURAL: {
      types: ['museum', 'art_gallery', 'library', 'tourist_attraction'],
      keywords: ['culture', 'history', 'art', 'education'],
      description: 'Educational and culturally enriching venues',
    },
  };

  getVibeMapping(vibeKey: VibeKey): VibeMapping {
    return this.vibeMap[vibeKey] || this.vibeMap.RELAXED;
  }

  getAllVibes(): VibeKey[] {
    return Object.keys(this.vibeMap) as VibeKey[];
  }

  isValidVibe(vibeKey: string): vibeKey is VibeKey {
    return vibeKey in this.vibeMap;
  }

  getVibeDescription(vibeKey: VibeKey): string {
    return this.vibeMap[vibeKey]?.description || 'Unknown vibe';
  }

  /**
   * Convert vibeKey to pretty display name
   */
  prettyVibeName(vibeKey: VibeKey): string {
    const map: Record<VibeKey, string> = {
      RELAXED: 'Relaxed',
      DATE_NIGHT: 'Date Night',
      PARTY: 'Party',
      ARTSY: 'Artsy',
      MORNING: 'Morning',
      CHILL: 'Chill',
      SOCIAL: 'Social',
      CULTURAL: 'Cultural',
    };
    return map[vibeKey] || vibeKey;
  }
}
