import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { GooglePlacesService } from './google-places.service';
import { VibeMappingService } from './vibe-mapping.service';
import { RegionIngestionService } from './region-ingestion.service';
import {
  DiscoverAndGenerateDto,
  DiscoverPreviewDto,
  DiscoveryPreviewResponse,
  DiscoverAndGenerateResponse,
  RegionCandidate,
  VibeCandidate,
  SampleVenue,
  CreatedEvent,
  SkippedEvent,
} from '../dto/discovery.dto';
import { VibeKey } from '../types/region.types';

interface VenueCluster {
  center: { lat: number; lng: number };
  venues: Array<{
    placeId: string;
    name: string;
    types: string[];
    rating?: number;
    lat: number;
    lng: number;
  }>;
  regionName?: string;
  regionPlaceId?: string;
}

@Injectable()
export class DiscoveryService {
  private readonly logger = new Logger(DiscoveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly googlePlaces: GooglePlacesService,
    private readonly vibeMapping: VibeMappingService,
    private readonly regionIngestion: RegionIngestionService,
  ) {}

  async discoverPreview(
    dto: DiscoverPreviewDto,
  ): Promise<DiscoveryPreviewResponse> {
    this.logger.log(
      `Discovering regions around ${dto.centerLat}, ${dto.centerLng} within ${dto.radiusKm}km`,
    );

    const clusters = await this.discoverClusters(
      dto.centerLat,
      dto.centerLng,
      dto.radiusKm,
    );

    const rankedRegions = this.rankAndDeduplicateClusters(
      clusters,
      dto.maxRegions ?? 6,
    );

    const regions: RegionCandidate[] = rankedRegions.map((cluster) => {
      const vibesRanked = this.scoreVibesForRegion(cluster);
      const finalVibes = dto.diversityMode
        ? this.applyDiversityToVibes(vibesRanked, rankedRegions, cluster)
        : vibesRanked.slice(0, 2);

      return {
        regionPlaceId: cluster.regionPlaceId,
        regionName:
          cluster.regionName ||
          `Region at ${cluster.center.lat.toFixed(3)}, ${cluster.center.lng.toFixed(3)}`,
        center: cluster.center,
        vibesRanked: finalVibes,
        sampleVenues: cluster.venues.slice(0, 5).map((v) => ({
          placeId: v.placeId,
          name: v.name,
          types: v.types,
          rating: v.rating,
        })),
        venueCount: cluster.venues.length,
        averageRating:
          cluster.venues.reduce((sum, v) => sum + (v.rating || 0), 0) /
          cluster.venues.length,
      };
    });

    const totalVenues = regions.reduce((sum, r) => sum + r.venueCount, 0);
    const vibeFrequency = new Map<string, number>();
    regions.forEach((r) =>
      r.vibesRanked.forEach((v) =>
        vibeFrequency.set(v.vibeKey, (vibeFrequency.get(v.vibeKey) || 0) + 1),
      ),
    );

    const mostCommonVibes = Array.from(vibeFrequency.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([vibe]) => vibe);

    return {
      regions,
      summary: {
        totalVenuesFound: totalVenues,
        averageVenuesPerRegion: totalVenues / regions.length,
        mostCommonVibes,
      },
    };
  }

