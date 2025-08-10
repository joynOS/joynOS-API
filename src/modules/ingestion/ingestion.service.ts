import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AIService } from '../ai/ai.service';

@Injectable()
export class IngestionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AIService,
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

    for (const e of items) {
      const src = 'ticketmaster';
      const srcId = e.id as string;
      const images = e.images?.[0]?.url as string | undefined;
      const venue = e._embedded?.venues?.[0];
      const lat = venue?.location?.latitude
        ? Number(venue.location.latitude)
        : null;
      const lng = venue?.location?.longitude
        ? Number(venue.location.longitude)
        : null;

      const event = await this.prisma.event.upsert({
        where: { source_sourceId: { source: src, sourceId: srcId } },
        update: {
          title: e.name,
          description: e.info ?? e.pleaseNote ?? null,
          imageUrl: images ?? null,
          venue: venue?.name ?? null,
          address:
            [venue?.address?.line1, venue?.city?.name]
              .filter(Boolean)
              .join(', ') || null,
          lat,
          lng,
          startTime: e.dates?.start?.dateTime
            ? new Date(e.dates.start.dateTime)
            : null,
          endTime: null,
          externalBookingUrl: e.url ?? null,
        },
        create: {
          source: src,
          sourceId: srcId,
          title: e.name,
          description: e.info ?? e.pleaseNote ?? null,
          imageUrl: images ?? null,
          venue: venue?.name ?? null,
          address:
            [venue?.address?.line1, venue?.city?.name]
              .filter(Boolean)
              .join(', ') || null,
          lat,
          lng,
          startTime: e.dates?.start?.dateTime
            ? new Date(e.dates.start.dateTime)
            : null,
          endTime: null,
          externalBookingUrl: e.url ?? null,
        },
      });

      let norm: any = {
        categories: [],
        tags: [],
        mappedInterests: [],
        rationale: '',
      };
      let emb: number[] = [];
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          norm = await this.ai.normalizeEvent({
            title: event.title,
            description: event.description ?? undefined,
            venue: event.venue ?? undefined,
            tags: event.tags ?? undefined,
          });
          emb = await this.ai.embed(
            [
              event.title,
              event.description ?? '',
              norm.categories.join(' '),
              norm.tags.join(' '),
            ].join('\n'),
          );
          break;
        } catch (err: any) {
          const msg = String(err?.message || err);
          if (msg.includes('429') || msg.includes('Too Many Requests'))
            await this.sleep(11000);
          else await this.sleep(delayMs);
        }
      }

      const mappedSlugs: string[] = Array.isArray(
        (norm as any)?.mappedInterests,
      )
        ? (norm as any).mappedInterests.map((mi: any) => String(mi.id))
        : [];
      const slugToWeight = new Map<string, number>();
      for (const mi of (norm as any)?.mappedInterests ?? []) {
        slugToWeight.set(String(mi.id), Number(mi.weight) || 1);
      }
      const foundInterests = mappedSlugs.length
        ? await this.prisma.interest.findMany({
            where: { slug: { in: mappedSlugs } },
          })
        : [];
      const interestCreates = foundInterests.map((i) => ({
        interestId: i.id,
        weight: slugToWeight.get(i.slug) || 1,
      }));

      await this.prisma.event.update({
        where: { id: event.id },
        data: {
          aiNormalized: norm as any,
          aiRaw: { rationale: (norm as any)?.rationale ?? '' } as any,
          embedding: Buffer.from(
            Float32Array.from((emb as number[]) || []).buffer,
          ),
          interests: {
            deleteMany: { eventId: event.id },
            create: interestCreates,
          },
        },
      });

      if (buildPlans) {
        const plansCount = await this.prisma.plan.count({
          where: { eventId: event.id },
        });
        if (plansCount < 2) {
          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              const built = await this.ai.buildTwoPlans({
                title: event.title,
                venue: event.venue ?? undefined,
                address: event.address ?? undefined,
                start: event.startTime ?? (undefined as any),
              });
              for (const p of built.slice(0, 2 - plansCount)) {
                await this.prisma.plan.create({
                  data: {
                    eventId: event.id,
                    title: p.title,
                    description: p.description,
                    emoji: p.emoji ?? null,
                  },
                });
              }
              break;
            } catch (err: any) {
              const msg = String(err?.message || err);
              if (msg.includes('429') || msg.includes('Too Many Requests'))
                await this.sleep(11000);
              else await this.sleep(delayMs);
            }
          }
        }
      }

      await this.sleep(delayMs);
    }
  }
}
