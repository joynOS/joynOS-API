import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { AIService } from '../../ai/ai.service';
import { AssetsService } from '../../assets/assets.service';
import { GooglePlacesService } from './google-places.service';
import { VibeMappingService } from './vibe-mapping.service';
import { RegionEventInput, VenueCandidate } from '../types/region.types';
import { ExternalAPIAggregatorService } from '../../external-apis/services/external-api-aggregator.service';
import { ConvertedEvent } from '../../external-apis/interfaces/external-event.interface';

@Injectable()
export class RegionIngestionService {
  private readonly logger = new Logger(RegionIngestionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly googlePlaces: GooglePlacesService,
    private readonly vibeMapping: VibeMappingService,
    private readonly aiService: AIService,
    private readonly assetsService: AssetsService,
    private readonly externalAggregator?: ExternalAPIAggregatorService,
  ) {}

  async generateRegionEvent(input: RegionEventInput) {
    this.logger.log(
      `Generating region event for ${input.region.name || input.region.placeId} - ${input.vibeKey}`,
    );

    try {
      // 1. Resolve region place - require real Google Places data
      let regionPlace: any;
      try {
        regionPlace = await this.googlePlaces.resolveRegionPlace(input.region);
        this.logger.debug(`Resolved region: ${regionPlace.name}`);
      } catch (error) {
        // Don't create synthetic regions - require real Google Places data
        this.logger.error(
          `Failed to resolve region place for: ${input.region.name || input.region.placeId}: ${error.message}`,
        );
        throw new Error(
          `Cannot create event without valid region data from Google Places: ${error.message}`,
        );
      }

      // 2. Build region photo gallery
      const gallery = this.buildRegionGallery(regionPlace.photos || []);

      // 3. Find venue candidates using broader search (no static vibe mapping)
      const searchRadius = input.searchRadiusM || 800;

      const venueCandidates = await this.googlePlaces.findNearbyVenues(
        regionPlace.geometry.location.lat,
        regionPlace.geometry.location.lng,
        searchRadius,
        ['restaurant', 'bar', 'cafe', 'tourist_attraction', 'art_gallery'], // Broader initial search
        [], // No keywords - let AI decide based on actual venues found
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
          ['restaurant', 'bar', 'cafe', 'tourist_attraction', 'art_gallery'],
          [],
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

      // 5. Use AI to analyze vibe based on actual venues found
      const aiVibeAnalysis = await this.aiService.analyzeEventVibe({
        regionName: regionPlace.name,
        venues: topTwoVenues.map((v) => ({
          name: v.name,
          address: (v as any).vicinity || '',
          types: v.types || [],
          tags: [],
          rating: v.rating,
          priceLevel: v.priceLevel,
        })),
      });

      // 6. Generate AI plan content with determined vibe
      const aiPlans = await this.generateAIPlanContent(
        regionPlace.name,
        aiVibeAnalysis.vibeKey,
        enrichedVenues,
        input.startTime,
        input.endTime,
      );

      // 7. Generate specific plan vibe analysis
      const planVibesAnalysis = await this.aiService.analyzePlanVibes({
        eventTitle: `${regionPlace.name} — ${this.vibeMapping.prettyVibeName(aiVibeAnalysis.vibeKey as any)}`,
        regionName: regionPlace.name,
        plans: aiPlans,
        venues: topTwoVenues.map((v) => ({
          name: v.name,
          address: (v as any).vicinity || '',
          types: v.types || [],
          rating: v.rating,
          priceLevel: v.priceLevel,
        })),
      });

      (aiVibeAnalysis as any).vibeAnalysis = planVibesAnalysis.overallEventVibe;
      (aiVibeAnalysis as any).planAnalyses = {
        plan1: planVibesAnalysis.plan1Analysis,
        plan2: planVibesAnalysis.plan2Analysis,
      };

      // 8. Optimize photos for discovery card
      const photoOptimization = await this.aiService.optimizeDiscoveryPhotos({
        eventTitle: `${regionPlace.name} — ${this.vibeMapping.prettyVibeName(aiVibeAnalysis.vibeKey as any)}`,
        regionName: regionPlace.name,
        vibeKey: aiVibeAnalysis.vibeKey,
        availablePhotos: (regionPlace.photos || []).map((photo: any) => ({
          url: this.assetsService.buildPhotoUrl(photo.photo_reference, 1280),
          width: photo.width || 1280,
          height: photo.height || 960,
          attributions: photo.html_attributions,
        })),
      });

      // 9. Generate enhanced discovery card content
      const discoveryContent =
        await this.aiService.generateDiscoveryCardContent({
          eventTitle: `${regionPlace.name} — ${this.vibeMapping.prettyVibeName(aiVibeAnalysis.vibeKey as any)}`,
          regionName: regionPlace.name,
          vibeKey: aiVibeAnalysis.vibeKey,
          plans: aiPlans,
          venues: topTwoVenues.map((v) => ({
            name: v.name,
            types: v.types || [],
            rating: v.rating,
            priceLevel: v.priceLevel,
          })),
        });

      // Update gallery with optimized photos
      const optimizedGallery = [
        photoOptimization.primaryPhoto,
        ...photoOptimization.galleryPhotos,
      ].filter(Boolean);

      (aiVibeAnalysis as any).discoveryContent = discoveryContent;
      (aiVibeAnalysis as any).photoOptimization = photoOptimization;

      // 10. Generate embedding based on AI analysis
      const embeddingText = `${regionPlace.name} – ${aiVibeAnalysis.vibeKey}\n${aiVibeAnalysis.vibeAnalysis}\n${topTwoVenues.map((v) => v.name).join('\n')}`;
      const embedding = await this.aiService.embed(embeddingText);

      // 11. Create event and plans with optimized gallery
      const event = await this.createEventWithPlans(
        aiVibeAnalysis,
        embedding,
        optimizedGallery.length > 0 ? optimizedGallery : gallery,
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
    if (!photos || photos.length === 0) {
      return []; // Return empty array instead of fake Unsplash images
    }

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
    startTime?: Date,
    endTime?: Date,
  ) {
    const eventTitle = `${regionName} — ${this.vibeMapping.prettyVibeName(vibeKey as any)}`;
    const venueInfo = venues
      .map((v) => `${v.name} (${v.types[0] || 'venue'})`)
      .join(', ');

    try {
      const basicPlans = await this.aiService.buildTwoPlans({
        title: eventTitle,
        venue: venueInfo,
        address: regionName,
      });

      const enhancedPlans = await this.aiService.enhancePlanDescriptions({
        eventTitle,
        regionName,
        venue: venueInfo,
        address: regionName,
        startTime,
        endTime,
        plans: basicPlans,
        nearbyVenues: venues.map((v) => ({
          name: v.name,
          types: v.types || [],
          rating: v.rating,
          priceLevel: v.priceLevel,
        })),
      });

      return enhancedPlans.map((plan) => ({
        title: plan.title,
        description: plan.detailedDescription || plan.description,
        emoji: plan.emoji || this.getVibeEmoji(vibeKey),
        timeline: plan.timeline,
        vibe: plan.vibe,
        highlights: plan.highlights,
      }));
    } catch (error) {
      this.logger.warn(
        `AI plan generation failed, using enhanced fallback:`,
        error.message,
      );

      return [
        {
          title: `Discover ${venues[0].name}`,
          description: `Experience the authentic atmosphere of ${venues[0].name} in ${regionName}. Perfect for a ${this.vibeMapping.prettyVibeName(vibeKey as any).toLowerCase()} vibe with local charm and character.`,
          emoji: this.getVibeEmoji(vibeKey),
          timeline: `Evening: Arrive and explore the ${venues[0].types?.[0] || 'venue'}`,
          vibe: vibeKey.toLowerCase(),
          highlights: [
            `${venues[0].name} experience`,
            `${regionName} atmosphere`,
            `Local discoveries`,
          ],
        },
        {
          title: `Explore ${venues[1].name}`,
          description: `Immerse yourself in what makes ${venues[1].name} special in the heart of ${regionName}. A perfect match for those seeking a ${this.vibeMapping.prettyVibeName(vibeKey as any).toLowerCase()} experience.`,
          emoji: this.getVibeEmoji(vibeKey),
          timeline: `Evening: Start your ${venues[1].types?.[0] || 'venue'} adventure`,
          vibe: vibeKey.toLowerCase(),
          highlights: [
            `${venues[1].name} highlights`,
            `${regionName} exploration`,
            `Memorable moments`,
          ],
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

  private async createEventWithPlans(
    aiVibeAnalysis: any,
    embedding: number[],
    gallery: string[],
    aiPlans: any[],
    venues: Array<VenueCandidate & { website?: string; mapUrl: string }>,
    input: RegionEventInput,
    regionPlace: any,
  ) {
    const prettyVibe = this.vibeMapping.prettyVibeName(
      aiVibeAnalysis.vibeKey as any,
    );

    // Default time slots if not provided
    const startTime = input.startTime || this.getDefaultStartTime();
    const endTime = input.endTime || this.getDefaultEndTime(startTime);

    return this.prisma.$transaction(async (tx) => {
      // Convert embedding to Buffer for Prisma Bytes
      const embeddingBuffer = embedding
        ? Buffer.from(Float32Array.from(embedding).buffer)
        : null;

      // Convert AI mapped interests from slugs to IDs
      const interests = await tx.interest.findMany({
        where: {
          slug: { in: aiVibeAnalysis.mappedInterests.map((i: any) => i.id) },
        },
      });

      // Create event
      const event = await tx.event.create({
        data: {
          title: `${regionPlace.name} — ${prettyVibe}`,
          description: aiVibeAnalysis.vibeAnalysis,
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
          vibeKey: aiVibeAnalysis.vibeKey as any,
          vibeAnalysis: aiVibeAnalysis.vibeAnalysis,
          searchRadiusM: input.searchRadiusM || 800,

          // AI fields
          aiNormalized: aiVibeAnalysis,
          embedding: embeddingBuffer,
          tags: [],

          votingState: 'NOT_STARTED',
        },
      });

      // Create plans
      const plans = await Promise.all(
        venues.slice(0, 2).map(async (venue, index) => {
          const planData = aiPlans[index] || {
            title: `${venue.name} experience`,
            description: `Experience ${venue.name}`,
            emoji: this.getVibeEmoji(aiVibeAnalysis.vibeKey),
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
      const mappedInterests = aiVibeAnalysis.mappedInterests || [];

      if (mappedInterests.length > 0) {
        const slugs = mappedInterests.map((m: any) => m.id);
        const slugToWeight = new Map(
          mappedInterests.map((m: any) => [m.id, m.weight ?? 1]),
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
                weight: (slugToWeight.get(interest.slug) as number) ?? 1,
              },
              update: {
                weight: (slugToWeight.get(interest.slug) as number) ?? 1,
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

  // NEW METHODS FOR EXTERNAL EVENTS INTEGRATION

  async generateMixedEvents(params: {
    lat: number;
    lng: number;
    radius: number;
    maxEvents: number;
    regionName?: string;
    eventSourceMix?: {
      synthetic: number; // % synthetic events
      external: number; // % external events
    };
    dateRange?: {
      startDate?: Date;
      endDate?: Date;
    };
  }): Promise<any[]> {
    const mix = params.eventSourceMix || { synthetic: 30, external: 70 };
    const syntheticCount = Math.round((params.maxEvents * mix.synthetic) / 100);
    const externalCount = params.maxEvents - syntheticCount;

    this.logger.log(
      `Generating mixed events: ${syntheticCount} synthetic, ${externalCount} external`,
    );

    const allEvents: any[] = [];

    // Generate synthetic events (current system)
    if (syntheticCount > 0) {
      try {
        const syntheticEvents = await this.generateSyntheticEventsInArea(
          params.lat,
          params.lng,
          params.radius,
          syntheticCount,
          params.regionName,
        );
        allEvents.push(...(syntheticEvents as any[]));
        this.logger.debug(
          `Generated ${syntheticEvents.length} synthetic events`,
        );
      } catch (error) {
        this.logger.error(
          `Failed to generate synthetic events: ${error.message}`,
        );
      }
    }

    // Discover and convert external events
    if (externalCount > 0 && this.externalAggregator) {
      try {
        const externalEvents = await this.externalAggregator.discoverEvents({
          lat: params.lat,
          lng: params.lng,
          radius: params.radius,
          limit: externalCount * 2, // Get more to allow filtering
          startDate: params.dateRange?.startDate || new Date(),
          endDate:
            params.dateRange?.endDate ||
            new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // Next 30 days
        });

        const convertedEvents =
          await this.externalAggregator.convertToInternalFormat(
            externalEvents.slice(0, externalCount),
          );
        const savedEvents = await this.saveExternalEvents(convertedEvents);
        allEvents.push(...(savedEvents as any[]));
        this.logger.debug(`Generated ${savedEvents.length} external events`);
      } catch (error) {
        this.logger.error(
          `Failed to generate external events: ${error.message}`,
        );
      }
    }

    this.logger.log(`Total events generated: ${allEvents.length}`);
    return allEvents;
  }

  private async generateSyntheticEventsInArea(
    lat: number,
    lng: number,
    radius: number,
    count: number,
    regionName?: string,
  ): Promise<any[]> {
    // Use existing regions or create new ones for the area
    const regionPresets = [
      { name: 'Creative Hub', vibeKey: 'ARTSY' },
      { name: 'Social District', vibeKey: 'SOCIAL' },
      { name: 'Chill Zone', vibeKey: 'CHILL' },
      { name: 'Date Night Spot', vibeKey: 'DATE_NIGHT' },
    ];

    const events: any[] = [];
    for (let i = 0; i < Math.min(count, regionPresets.length); i++) {
      try {
        const preset = regionPresets[i];
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1 + i);
        tomorrow.setHours(19 + i, 0, 0, 0);

        const endTime = new Date(tomorrow);
        endTime.setHours(endTime.getHours() + 3);

        const event = await this.generateRegionEvent({
          region: regionName ? { name: regionName, lat, lng } : { lat, lng }, // Use provided regionName if available
          vibeKey: preset.vibeKey as any,
          searchRadiusM: radius,
          startTime: tomorrow,
          endTime: endTime,
        });

        events.push(event);
      } catch (error) {
        this.logger.warn(
          `Failed to generate synthetic event ${i}: ${error.message}`,
        );
      }
    }

    return events;
  }

  private async saveExternalEvents(
    convertedEvents: ConvertedEvent[],
  ): Promise<any[]> {
    const savedEvents: any[] = [];

    for (const eventData of convertedEvents) {
      try {
        const event = await this.prisma.event.upsert({
          where: {
            source_sourceId: {
              source: eventData.source,
              sourceId: eventData.sourceId,
            },
          },
          update: {
            // Update fields that might change
            title: eventData.title,
            description: eventData.description,
            attendeeCount: eventData.attendeeCount,
            syncStatus: eventData.syncStatus,
            lastSyncAt: eventData.lastSyncAt,
          },
          create: {
            title: eventData.title,
            description: eventData.description,
            source: eventData.source,
            sourceId: eventData.sourceId,
            externalBookingUrl: eventData.externalBookingUrl,
            startTime: eventData.startTime,
            endTime: eventData.endTime,
            venue: eventData.venue,
            address: eventData.address,
            lat: eventData.lat ? new Prisma.Decimal(eventData.lat) : null,
            lng: eventData.lng ? new Prisma.Decimal(eventData.lng) : null,
            rating: eventData.rating
              ? new Prisma.Decimal(eventData.rating)
              : null,
            priceLevel: eventData.priceLevel,
            tags: eventData.tags || [],
            organizerName: eventData.organizerName,
            attendeeCount: eventData.attendeeCount || 0,
            capacity: eventData.capacity,
            priceDisplay: eventData.priceDisplay,
            requiresRSVP: eventData.requiresRSVP || false,
            categories: eventData.categories || [],
            syncStatus: eventData.syncStatus,
            lastSyncAt: eventData.lastSyncAt,
            vibeKey: eventData.vibeKey as any,
            regionName: eventData.regionName,
            regionProvider: eventData.regionProvider,
            regionPlaceId: eventData.regionPlaceId,
            gallery: eventData.gallery || [],
          },
          include: {
            plans: true,
            interests: true,
          },
        });

        // Map interests if provided by AI analysis
        await this.mapEventInterests(event.id, eventData);

        savedEvents.push(event);
        this.logger.debug(`Saved external event: ${event.title}`);
      } catch (error) {
        this.logger.error(
          `Failed to save external event ${eventData.sourceId}: ${error.message}`,
        );
      }
    }

    return savedEvents;
  }

  private async mapEventInterests(eventId: string, eventData: ConvertedEvent) {
    // For external events, we don't create plans automatically
    // The external booking URL is the primary action

    // Map interests based on AI analysis if available
    if (eventData.categories?.length) {
      try {
        const aiAnalysis = await this.aiService.normalizeEvent({
          title: eventData.title || '',
          description: eventData.description,
          venue: eventData.venue,
          tags: eventData.tags,
        });

        const interests = await this.prisma.interest.findMany({
          where: { slug: { in: aiAnalysis.mappedInterests.map((i) => i.id) } },
        });

        for (const interest of interests) {
          const weight =
            aiAnalysis.mappedInterests.find((i) => i.id === interest.slug)
              ?.weight || 1;

          await this.prisma.eventInterest.upsert({
            where: {
              eventId_interestId: {
                eventId: eventId,
                interestId: interest.id,
              },
            },
            create: {
              eventId: eventId,
              interestId: interest.id,
              weight: weight,
            },
            update: {
              weight: weight,
            },
          });
        }
      } catch (error) {
        this.logger.warn(
          `Failed to map interests for external event ${eventId}: ${error.message}`,
        );
      }
    }
  }
}
