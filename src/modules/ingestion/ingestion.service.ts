import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AIService } from '../ai/ai.service';
import { AssetsService } from '../assets/assets.service';

@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AIService,
    private readonly assetsService: AssetsService,
  ) {}

  private async sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
  }

  async pullTicketmasterNYC(maxEvents?: number) {
    const apiKey = process.env.TICKETMASTER_API_KEY as string;
    if (!apiKey) throw new Error('Missing TICKETMASTER_API_KEY');
    const dmaId = process.env.TICKETMASTER_DMA || '345';
    const size = process.env.TICKETMASTER_SIZE || '50';
    const url = new URL(
      'https://app.ticketmaster.com/discovery/v2/events.json',
    );
    url.searchParams.set('apikey', apiKey);
    url.searchParams.set('dmaId', dmaId);
    url.searchParams.set('size', size);

    const res = await fetch(url.toString());
    const data = await res.json();
    const cap = Number(
      maxEvents ?? process.env.TICKETMASTER_MAX_EVENTS_PER_RUN ?? 5,
    );
    const delayMs = Number(process.env.GEMINI_DELAY_MS ?? 1200);
    const buildPlans =
      String(process.env.INGESTION_BUILD_PLANS ?? 'true') === 'true';
    const items = (data._embedded?.events ?? []).slice(0, cap);

    this.logger.log(
      `Processing ${items.length} Ticketmaster events with enhanced AI pipeline`,
    );

    for (const e of items) {
      const src = 'ticketmaster';
      const srcId = e.id as string;
      const venue = e._embedded?.venues?.[0];

      this.logger.log(`Processing: ${e.name}`);

      try {
        // Create/update basic event first
        const event = await this.createOrUpdateEvent(e, src, srcId, venue);

        if (buildPlans) {
          const plansCount = await this.prisma.plan.count({
            where: { eventId: event.id },
          });

          if (plansCount < 2) {
            await this.processTicketmasterEventWithEnhancedAI(
              event,
              e,
              venue,
              delayMs,
            );
          }
        }

        this.logger.log(`Successfully processed: ${event.title}`);
        await this.sleep(delayMs);
      } catch (error) {
        this.logger.error(`Failed to process event ${e.name}:`, error.message);
        await this.sleep(delayMs * 2); // Wait longer on errors
      }
    }
  }

  private async createOrUpdateEvent(
    ticketmasterEvent: any,
    source: string,
    sourceId: string,
    venue: any,
  ) {
    // Extract all images for gallery, not just the first one
    const allImages = this.buildTicketmasterGallery(
      ticketmasterEvent.images || [],
    );
    const primaryImage = allImages[0] || null; // Use first image as primary
    const lat = venue?.location?.latitude
      ? Number(venue.location.latitude)
      : null;
    const lng = venue?.location?.longitude
      ? Number(venue.location.longitude)
      : null;

    return await this.prisma.event.upsert({
      where: { source_sourceId: { source, sourceId } },
      update: {
        title: ticketmasterEvent.name,
        description:
          ticketmasterEvent.info ?? ticketmasterEvent.pleaseNote ?? null,
        imageUrl: primaryImage,
        gallery: allImages,
        venue: venue?.name ?? null,
        address:
          [venue?.address?.line1, venue?.city?.name]
            .filter(Boolean)
            .join(', ') || null,
        lat,
        lng,
        startTime: ticketmasterEvent.dates?.start?.dateTime
          ? new Date(ticketmasterEvent.dates.start.dateTime)
          : null,
        endTime: ticketmasterEvent.dates?.end?.dateTime
          ? new Date(ticketmasterEvent.dates.end.dateTime)
          : null,
        externalBookingUrl: ticketmasterEvent.url ?? null,
      },
      create: {
        source,
        sourceId,
        title: ticketmasterEvent.name,
        description:
          ticketmasterEvent.info ?? ticketmasterEvent.pleaseNote ?? null,
        imageUrl: primaryImage,
        gallery: allImages,
        venue: venue?.name ?? null,
        address:
          [venue?.address?.line1, venue?.city?.name]
            .filter(Boolean)
            .join(', ') || null,
        lat,
        lng,
        startTime: ticketmasterEvent.dates?.start?.dateTime
          ? new Date(ticketmasterEvent.dates.start.dateTime)
          : null,
        endTime: ticketmasterEvent.dates?.end?.dateTime
          ? new Date(ticketmasterEvent.dates.end.dateTime)
          : null,
        externalBookingUrl: ticketmasterEvent.url ?? null,
      },
    });
  }

  private async processTicketmasterEventWithEnhancedAI(
    event: any,
    ticketmasterEvent: any,
    venue: any,
    delayMs: number,
  ) {
    try {
      // 1. Build event gallery from Ticketmaster images
      const gallery = this.buildTicketmasterGallery(
        ticketmasterEvent.images || [],
      );

      // 2. Determine vibe based on event data
      const vibeKey = this.determineTicketmasterVibe(ticketmasterEvent, venue);
      const regionName = venue?.city?.name || 'NYC';

      // 3. Generate AI plan content with vibe
      const aiPlans = await this.generateTicketmasterAIPlanContent(
        event.title,
        vibeKey,
        venue,
        event.startTime,
        event.endTime,
        delayMs,
      );

      // 4. Generate specific plan vibe analysis
      const planVibesAnalysis = await this.ai.analyzePlanVibes({
        eventTitle: event.title,
        regionName,
        plans: aiPlans,
        venues: [
          {
            name: venue?.name || 'Event Venue',
            address: event.address || '',
            types: this.getVenueTypes(ticketmasterEvent),
            rating: 4, // Default rating for Ticketmaster venues
            priceLevel: this.getPriceLevel(ticketmasterEvent),
          },
        ],
      });

      // 5. Optimize photos for discovery card
      let photoOptimization: any = null;
      if (gallery.length > 0) {
        photoOptimization = await this.ai.optimizeDiscoveryPhotos({
          eventTitle: event.title,
          regionName,
          vibeKey,
          availablePhotos: gallery.map((url, idx) => ({
            url,
            width: 800,
            height: 600,
            attributions: [`Ticketmaster Image ${idx + 1}`],
          })),
        });
      }

      // 6. Generate enhanced discovery card content
      const discoveryContent = await this.ai.generateDiscoveryCardContent({
        eventTitle: event.title,
        regionName,
        vibeKey,
        plans: aiPlans,
        venues: [
          {
            name: venue?.name || 'Event Venue',
            types: this.getVenueTypes(ticketmasterEvent),
            rating: 4,
            priceLevel: this.getPriceLevel(ticketmasterEvent),
          },
        ],
      });

      // 7. Generate normalization and embedding
      const norm = await this.ai.normalizeEvent({
        title: event.title,
        description: event.description ?? undefined,
        venue: event.venue ?? undefined,
      });

      const embeddingText = `${event.title} – ${vibeKey}\n${planVibesAnalysis.overallEventVibe}\n${venue?.name || ''}`;
      const embedding = await this.ai.embed(embeddingText);

      // 8. Update gallery with optimized photos
      const optimizedGallery = photoOptimization
        ? [
            photoOptimization.primaryPhoto,
            ...photoOptimization.galleryPhotos,
          ].filter(Boolean)
        : gallery;

      // 9. Update event with all AI analysis
      await this.updateEventWithEnhancedData(
        event.id,
        norm,
        embedding,
        vibeKey,
        planVibesAnalysis,
        discoveryContent,
        photoOptimization,
        optimizedGallery,
      );

      // 10. Create enhanced plans
      await this.createEnhancedPlans(event.id, aiPlans);

      await this.sleep(delayMs);
    } catch (error) {
      this.logger.error(
        `Enhanced AI processing failed for ${event.title}:`,
        error.message,
      );
      // Fallback to basic plan creation
      await this.createBasicPlans(event, delayMs);
    }
  }

  private buildTicketmasterGallery(images: any[]): string[] {
    if (!images || images.length === 0) {
      return [];
    }

    // Sort by resolution (width * height) descending to get best quality first
    const sortedImages = images
      .filter((img) => img.url) // Only images with URL
      .sort((a, b) => {
        const aResolution = (a.width || 0) * (a.height || 0);
        const bResolution = (b.width || 0) * (b.height || 0);
        return bResolution - aResolution; // Descending order
      })
      .slice(0, 6) // Keep max 6 photos
      .map((img) => img.url);

    this.logger.debug(
      `Built gallery with ${sortedImages.length} images from ${images.length} available`,
    );
    return sortedImages;
  }

  private determineTicketmasterVibe(
    ticketmasterEvent: any,
    venue: any,
  ): string {
    const title = ticketmasterEvent.name?.toLowerCase() || '';
    const classifications = ticketmasterEvent.classifications || [];

    // Analyze event classification and title to determine vibe
    if (
      title.includes('concert') ||
      title.includes('music') ||
      classifications.some((c: any) => c.segment?.name === 'Music')
    ) {
      return 'PARTY';
    }
    if (
      title.includes('theater') ||
      title.includes('broadway') ||
      classifications.some((c: any) => c.segment?.name === 'Arts & Theatre')
    ) {
      return 'CULTURAL';
    }
    if (
      title.includes('sports') ||
      classifications.some((c: any) => c.segment?.name === 'Sports')
    ) {
      return 'SOCIAL';
    }
    if (title.includes('comedy') || title.includes('stand-up')) {
      return 'CHILL';
    }
    if (
      title.includes('art') ||
      title.includes('gallery') ||
      title.includes('exhibition')
    ) {
      return 'ARTSY';
    }

    return 'SOCIAL'; // Default vibe
  }

  private async generateTicketmasterAIPlanContent(
    eventTitle: string,
    vibeKey: string,
    venue: any,
    startTime: Date | null,
    endTime: Date | null,
    delayMs: number,
  ): Promise<any[]> {
    try {
      // Generate basic plans first
      const basicPlans = await this.ai.buildTwoPlans({
        title: eventTitle,
        venue: venue?.name ?? undefined,
        address: venue?.address
          ? [venue.address.line1, venue.city?.name].filter(Boolean).join(', ')
          : undefined,
        start: startTime?.toISOString() ?? undefined,
      });

      await this.sleep(delayMs);

      // Enhance plans with detailed descriptions
      const enhancedPlans = await this.ai.enhancePlanDescriptions({
        eventTitle,
        regionName: venue?.city?.name || 'NYC',
        venue: venue?.name || 'Event Venue',
        address: venue?.address
          ? [venue.address.line1, venue.city?.name].filter(Boolean).join(', ')
          : 'NYC',
        startTime: startTime || undefined,
        endTime: endTime || undefined,
        plans: basicPlans,
        nearbyVenues: [
          {
            name: venue?.name || 'Event Venue',
            types: this.getVenueTypes({ _embedded: { venues: [venue] } }),
            rating: 4,
            priceLevel: 2,
          },
        ],
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
        `AI plan generation failed, using basic fallback:`,
        error.message,
      );
      return await this.ai.buildTwoPlans({
        title: eventTitle,
        venue: venue?.name ?? undefined,
      });
    }
  }

  private getVenueTypes(ticketmasterEvent: any): string[] {
    const venue = ticketmasterEvent._embedded?.venues?.[0];
    if (!venue) return ['venue'];

    const classifications = ticketmasterEvent.classifications || [];
    const types = classifications
      .map((c: any) => c.segment?.name || c.genre?.name)
      .filter(Boolean);

    return types.length > 0 ? types : ['venue'];
  }

  private getPriceLevel(ticketmasterEvent: any): number {
    const priceRanges = ticketmasterEvent.priceRanges || [];
    if (priceRanges.length === 0) return 2;

    const maxPrice = Math.max(...priceRanges.map((p: any) => p.max || 0));
    if (maxPrice < 50) return 1;
    if (maxPrice < 150) return 2;
    if (maxPrice < 300) return 3;
    return 4;
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

  private async updateEventWithEnhancedData(
    eventId: string,
    norm: any,
    embedding: number[],
    vibeKey: string,
    planVibesAnalysis: any,
    discoveryContent: any,
    photoOptimization: any,
    gallery: string[],
  ) {
    const mappedSlugs: string[] = Array.isArray(norm?.mappedInterests)
      ? norm.mappedInterests.map((mi: any) => String(mi.id))
      : [];

    const foundInterests = mappedSlugs.length
      ? await this.prisma.interest.findMany({
          where: { slug: { in: mappedSlugs } },
        })
      : [];

    const interestCreates = foundInterests.map((i) => ({
      interestId: i.id,
      weight:
        norm.mappedInterests.find((mi: any) => mi.id === i.slug)?.weight || 1,
    }));

    const aiVibeAnalysis = {
      vibeKey,
      vibeAnalysis: planVibesAnalysis.overallEventVibe,
      planAnalyses: {
        plan1: planVibesAnalysis.plan1Analysis,
        plan2: planVibesAnalysis.plan2Analysis,
      },
      discoveryContent,
      photoOptimization,
      mappedInterests: norm.mappedInterests,
    };

    await this.prisma.event.update({
      where: { id: eventId },
      data: {
        vibeKey: vibeKey as any,
        aiNormalized: norm as any,
        aiRaw: aiVibeAnalysis as any,
        vibeAnalysis: planVibesAnalysis.overallEventVibe,
        gallery,
        embedding: Buffer.from(Float32Array.from(embedding || []).buffer),
        interests: {
          deleteMany: { eventId },
          create: interestCreates,
        },
      },
    });
  }

  private async createEnhancedPlans(eventId: string, aiPlans: any[]) {
    for (const plan of aiPlans.slice(0, 2)) {
      await this.prisma.plan.create({
        data: {
          eventId,
          title: plan.title,
          description: plan.description,
          emoji: plan.emoji ?? null,
          // Note: timeline, vibe, highlights not in Plan schema - stored in event.aiRaw
        },
      });
    }
  }

  private async createBasicPlans(event: any, delayMs: number) {
    try {
      const built = await this.ai.buildTwoPlans({
        title: event.title,
        venue: event.venue ?? undefined,
        address: event.address ?? undefined,
        start: event.startTime ?? undefined,
      });

      for (const p of built.slice(0, 2)) {
        await this.prisma.plan.create({
          data: {
            eventId: event.id,
            title: p.title,
            description: p.description,
            emoji: p.emoji ?? null,
          },
        });
      }
    } catch (error) {
      this.logger.error(`Basic plan creation failed:`, error.message);
    }
  }
}