  async discoverAndGenerate(
    dto: DiscoverAndGenerateDto,
  ): Promise<DiscoverAndGenerateResponse> {
    if (dto.dryRun) {
      const preview = await this.discoverPreview({
        centerLat: dto.centerLat,
        centerLng: dto.centerLng,
        radiusKm: dto.radiusKm,
        maxRegions: dto.maxRegions,
        diversityMode: dto.diversityMode,
      });

      return {
        created: [],
        skipped: [],
        summary: {
          totalRegionsProcessed: preview.regions.length,
          eventsCreated: 0,
          eventsSkipped: 0,
        },
      };
    }

    const clusters = await this.discoverClusters(
      dto.centerLat,
      dto.centerLng,
      dto.radiusKm,
    );

    const rankedRegions = this.rankAndDeduplicateClusters(
      clusters,
      dto.maxRegions ?? 6,
    );

    const created: CreatedEvent[] = [];
    const skipped: SkippedEvent[] = [];

    for (const region of rankedRegions) {
      const vibesRanked = this.scoreVibesForRegion(region);
      const chosenVibes = dto.diversityMode
        ? this.applyDiversityToVibes(vibesRanked, rankedRegions, region)
        : vibesRanked.slice(0, dto.maxEventsPerRegion ?? 2);

      for (const vibeCandidate of chosenVibes.slice(
        0,
        dto.maxEventsPerRegion ?? 2,
      )) {
        const timeSlot = this.pickTimesForVibe(
          vibeCandidate.vibeKey as VibeKey,
          dto.timeWindow,
        );

        try {
          // Check for existing event (idempotency)
          const existing = await this.prisma.event.findFirst({
            where: {
              regionProvider: 'google',
              regionPlaceId: region.regionPlaceId || region.regionName,
              vibeKey: vibeCandidate.vibeKey as VibeKey,
              startTime: {
                gte: new Date(timeSlot.start.getTime() - 60 * 60 * 1000), // ±1 hour tolerance
                lte: new Date(timeSlot.start.getTime() + 60 * 60 * 1000),
              },
            },
          });

          if (existing) {
            skipped.push({
              reason: 'duplicate - event already exists',
              regionPlaceId: region.regionPlaceId,
              regionName: region.regionName || 'Unknown',
              vibeKey: vibeCandidate.vibeKey,
            });
            continue;
          }

          const event = await this.regionIngestion.generateRegionEvent({
            region: {
              placeId: region.regionPlaceId,
              name: region.regionName, // Don't create synthetic names
              lat: region.center.lat,
              lng: region.center.lng,
            },
            vibeKey: vibeCandidate.vibeKey as VibeKey,
            searchRadiusM: 800,
            startTime: timeSlot.start,
            endTime: timeSlot.end,
          });

          created.push({
            eventId: event.id,
            regionName: region.regionName || 'Unknown',
            vibeKey: vibeCandidate.vibeKey,
            startTime: timeSlot.start.toISOString(),
            endTime: timeSlot.end.toISOString(),
          });

          this.logger.log(
            `Created event: ${event.id} - ${region.regionName} (${vibeCandidate.vibeKey})`,
          );
        } catch (error) {
          this.logger.warn(
            `Failed to create event for ${region.regionName} (${vibeCandidate.vibeKey}): ${error.message}`,
          );

          skipped.push({
            reason: `generation failed: ${error.message}`,
            regionPlaceId: region.regionPlaceId,
            regionName: region.regionName || 'Unknown',
            vibeKey: vibeCandidate.vibeKey,
          });
        }
      }
    }

    return {
      created,
      skipped,
      summary: {
        totalRegionsProcessed: rankedRegions.length,
        eventsCreated: created.length,
        eventsSkipped: skipped.length,
      },
    };
  }

