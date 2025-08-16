import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { AIService } from '../../ai/ai.service';
import { AssetsService } from '../../assets/assets.service';
import { GooglePlacesService } from './google-places.service';
import { VibeMappingService } from './vibe-mapping.service';
import { RegionEventInput, VenueCandidate } from '../types/region.types';

@Injectable()
export class RegionIngestionService {
  private readonly logger = new Logger(RegionIngestionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly googlePlaces: GooglePlacesService,
    private readonly vibeMapping: VibeMappingService,
    private readonly aiService: AIService,
    private readonly assetsService: AssetsService,
  ) {}

  async generateRegionEvent(input: RegionEventInput) {
    this.logger.log(
      `Generating region event for ${input.region.name || input.region.placeId} - ${input.vibeKey}`,
    );

    try {
      // 1. Resolve region place
      const regionPlace = await this.googlePlaces.resolveRegionPlace(
        input.region,
      );
      this.logger.debug(`Resolved region: ${regionPlace.name}`);

      // 2. Build region photo gallery
      const gallery = this.buildRegionGallery(regionPlace.photos || []);

      // 3. Find venue candidates
      const vibeMapping = this.vibeMapping.getVibeMapping(input.vibeKey as any);
      const searchRadius = input.searchRadiusM || 800;

      const venueCandidates = await this.googlePlaces.findNearbyVenues(
        regionPlace.geometry.location.lat,
        regionPlace.geometry.location.lng,
        searchRadius,
        vibeMapping.types,
        vibeMapping.keywords,
        input.startTime,
      );

      if (venueCandidates.length < 2) {
        // Try expanding search radius
        this.logger.warn(
          `Only ${venueCandidates.length} venues found, expanding search radius`,
        );
        const expandedCandidates = await this.googlePlaces.findNearbyVenues(
          regionPlace.geometry.location.lat,
          regionPlace.geometry.location.lng,
          searchRadius + 200,
          vibeMapping.types,
          vibeMapping.keywords,
          input.startTime,
        );

        if (expandedCandidates.length < 2) {
          throw new Error(
            `Insufficient venues found for ${input.vibeKey} in ${regionPlace.name}. Found: ${expandedCandidates.length}`,
          );
        }
        venueCandidates.push(...expandedCandidates);
      }

      // 4. Pick top 2 venues
      const topTwoVenues = venueCandidates.slice(0, 2);
      const enrichedVenues = await Promise.all(
        topTwoVenues.map((venue) => this.googlePlaces.enrichVenue(venue)),
      );

      // 5. Generate AI plan content
      const aiPlans = await this.generateAIPlanContent(
        regionPlace.name,
        input.vibeKey,
        enrichedVenues,
      );

      // 6. Normalize event and create embeddings
      const eventData = await this.normalizeEventData(
        regionPlace,
        input.vibeKey,
        enrichedVenues,
      );

      // 7. Create event and plans
      const event = await this.createEventWithPlans(
        eventData,
        gallery,
        aiPlans,
        enrichedVenues,
        input,
        regionPlace,
      );

      this.logger.log(`Successfully created region event: ${event.id}`);
      return event;
    } catch (error) {
      this.logger.error(`Failed to generate region event:`, error.message);
      throw error;
    }
  }

  private buildRegionGallery(
    photos: Array<{ photo_reference: string }>,
  ): string[] {
    return photos
      .slice(0, 6) // Keep max 6 photos
      .map((photo) =>
        this.assetsService.buildPhotoUrl(photo.photo_reference, 1280),
      );
  }

  private async generateAIPlanContent(
    regionName: string,
    vibeKey: string,
    venues: Array<VenueCandidate & { website?: string; mapUrl: string }>,
  ) {
    const eventTitle = `${regionName} — ${this.vibeMapping.prettyVibeName(vibeKey as any)}`;
    const venueInfo = venues
      .map((v) => `${v.name} (${v.types[0] || 'venue'})`)
      .join(', ');

    try {
      const plans = await this.aiService.buildTwoPlans({
        title: eventTitle,
        venue: venueInfo,
        address: regionName,
      });
      return plans;
    } catch (error) {
      this.logger.warn(
        `AI plan generation failed, using fallback:`,
        error.message,
      );

      // Fallback plan generation
      return [
        {
          title: `${venues[0].name} experience`,
          description: `Enjoy the atmosphere at ${venues[0].name}`,
          emoji: this.getVibeEmoji(vibeKey),
        },
        {
          title: `${venues[1].name} experience`,
          description: `Discover what ${venues[1].name} has to offer`,
          emoji: this.getVibeEmoji(vibeKey),
        },
      ];
    }
  }

  private getVibeEmoji(vibeKey: string): string {
    const emojiMap: Record<string, string> = {
      RELAXED: '☕️',
      DATE_NIGHT: '🍷',
      PARTY: '🎉',
      ARTSY: '🎨',
      MORNING: '🌅',
      CHILL: '😌',
      SOCIAL: '👥',
      CULTURAL: '🏛️',
    };
    return emojiMap[vibeKey] || '✨';
  }

