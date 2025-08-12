import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { calculateVibeScores } from './utils/vibe';
import { etaSeconds } from '../../lib/mapbox';

@Injectable()
export class MatchingService {
  constructor(private readonly prisma: PrismaService) {}

  private toMiles(distMeters: number) {
    return distMeters / 1609.34;
  }

  private haversineMiles(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ) {
    const toRad = (d: number) => (d * Math.PI) / 180;
    const R = 3958.7613; // earth radius in miles
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) *
        Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
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

    let rows: any[] = [];
    try {
      rows = (await this.prisma.$queryRawUnsafe<any[]>(
        `SELECT e.*, earth_distance(
            ll_to_earth(CAST($1 AS float8), CAST($2 AS float8)),
            ll_to_earth(e.lat::float8, e.lng::float8)
          ) AS dist_meters
         FROM "Event" e
         WHERE e."startTime" BETWEEN $3 AND $4
           AND e.lat IS NOT NULL AND e.lng IS NOT NULL
           AND earth_distance(
             ll_to_earth(CAST($1 AS float8), CAST($2 AS float8)),
             ll_to_earth(e.lat::float8, e.lng::float8)
           ) <= $5 * 1609.34
         ORDER BY e."startTime" ASC`,
        user.currentLat,
        user.currentLng,
        from,
        to,
        radius,
      )) as any[];
    } catch (err) {
      const candidates = await this.prisma.event.findMany({
        where: {
          startTime: { gte: from, lte: to },
          lat: { not: null },
          lng: { not: null },
        },
        orderBy: { startTime: 'asc' },
      });
      const uLat = Number(user.currentLat);
      const uLng = Number(user.currentLng);
      for (const e of candidates) {
        const miles = this.haversineMiles(
          uLat,
          uLng,
          Number(e.lat),
          Number(e.lng),
        );
        if (miles <= radius) {
          (e as any).dist_meters = miles * 1609.34;
          rows.push(e);
        }
      }
    }

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

      const evEmb = e.embedding
        ? new Float32Array(Buffer.from(e.embedding).buffer)
        : undefined;

      const distMiles = e.dist_meters ? Number(e.dist_meters) / 1609.34 : 0;

      const members = await this.prisma.member.findMany({
        where: {
          eventId: e.id,
          status: { in: ['JOINED', 'COMMITTED'] as any },
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              avatar: true,
              embedding: true,
            },
          },
        },
      });

      const cohortMemberEmbeddings = members.map((m) =>
        m.user.embedding
          ? new Float32Array(Buffer.from(m.user.embedding).buffer)
          : undefined,
      );

      const scores = calculateVibeScores({
        userEmbedding: uEmb,
        eventEmbedding: evEmb,
        userInterests: uInterests.map((i) => ({
          interestId: i.interestId,
          weight: i.weight,
        })),
        eventInterests: evInts.map((i) => ({
          interestId: i.interestId,
          weight: i.weight,
        })),
        distanceMiles: distMiles,
        radiusMiles: radius,
        rating: e.rating ? Number(e.rating) : null,
        cohortMemberEmbeddings,
      });

      let vibeMatchScoreEvent = scores.vibeMatchScoreEvent;
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

      const first5Participants = members.slice(0, 5).map((m) => ({
        id: m.user.id,
        name: m.user.name,
        avatar: m.user.avatar,
        status: m.status,
      }));

      cards.push({
        eventId: e.id,
        title: e.title,
        imageUrl: e.imageUrl,
        startTime: e.startTime,
        venue: e.venue,
        address: e.address,
        distanceMiles: distMiles,
        vibeMatchScoreEvent,
        vibeMatchScoreWithOtherUsers: scores.vibeMatchScoreWithOtherUsers,
        interestedCount: members.length,
        participants: first5Participants,
        etaSeconds: eta,
      });
    }

    return cards.sort((a, b) => b.vibeMatchScoreEvent - a.vibeMatchScoreEvent);
  }
}