  private async discoverClusters(
    centerLat: number,
    centerLng: number,
    radiusKm: number,
  ): Promise<VenueCluster[]> {
    const venues: Array<{
      placeId: string;
      name: string;
      types: string[];
      rating?: number;
      lat: number;
      lng: number;
    }> = [];

    // Generate grid points for venue discovery
    const gridStep = 0.4; // ~400m step
    const latRange = radiusKm / 111; // roughly 111km per degree lat
    const lngRange = radiusKm / (111 * Math.cos((centerLat * Math.PI) / 180));

    const searchTypes = [
      'cafe',
      'restaurant',
      'bar',
      'night_club',
      'art_gallery',
      'museum',
      'book_store',
      'bakery',
      'tourist_attraction',
    ];

    for (
      let latOffset = -latRange;
      latOffset <= latRange;
      latOffset += latRange * gridStep
    ) {
      for (
        let lngOffset = -lngRange;
        lngOffset <= lngRange;
        lngOffset += lngRange * gridStep
      ) {
        const searchLat = centerLat + latOffset;
        const searchLng = centerLng + lngOffset;

        // Check if point is within radius
        const distance = this.haversineDistance(
          centerLat,
          centerLng,
          searchLat,
          searchLng,
        );
        if (distance > radiusKm) continue;

        try {
          const nearbyVenues = await this.googlePlaces.findNearbyVenues(
            searchLat,
            searchLng,
            300, // 300m search radius per grid point
            searchTypes,
            [], // no keywords - let AI decide later
          );

          for (const venue of nearbyVenues) {
            // Deduplicate by placeId
            if (!venues.find((v) => v.placeId === (venue as any).placeId)) {
              venues.push({
                placeId: (venue as any).placeId || venue.name,
                name: venue.name,
                types: venue.types || [],
                rating: venue.rating,
                lat: (venue as any).geometry?.location?.lat || searchLat,
                lng: (venue as any).geometry?.location?.lng || searchLng,
              });
            }
          }
        } catch (error) {
          this.logger.debug(
            `Grid search failed at ${searchLat}, ${searchLng}: ${error.message}`,
          );
        }
      }
    }

    this.logger.log(`Found ${venues.length} unique venues in discovery`);

    // Simple clustering by proximity (300m radius)
    const clusters: VenueCluster[] = [];
    const used = new Set<string>();

    for (const venue of venues) {
      if (used.has(venue.placeId)) continue;

      const cluster: VenueCluster = {
        center: { lat: venue.lat, lng: venue.lng },
        venues: [venue],
      };

      used.add(venue.placeId);

      // Find nearby venues for this cluster
      for (const otherVenue of venues) {
        if (used.has(otherVenue.placeId)) continue;

        const distance = this.haversineDistance(
          venue.lat,
          venue.lng,
          otherVenue.lat,
          otherVenue.lng,
        );

        if (distance <= 0.3) {
          // 300m clustering radius
          cluster.venues.push(otherVenue);
          used.add(otherVenue.placeId);
        }
      }

      // Recalculate cluster center as centroid
      const avgLat =
        cluster.venues.reduce((sum, v) => sum + v.lat, 0) /
        cluster.venues.length;
      const avgLng =
        cluster.venues.reduce((sum, v) => sum + v.lng, 0) /
        cluster.venues.length;
      cluster.center = { lat: avgLat, lng: avgLng };

      // Try to get a region name from Google Places - required for real region names
      try {
        const regionInfo = await this.googlePlaces.findRegionInfo(
          avgLat,
          avgLng,
        );
        if (regionInfo) {
          cluster.regionName = regionInfo.name;
          cluster.regionPlaceId = regionInfo.placeId;
        } else {
          // Skip clusters without real region names
          continue;
        }
      } catch (error) {
        this.logger.debug(
          `Could not find region info for cluster at ${avgLat}, ${avgLng} - skipping`,
        );
        continue;
      }

      clusters.push(cluster);
    }

    return clusters;
  }

  private rankAndDeduplicateClusters(
    clusters: VenueCluster[],
    maxRegions: number,
  ): VenueCluster[] {
    // Score clusters by venue count, average rating, and diversity
    const scoredClusters = clusters.map((cluster) => {
      const avgRating =
        cluster.venues.reduce((sum, v) => sum + (v.rating || 0), 0) /
        cluster.venues.length;
      const uniqueTypes = new Set(cluster.venues.flatMap((v) => v.types)).size;

      const score =
        cluster.venues.length * 0.4 + // venue density
        Math.max(0, avgRating - 3.5) * 10 + // quality bonus
        uniqueTypes * 0.3; // diversity bonus

      return { cluster, score };
    });

    // Sort by score and deduplicate nearby clusters
    scoredClusters.sort((a, b) => b.score - a.score);

    const finalClusters: VenueCluster[] = [];

    for (const { cluster } of scoredClusters) {
      // Check if too close to existing clusters
      const tooClose = finalClusters.some(
        (existing) =>
          this.haversineDistance(
            cluster.center.lat,
            cluster.center.lng,
            existing.center.lat,
            existing.center.lng,
          ) < 0.25, // 250m minimum distance between regions
      );

      if (!tooClose && cluster.venues.length >= 2) {
        finalClusters.push(cluster);
      }

      if (finalClusters.length >= maxRegions) break;
    }

    return finalClusters;
  }

