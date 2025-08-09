import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../database/prisma.service'
import { cosineSim } from './utils/cosine'

@Injectable()
export class MatchingService {
  constructor(private readonly prisma: PrismaService) {}

  private toMiles(distMeters: number) {
    return distMeters / 1609.34
  }

  async recommendationsForUser(userId: string, q: { from?: Date; to?: Date; tags?: string[]; radiusMiles?: number }) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user?.currentLat || !user?.currentLng) return []

    const from = q.from ?? new Date()
    const to = q.to ?? new Date(Date.now() + 7 * 24 * 3600 * 1000)
    const radius = q.radiusMiles ?? user.radiusMiles

    const rows = (await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT e.* FROM "Event" e
       WHERE e."startTime" BETWEEN $1 AND $2
         AND e.lat IS NOT NULL AND e.lng IS NOT NULL
         AND earth_distance(ll_to_earth($3, $4), ll_to_earth(e.lat, e.lng)) <= $5
       ORDER BY e."startTime" ASC`,
      from,
      to,
      user.currentLat,
      user.currentLng,
      radius * 1609.34,
    )) as any[]

    const uInterests = await this.prisma.userInterest.findMany({ where: { userId } })
    const uEmb = user.embedding ? new Float32Array(Buffer.from(user.embedding).buffer) : undefined

    const cards: any[] = []
    for (const e of rows) {
      const evInts = await this.prisma.eventInterest.findMany({ where: { eventId: e.id } })
      const sumUser = uInterests.reduce((s, r) => s + r.weight, 0) || 1
      const overlap = uInterests.reduce((s, ui) => {
        const ev = evInts.find((x) => x.interestId === ui.interestId)
        return s + Math.min(ui.weight, ev?.weight ?? 0)
      }, 0) / sumUser

      const evEmb = e.embedding ? new Float32Array(Buffer.from(e.embedding).buffer) : undefined
      const sim = uEmb && evEmb ? cosineSim(uEmb, evEmb) : 0

      const distMiles = 0
      const penalty = Math.max(0, Math.min(1, 1 - distMiles / radius))

      const rating = e.rating ? Number(e.rating) : 0
      const rate = Math.max(0, Math.min(1, (rating - 4.0) / 1.0))

      const vibeMatchScoreEvent = Math.round(100 * (0.35 * overlap + 0.35 * sim + 0.15 * rate + 0.15 * penalty))

      const members = await this.prisma.member.findMany({ where: { eventId: e.id, status: { in: ['JOINED', 'COMMITTED'] as any } }, include: { user: true } })
      const cohort = members.length
        ? Math.round(
            100 *
              (members.reduce((s, m) => {
                const me = m.user.embedding ? new Float32Array(Buffer.from(m.user.embedding).buffer) : undefined
                return s + (uEmb && me ? cosineSim(uEmb, me) : 0)
              }, 0) /
                members.length),
          )
        : 0

      cards.push({
        eventId: e.id,
        title: e.title,
        imageUrl: e.imageUrl,
        startTime: e.startTime,
        venue: e.venue,
        address: e.address,
        vibeMatchScoreEvent,
        vibeMatchScoreWithOtherUsers: cohort,
        interestedCount: members.length,
      })
    }

    return cards.sort((a, b) => b.vibeMatchScoreEvent - a.vibeMatchScoreEvent)
  }
}
