import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { VotingState } from '../../common/constants/domain.constants';

@Injectable()
export class EventsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createEvent(data: {
    title: string;
    externalBookingUrl?: string;
    source?: string;
    sourceId?: string;
  }) {
    return this.prisma.event.create({
      data: {
        title: data.title,
        externalBookingUrl: data.externalBookingUrl,
        source: data.source,
        sourceId: data.sourceId,
        votingState: VotingState.NOT_STARTED,
      },
    });
  }

  async getRecommendations() {
    return this.prisma.event.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        title: true,
        description: true,
        imageUrl: true,
        externalBookingUrl: true,
        aiNormalized: true,
        aiRaw: true,
        source: true,
        sourceId: true,
        votingState: true,
        selectedPlanId: true,
        startTime: true,
        endTime: true,
        venue: true,
        address: true,
        tags: true,
        votingEndsAt: true,
        createdAt: true,
        updatedAt: true,
        lat: true,
        lng: true,
        rating: true,
        embedding: true,
      },
    });
  }

  async getById(id: string) {
    return this.prisma.event.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        description: true,
        imageUrl: true,
        externalBookingUrl: true,
        aiNormalized: true,
        aiRaw: true,
        source: true,
        sourceId: true,
        votingState: true,
        selectedPlanId: true,
        startTime: true,
        endTime: true,
        venue: true,
        address: true,
        tags: true,
        votingEndsAt: true,
        createdAt: true,
        updatedAt: true,
        lat: true,
        lng: true,
        rating: true,
        embedding: true,
      },
    });
  }

  async ensureTwoPlans(eventId: string) {
    const current = await this.prisma.plan.findMany({
      where: { eventId },
      orderBy: { createdAt: 'asc' } as any,
    });
    let plans = current;
    while (plans.length < 2) {
      const created = await this.prisma.plan.create({
        data: {
          eventId,
          title: `Plan ${plans.length + 1}`,
          description: 'TBD',
          votes: 0,
          isSelected: false,
        },
      });
      plans = [...plans, created];
    }
    return plans.slice(0, 2);
  }

  async listPlans(eventId: string) {
    return this.prisma.plan.findMany({ where: { eventId } });
  }

  async browseEvents(params: {
    from?: Date;
    to?: Date;
    tags?: string[];
    take?: number;
  }) {
    const where: any = {};
    if (params.from || params.to) {
      where.startTime = {};
      if (params.from) where.startTime.gte = params.from;
      if (params.to) where.startTime.lte = params.to;
    }
    if (params.tags && params.tags.length) {
      where.tags = { hasSome: params.tags };
    }
    return this.prisma.event.findMany({
      where,
      orderBy: [{ startTime: 'asc' }, { id: 'asc' }],
      take: params.take ?? 100,
      select: {
        id: true,
        title: true,
        externalBookingUrl: true,
        aiNormalized: true,
        aiRaw: true,
        source: true,
        sourceId: true,
        votingState: true,
        selectedPlanId: true,
        startTime: true,
        endTime: true,
        venue: true,
        address: true,
        tags: true,
        description: true,
        imageUrl: true,
        votingEndsAt: true,
        createdAt: true,
        updatedAt: true,
        lat: true,
        lng: true,
        rating: true,
        embedding: true,
      },
    });
  }

  async listMyEvents(userId: string) {
    const memberships = await this.prisma.member.findMany({
      where: {
        userId,
        status: { in: ['JOINED' as any, 'COMMITTED' as any] },
      },
      include: {
        event: {
          select: {
            id: true,
            title: true,
            externalBookingUrl: true,
            aiNormalized: true,
            aiRaw: true,
            source: true,
            sourceId: true,
            votingState: true,
            selectedPlanId: true,
            startTime: true,
            endTime: true,
            venue: true,
            address: true,
            tags: true,
            description: true,
            imageUrl: true,
            votingEndsAt: true,
            createdAt: true,
            updatedAt: true,
            lat: true,
            lng: true,
            rating: true,
            embedding: true,
          },
        },
      },
    });

    return memberships.map((m: any) => ({
      ...m.event,
      member: { status: m.status, bookingStatus: m.bookingStatus },
    }));
  }

  async votePlan(planId: string, userId: string) {
    const plan = await this.prisma.plan.findUnique({ where: { id: planId } });
    if (!plan) return;
    const votedAlready = await this.prisma.planVote.findFirst({
      where: { userId, plan: { eventId: plan.eventId } },
    });
    if (votedAlready) return;
    try {
      await this.prisma.planVote.create({ data: { planId, userId } });
      await this.prisma.plan.update({
        where: { id: planId },
        data: { votes: { increment: 1 } },
      });
    } catch {}
  }

  async closeVoting(eventId: string) {
    const plans = await this.listPlans(eventId);
    if (plans.length === 0) return null;
    const winner = plans.sort((a: any, b: any) =>
      a.votes === b.votes ? a.id.localeCompare(b.id) : b.votes - a.votes,
    )[0];
    await this.prisma.$transaction([
      this.prisma.event.update({
        where: { id: eventId },
        data: { selectedPlanId: winner.id, votingState: VotingState.CLOSED },
      }),
      this.prisma.plan.update({
        where: { id: winner.id },
        data: { isSelected: true },
      }),
    ]);
    return winner;
  }

  async joinEvent(eventId: string, userId: string) {
    const member = await this.prisma.member.upsert({
      where: { eventId_userId: { eventId, userId } },
      update: {},
      create: { eventId, userId, status: 'JOINED' as any },
    });
    const event = await this.getById(eventId);
    if (event && event.votingState === VotingState.NOT_STARTED) {
      const endsAt = new Date(Date.now() + 180000);
      await this.prisma.event.update({
        where: { id: eventId },
        data: { votingState: VotingState.OPEN, votingEndsAt: endsAt },
      });
    }
    return member;
  }

  async leaveEvent(eventId: string, userId: string) {
    return this.prisma.member.update({
      where: { eventId_userId: { eventId, userId } },
      data: { status: 'CANT_MAKE_IT' as any },
    });
  }

  async commit(eventId: string, userId: string, decision: 'IN' | 'OUT') {
    return this.prisma.member.update({
      where: { eventId_userId: { eventId, userId } },
      data: {
        status:
          decision === 'IN' ? ('COMMITTED' as any) : ('CANT_MAKE_IT' as any),
      },
    });
  }

  async confirmBooking(eventId: string, userId: string, bookingRef?: string) {
    return this.prisma.member.update({
      where: { eventId_userId: { eventId, userId } },
      data: { bookingStatus: 'BOOKED' as any },
    });
  }

  async getBooking(eventId: string, currentUserId?: string) {
    const event = await this.getById(eventId);
    if (!event) return null;
    const plan = event.selectedPlanId
      ? await this.prisma.plan.findUnique({
          where: { id: event.selectedPlanId },
        })
      : null;

    let isBooked = false;
    let isCommitted = false;
    let commitStatus: string | null = null;

    if (currentUserId) {
      const member = await this.prisma.member.findUnique({
        where: {
          eventId_userId: { eventId, userId: currentUserId },
        },
      });

      if (member) {
        isBooked = member.bookingStatus === 'BOOKED';
        isCommitted =
          member.status === 'COMMITTED' || member.status === 'CANT_MAKE_IT';
        commitStatus = isCommitted ? member.status : null;
      }
    }

    return {
      externalBookingUrl: event.externalBookingUrl,
      selectedPlan: plan,
      isBooked,
      isCommitted,
      commitStatus,
    };
  }

  async listChat(
    eventId: string,
    cursor?: string,
    limit: number = 50,
    currentUserId?: string,
  ) {
    const items = await this.prisma.eventMessage.findMany({
      where: { eventId },
      orderBy: { createdAt: 'asc' },
      take: limit,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            avatar: true,
          },
        },
      },
    });

    const messagesWithUserInfo = items.map((item) => ({
      ...item,
      isMe: currentUserId ? item.userId === currentUserId : false,
      user: item.user,
    }));

    return { items: messagesWithUserInfo, nextCursor: null };
  }

  async postMessage(eventId: string, userId: string, text: string) {
    return this.prisma.eventMessage.create({
      data: { eventId, userId, kind: 'CHAT' as any, text },
    });
  }

  async postSystemMessage(eventId: string, text: string) {
    return this.prisma.eventMessage.create({
      data: { eventId, userId: null, kind: 'SYSTEM' as any, text },
    });
  }

  async getEventReview(eventId: string, userId: string) {
    return this.prisma.eventReview.findUnique({
      where: {
        eventId_userId: { eventId, userId },
      },
    });
  }

  async createEventReview(data: {
    eventId: string;
    userId: string;
    placeRating: number;
    planRating: number;
    planId?: string;
    comment?: string;
  }) {
    return this.prisma.eventReview.upsert({
      where: {
        eventId_userId: { eventId: data.eventId, userId: data.userId },
      },
      update: {
        placeRating: data.placeRating,
        planRating: data.planRating,
        planId: data.planId,
        comment: data.comment,
      },
      create: data,
    });
  }

  async getReviewPeers(eventId: string, reviewerId: string): Promise<string[]> {
    const peers = await this.prisma.eventReviewPeer.findMany({
      where: { eventId, reviewerId },
      select: { peerUserId: true },
    });
    return peers.map((p) => p.peerUserId);
  }

  async createReviewPeers(
    eventId: string,
    reviewerId: string,
    peerUserIds: string[],
  ) {
    // Delete existing peers first
    await this.prisma.eventReviewPeer.deleteMany({
      where: { eventId, reviewerId },
    });

    // Create new peer connections
    if (peerUserIds.length > 0) {
      await this.prisma.eventReviewPeer.createMany({
        data: peerUserIds.map((peerUserId) => ({
          eventId,
          reviewerId,
          peerUserId,
        })),
      });
    }
  }

  async getEventMembers(eventId: string, userIds?: string[]) {
    const where: any = { eventId };
    if (userIds && userIds.length > 0) {
      where.userId = { in: userIds };
    }

    return this.prisma.member.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            avatar: true,
          },
        },
      },
    });
  }

  async getMember(eventId: string, userId: string) {
    return this.prisma.member.findUnique({
      where: {
        eventId_userId: { eventId, userId },
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            avatar: true,
          },
        },
      },
    });
  }

  async getEvent(eventId: string) {
    return this.prisma.event.findUnique({
      where: { id: eventId },
    });
  }

  // Connection-related methods
  async getUserConnection(userAId: string, userBId: string) {
    return this.prisma.userConnection.findUnique({
      where: {
        userAId_userBId: { userAId, userBId },
      },
    });
  }

  async createUserConnection(data: {
    userAId: string;
    userBId: string;
    status: 'ACTIVE' | 'BLOCKED';
    lastEventAt?: Date;
  }) {
    return this.prisma.userConnection.create({
      data,
    });
  }

  async updateConnectionLastEvent(connectionId: string, eventId: string) {
    return this.prisma.userConnection.update({
      where: { id: connectionId },
      data: { lastEventAt: new Date() },
    });
  }
}
