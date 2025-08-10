import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AIService } from '../ai/ai.service';

@Injectable()
export class IngestionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AIService,
  ) {}

  async pullTicketmasterNYC() {
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
    const items = data._embedded?.events ?? [];

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

      const norm = await this.ai.normalizeEvent({
        title: event.title,
        description: event.description ?? undefined,
        venue: event.venue ?? undefined,
        tags: event.tags ?? undefined,
      });
      const emb = await this.ai.embed(
        [
          event.title,
          event.description ?? '',
          norm.categories.join(' '),
          norm.tags.join(' '),
        ].join('\n'),
      );

      await this.prisma.event.update({
        where: { id: event.id },
        data: {
          aiNormalized: norm as any,
          aiRaw: { rationale: norm.rationale } as any,
          embedding: Buffer.from(Float32Array.from(emb as number[]).buffer),
          interests: {
            deleteMany: { eventId: event.id },
            create: norm.mappedInterests.map((mi) => ({
              interestId: mi.id,
              weight: mi.weight,
            })),
          },
        },
      });

      const plansCount = await this.prisma.plan.count({
        where: { eventId: event.id },
      });
      if (plansCount < 2) {
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
        } catch {}
      }
    }
  }
}
