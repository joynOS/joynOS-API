import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { cosineSim } from './utils/cosine';
import { etaSeconds } from '../../lib/mapbox';

@Injectable()
export class MatchingService {
  constructor(private readonly prisma: PrismaService) {}

  private toMiles(distMeters: number) {
    return distMeters / 1609.34;
  }

  async recommendationsForUser(
    userId: string,
    q: { from?: Date; to?: Date; tags?: string[]; radiusMiles?: number },
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.currentLat || !user?.currentLng) return [];

    const from = q.from ?? new Date();
    const to = q.to ?? new Date(Date.now() + 7 * 24 * 3600 * 1000);
    const radius = q.radiusMiles ?? user.radiusMiles;

    const rows = (await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT e.*, earth_distance(ll_to_earth($1,$2), ll_to_earth(e.lat,e.lng)) AS dist_meters
       FROM "Event" e
       WHERE e."startTime" BETWEEN $3 AND $4
         AND e.lat IS NOT NULL AND e.lng IS NOT NULL
         AND earth_distance(ll_to_earth($1,$2), ll_to_earth(e.lat,e.lng)) <= $5 * 1609.34
       ORDER BY e."startTime" ASC`,
      user.currentLat,
      user.currentLng,
      from,
      to,
      radius,
    )) as any[];

    const uInterests = await this.prisma.userInterest.findMany({
      where: { userId },
    });
    const uEmb = user.embedding
      ? new Float32Array(Buffer.from(user.embedding).buffer)
      : undefined;

    const cards: any[] = [];
    for (const e of rows) {
      const evInts = await this.prisma.eventInterest.findMany({
        where: { eventId: e.id },
      });
      const sumUser = uInterests.reduce((s, r) => s + r.weight, 0) || 1;
      const overlap =
        uInterests.reduce((s, ui) => {
          const ev = evInts.find((x) => x.interestId === ui.interestId);
          return s + Math.min(ui.weight, ev?.weight ?? 0);
        }, 0) / sumUser;

      const evEmb = e.embedding
        ? new Float32Array(Buffer.from(e.embedding).buffer)
        : undefined;
      const sim = uEmb && evEmb ? cosineSim(uEmb, evEmb) : 0;

      const distMiles = e.dist_meters ? Number(e.dist_meters) / 1609.34 : 0;
      const penalty = Math.max(0, Math.min(1, 1 - distMiles / radius));

      const rating = e.rating ? Number(e.rating) : 0;
      const rate = Math.max(0, Math.min(1, (rating - 4.0) / 1.0));

      let vibeMatchScoreEvent = Math.round(
        100 * (0.35 * overlap + 0.35 * sim + 0.15 * rate + 0.15 * penalty),
      );
      let eta: number | null = null;
      if (user.currentLat && user.currentLng && e.lat && e.lng) {
        eta = await etaSeconds(
          Number(user.currentLat),
          Number(user.currentLng),
          Number(e.lat),
          Number(e.lng),
        );
        if (!eta || eta > 1500) {
          vibeMatchScoreEvent = Math.max(
            0,
            Math.round(vibeMatchScoreEvent * 0.6),
          );
        }
      }

      const members = await this.prisma.member.findMany({
        where: {
          eventId: e.id,
          status: { in: ['JOINED', 'COMMITTED'] as any },
        },
        include: { user: true },
      });
      const cohort = members.length
        ? Math.round(
            100 *
              (members.reduce((s, m) => {
                const me = m.user.embedding
                  ? new Float32Array(Buffer.from(m.user.embedding).buffer)
                  : undefined;
                return s + (uEmb && me ? cosineSim(uEmb, me) : 0);
              }, 0) /
                members.length),
          )
        : 0;

      cards.push({
        eventId: e.id,
        title: e.title,
        imageUrl: e.imageUrl,
        startTime: e.startTime,
        venue: e.venue,
        address: e.address,
        distanceMiles: distMiles,
        vibeMatchScoreEvent,
        vibeMatchScoreWithOtherUsers: cohort,
        interestedCount: members.length,
        etaSeconds: eta,
      });
    }

    return cards.sort((a, b) => b.vibeMatchScoreEvent - a.vibeMatchScoreEvent);
  }
}