  private scoreVibesForRegion(cluster: VenueCluster): VibeCandidate[] {
    const vibeScores = new Map<string, number>();
    const allVibes = this.vibeMapping.getAllVibes();

    // Initialize all vibes with 0 score
    allVibes.forEach((vibe) => vibeScores.set(vibe, 0));

    // Score based on venue types
    for (const venue of cluster.venues) {
      for (const vibeKey of allVibes) {
        const vibeMapping = this.vibeMapping.getVibeMapping(vibeKey);

        // Check type matches
        const typeMatches = venue.types.some((type) =>
          vibeMapping.types.includes(type),
        );

        if (typeMatches) {
          const ratingBonus = venue.rating
            ? Math.max(0, venue.rating - 3.5) * 0.2
            : 0;
          vibeScores.set(vibeKey, vibeScores.get(vibeKey)! + 1 + ratingBonus);
        }
      }
    }

    // Normalize scores and return ranked list
    const maxScore = Math.max(...vibeScores.values());
    if (maxScore === 0) return []; // No viable vibes

    return Array.from(vibeScores.entries())
      .map(([vibeKey, score]) => ({
        vibeKey,
        score: score / maxScore,
      }))
      .filter((v) => v.score > 0)
      .sort((a, b) => b.score - a.score);
  }

  private applyDiversityToVibes(
    vibesRanked: VibeCandidate[],
    allRegions: VenueCluster[],
    currentRegion: VenueCluster,
  ): VibeCandidate[] {
    // Simple diversity: avoid the most common vibe in nearby regions
    const nearbyRegions = allRegions.filter(
      (region) =>
        region !== currentRegion &&
        this.haversineDistance(
          currentRegion.center.lat,
          currentRegion.center.lng,
          region.center.lat,
          region.center.lng,
        ) < 1, // within 1km
    );

    // For now, just return top vibes - diversity can be enhanced later
    return vibesRanked.slice(0, 2);
  }

  private pickTimesForVibe(
    vibeKey: VibeKey,
    timeWindow?: { start: string; end: string },
  ): { start: Date; end: Date } {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);

    let baseStart: Date;
    let baseEnd: Date;

    // Default time slots by vibe
    switch (vibeKey) {
      case 'MORNING':
        baseStart = new Date(tomorrow);
        baseStart.setHours(9, 0, 0, 0);
        baseEnd = new Date(baseStart);
        baseEnd.setHours(12, 0, 0, 0);
        break;

      case 'RELAXED':
      case 'CHILL':
        baseStart = new Date(tomorrow);
        baseStart.setHours(17, 0, 0, 0);
        baseEnd = new Date(baseStart);
        baseEnd.setHours(20, 0, 0, 0);
        break;

      case 'PARTY':
        baseStart = new Date(tomorrow);
        baseStart.setHours(21, 0, 0, 0);
        baseEnd = new Date(baseStart);
        baseEnd.setHours(23, 59, 0, 0);
        break;

      case 'DATE_NIGHT':
        baseStart = new Date(tomorrow);
        baseStart.setHours(19, 0, 0, 0);
        baseEnd = new Date(baseStart);
        baseEnd.setHours(23, 0, 0, 0);
        break;

      case 'ARTSY':
      case 'CULTURAL':
        baseStart = new Date(tomorrow);
        baseStart.setHours(14, 0, 0, 0);
        baseEnd = new Date(baseStart);
        baseEnd.setHours(18, 0, 0, 0);
        break;

      case 'SOCIAL':
      default:
        baseStart = new Date(tomorrow);
        baseStart.setHours(18, 0, 0, 0);
        baseEnd = new Date(baseStart);
        baseEnd.setHours(22, 0, 0, 0);
        break;
    }

    // Clamp to time window if provided
    if (timeWindow) {
      const windowStart = new Date(timeWindow.start);
      const windowEnd = new Date(timeWindow.end);

      if (baseStart < windowStart) baseStart = windowStart;
      if (baseEnd > windowEnd) baseEnd = windowEnd;

      // Ensure valid duration
      if (baseEnd <= baseStart) {
        baseEnd = new Date(baseStart.getTime() + 2 * 60 * 60 * 1000); // +2 hours
      }
    }

    return { start: baseStart, end: baseEnd };
  }

  private haversineDistance(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number,
  ): number {
    const toRad = (d: number) => (d * Math.PI) / 180;
    const R = 6371; // Earth radius in km
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) *
        Math.cos(toRad(lat2)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }
}