  private async normalizeEventData(
    regionPlace: any,
    vibeKey: string,
    venues: Array<VenueCandidate>,
  ) {
    const eventDescription = `${regionPlace.name} — ${this.vibeMapping.prettyVibeName(vibeKey as any)}`;
    const venueTypes = [...new Set(venues.flatMap((v) => v.types))];

    try {
      const normalized = await this.aiService.normalizeEvent({
        title: eventDescription,
        description: this.vibeMapping.getVibeDescription(vibeKey as any),
        venue: regionPlace.name,
        tags: venueTypes,
      });

      // Generate embedding
      const embeddingText = `${regionPlace.name} – ${vibeKey}\n${venues.map((v) => v.name).join('\n')}\n${venueTypes.join(' ')}`;
      const embedding = await this.aiService.embed(embeddingText);

      return {
        normalized,
        embedding,
        embeddingText,
      };
    } catch (error) {
      this.logger.warn(
        `AI normalization failed, using fallback:`,
        error.message,
      );
      return {
        normalized: {
          categories: venueTypes,
          tags: [vibeKey],
          mappedInterests: [],
        },
        embedding: null,
        embeddingText: '',
      };
    }
  }

  private async createEventWithPlans(
    eventData: any,
    gallery: string[],
    aiPlans: any[],
    venues: Array<VenueCandidate & { website?: string; mapUrl: string }>,
    input: RegionEventInput,
    regionPlace: any,
  ) {
    const prettyVibe = this.vibeMapping.prettyVibeName(input.vibeKey as any);

    // Default time slots if not provided
    const startTime = input.startTime || this.getDefaultStartTime();
    const endTime = input.endTime || this.getDefaultEndTime(startTime);

    return this.prisma.$transaction(async (tx) => {
      // Convert embedding to Buffer for Prisma Bytes
      const embeddingBuffer = eventData.embedding
        ? Buffer.from(Float32Array.from(eventData.embedding as number[]).buffer)
        : null;

      // Create event
      const event = await tx.event.create({
        data: {
          title: `${regionPlace.name} — ${prettyVibe}`,
          description: this.vibeMapping.getVibeDescription(
            input.vibeKey as any,
          ),
          imageUrl: gallery[0] || null,
          lat: new Prisma.Decimal(regionPlace.geometry.location.lat),
          lng: new Prisma.Decimal(regionPlace.geometry.location.lng),
          startTime,
          endTime,

          // Region fields
          regionProvider: 'google',
          regionPlaceId: regionPlace.place_id,
          regionName: regionPlace.name,
          gallery,
          vibeKey: input.vibeKey as any,
          searchRadiusM: input.searchRadiusM || 800,

          // AI fields
          aiNormalized: eventData.normalized,
          embedding: embeddingBuffer,
          tags: eventData.normalized.tags || [],

          votingState: 'NOT_STARTED',
        },
      });

      // Create plans
      const plans = await Promise.all(
        venues.slice(0, 2).map(async (venue, index) => {
          const planData = aiPlans[index] || {
            title: `${venue.name} experience`,
            description: `Experience ${venue.name}`,
            emoji: this.getVibeEmoji(input.vibeKey),
          };

          return tx.plan.create({
            data: {
              eventId: event.id,
              title: planData.title,
              description: planData.description,
              emoji: planData.emoji,

              // Venue fields
              placeProvider: 'google',
              placeId: venue.placeId,
              venue: venue.name,
              address: venue.address,
              lat: venue.lat ? new Prisma.Decimal(venue.lat) : null,
              lng: venue.lng ? new Prisma.Decimal(venue.lng) : null,
              rating: venue.rating ? new Prisma.Decimal(venue.rating) : null,
              priceLevel: venue.priceLevel,
              photoUrl: venue.photoReference
                ? this.assetsService.buildPhotoUrl(venue.photoReference, 800)
                : null,
              externalBookingUrl: this.googlePlaces.determineBookingUrl(
                venue.website,
                venue.mapUrl,
              ),
              mapUrl: venue.mapUrl,
              tags: venue.types,
            },
          });
        }),
      );

      // Create event interests mapping (slug -> ID lookup)
      const mappedInterests = (eventData.normalized?.mappedInterests ??
        []) as Array<{
        id: string;
        weight?: number;
      }>;

      if (mappedInterests.length > 0) {
        const slugs = mappedInterests.map((m) => m.id);
        const slugToWeight = new Map(
          mappedInterests.map((m) => [m.id, m.weight ?? 1]),
        );

        const interests = await tx.interest.findMany({
          where: { slug: { in: slugs } },
        });

        for (const interest of interests) {
          try {
            await tx.eventInterest.upsert({
              where: {
                eventId_interestId: {
                  eventId: event.id,
                  interestId: interest.id,
                },
              },
              create: {
                eventId: event.id,
                interestId: interest.id,
                weight: slugToWeight.get(interest.slug) ?? 1,
              },
              update: {
                weight: slugToWeight.get(interest.slug) ?? 1,
              },
            });
          } catch (error) {
            this.logger.warn(
              `Failed to create event interest mapping for ${interest.slug}:`,
              error.message,
            );
          }
        }
      }

      return {
        ...event,
        plans,
      };
    });
  }

  private getDefaultStartTime(): Date {
    const tonight = new Date();
    tonight.setHours(19, 0, 0, 0); // 7 PM today
    if (tonight < new Date()) {
      tonight.setDate(tonight.getDate() + 1); // Tomorrow if past 7 PM
    }
    return tonight;
  }

  private getDefaultEndTime(startTime: Date): Date {
    const endTime = new Date(startTime);
    endTime.setHours(endTime.getHours() + 3); // 3 hours duration
    return endTime;
  }
}
