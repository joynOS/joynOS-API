import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventsRepository } from './events.repository';
import { AIService } from '../ai/ai.service';
import { MatchingService } from '../matching/matching.service';
import { VotingQueueService } from '../queue/queue.module';
import { calculateVibeScores } from '../matching/utils/vibe';
import { PrismaService } from '../../database/prisma.service';
import { CreateReviewDto } from './dto';

@Injectable()
export class EventsService {
  constructor(
    private readonly repo: EventsRepository,
    private readonly ai: AIService,
    private readonly matching: MatchingService,
    private readonly votingQueue: VotingQueueService,
    private readonly prisma: PrismaService,
  ) {}

  async recommendations(userId?: string) {
    if (userId) {
      const items = await this.matching.recommendationsForUser(userId, {});
      return { items, nextCursor: null };
    }
    const items = await this.repo.getRecommendations();
    return { items, nextCursor: null };
  }

  async browse(params: {
    from?: Date;
    to?: Date;
    tags?: string[];
    take?: number;
    userId?: string;
  }) {
    const events = await this.repo.browseEvents(params);

    if (!params.userId) {
      return events;
    }

    const eventsWithScores: any[] = [];
    for (const event of events) {
      const scores = await this.calculateVibeScoresForEvent(
        event,
        params.userId!,
      );
      
      // Extract membership info
      const memberInfo = (event as any).members?.[0];
      const isMember = !!memberInfo;
      
      eventsWithScores.push({
        ...event,
        ...scores,
        isMember,
        memberStatus: memberInfo?.status || null,
        bookingStatus: memberInfo?.bookingStatus || null,
        members: undefined, // Remove members array from response
      });
    }

    return eventsWithScores.sort(
      (a, b) => b.vibeMatchScoreEvent - a.vibeMatchScoreEvent,
    );
  }

  async myEvents(userId: string) {
    const events = await this.repo.listMyEvents(userId);

    const eventsWithScores: any[] = [];
    for (const event of events) {
      const scores = await this.calculateVibeScoresForEvent(event, userId);
      eventsWithScores.push({
        ...event,
        ...scores,
      });
    }

    return eventsWithScores;
  }

  async detail(eventId: string, userId?: string) {
    const event = await this.repo.getById(eventId);
    if (!event) throw new NotFoundException();
    const ensured = await this.repo.ensureTwoPlans(eventId);
    if (ensured.length < 2) {
      const built = await this.ai.buildTwoPlans({
        title: (event as any).title,
        venue: (event as any).venue,
        address: (event as any).address,
        start: (event as any).startTime,
      });
      for (const p of built) {
        await this.primePlan(eventId, p.title, p.description, p.emoji);
      }
    }
    const plans2 = await this.repo.listPlans(eventId);

    let scores = {};
    if (userId) {
      scores = await this.calculateVibeScoresForEvent(event, userId);
    }

    return { ...event, plans: plans2, ...scores };
  }

  private async primePlan(
    eventId: string,
    title: string,
    description: string,
    emoji?: string,
  ) {
    const current = await this.repo.listPlans(eventId);
    if (current.length >= 2) return;
    // quick create via prisma
    await (this as any).repo.prisma.plan.create({
      data: { eventId, title, description, emoji: emoji ?? null },
    });
  }

  async listPlans(eventId: string) {
    return this.repo.listPlans(eventId);
  }

  async votePlan(eventId: string, planId: string, userId: string) {
    await this.repo.votePlan(planId, userId);
    return { ok: true };
  }

  async closeVoting(eventId: string) {
    const winner = await this.repo.closeVoting(eventId);
    return { selectedPlanId: winner?.id || null };
  }

  async join(eventId: string, userId: string) {
    const member = await this.repo.joinEvent(eventId, userId);
    const event = await this.repo.getById(eventId);
    if (event && event.votingState === 'OPEN' && event.votingEndsAt) {
      const delay = Math.max(
        0,
        new Date(event.votingEndsAt).getTime() - Date.now(),
      );
      await this.votingQueue.addCloseJob(eventId, delay);
    }
    return {
      member: { status: member.status, bookingStatus: member.bookingStatus },
      voting: { state: event?.votingState, endsAt: event?.votingEndsAt },
    };
  }

  async leave(eventId: string, userId: string) {
    const member = await this.repo.leaveEvent(eventId, userId);
    return { member };
  }

  async commit(eventId: string, userId: string, decision: 'IN' | 'OUT') {
    const member = await this.repo.commit(eventId, userId, decision);
    return { member };
  }

  async bookingInfo(eventId: string, currentUserId?: string) {
    return this.repo.getBooking(eventId, currentUserId);
  }

  async confirmBooking(eventId: string, userId: string, bookingRef?: string) {
    const event = await this.repo.getById(eventId);
    if (!event?.selectedPlanId)
      throw new BadRequestException(
        'Booking is only available after a plan is selected.',
      );
    const member = await this.repo.confirmBooking(eventId, userId, bookingRef);
    return { member };
  }

  async chatHistory(
    eventId: string,
    cursor?: string,
    limit?: number,
    currentUserId?: string,
  ) {
    return this.repo.listChat(eventId, cursor, limit, currentUserId);
  }

  async createMessage(eventId: string, userId: string, text: string) {
    return this.repo.postMessage(eventId, userId, text);
  }

  async getReview(eventId: string, userId: string) {
    const review = await this.repo.getEventReview(eventId, userId);
    if (!review) {
      throw new NotFoundException('Review not found');
    }

    const connectedUserIds = await this.repo.getReviewPeers(eventId, userId);

    return {
      eventId: review.eventId,
      userId: review.userId,
      placeRating: review.placeRating,
      planRating: review.planRating,
      planId: review.planId,
      comment: review.comment,
      connectedUserIds,
      createdAt: review.createdAt,
    };
  }

  async createReview(eventId: string, userId: string, dto: CreateReviewDto) {
    // Validate user is member of the event
    const member = await this.repo.getMember(eventId, userId);
    if (!member || !['JOINED', 'COMMITTED'].includes(member.status)) {
      throw new BadRequestException('Must be a member of the event to review');
    }

    // Validate event has ended
    const event = await this.repo.getEvent(eventId);
    if (!event || !event.endTime || event.endTime > new Date()) {
      throw new BadRequestException('Event must have ended to submit a review');
    }

    // Validate connected users are also members
    const validConnectedUserIds = await this.validateConnectedUsers(
      eventId,
      dto.connectedUserIds,
      userId,
    );

    // Create or update review
    const review = await this.repo.createEventReview({
      eventId,
      userId,
      placeRating: dto.placeRating,
      planRating: dto.planRating,
      planId: event.selectedPlanId || undefined,
      comment: dto.comment,
    });

    // Create review peer connections
    await this.repo.createReviewPeers(eventId, userId, validConnectedUserIds);

    // Create or update user connections (circle management)
    let circleAdded = 0;
    for (const peerUserId of validConnectedUserIds) {
      const wasNew = await this.createOrUpdateConnection(
        userId,
        peerUserId,
        eventId,
      );
      if (wasNew) circleAdded++;
    }

    // Optional: Post system message to chat
    if (validConnectedUserIds.length > 0) {
      await this.repo.postSystemMessage(
        eventId,
        `${member.user?.name || 'A user'} submitted a review and connected with ${validConnectedUserIds.length} people.`,
      );
    }

    return {
      ok: true,
      review: {
        eventId: review.eventId,
        userId: review.userId,
        placeRating: review.placeRating,
        planRating: review.planRating,
        planId: review.planId,
        comment: review.comment,
        connectedUserIds: validConnectedUserIds,
        createdAt: review.createdAt,
      },
      circleAdded,
    };
  }

  private async validateConnectedUsers(
    eventId: string,
    connectedUserIds: string[],
    reviewerId: string,
  ): Promise<string[]> {
    if (!connectedUserIds || connectedUserIds.length === 0) {
      return [];
    }

    // Remove self from the list
    const filteredIds = connectedUserIds.filter((id) => id !== reviewerId);

    // Validate all users are members of the event
    const members = await this.repo.getEventMembers(eventId, filteredIds);
    const validMemberIds = members
      .filter((member) => ['JOINED', 'COMMITTED'].includes(member.status))
      .map((member) => member.userId);

    return validMemberIds;
  }

  private async createOrUpdateConnection(
    userAId: string,
    userBId: string,
    eventId: string,
  ): Promise<boolean> {
    // Ensure consistent ordering for undirected relationship
    const [minUserId, maxUserId] =
      userAId < userBId ? [userAId, userBId] : [userBId, userAId];

    const existingConnection = await this.repo.getUserConnection(
      minUserId,
      maxUserId,
    );

    if (existingConnection) {
      // Update lastEventAt
      await this.repo.updateConnectionLastEvent(existingConnection.id, eventId);
      return false; // Not new
    } else {
      // Create new connection
      await this.repo.createUserConnection({
        userAId: minUserId,
        userBId: maxUserId,
        status: 'ACTIVE',
        lastEventAt: new Date(),
      });
      return true; // New connection
    }
  }

  private async calculateVibeScoresForEvent(event: any, userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        interests: true,
      },
    });

    if (!user) {
      return {
        vibeMatchScoreEvent: 0,
        vibeMatchScoreWithOtherUsers: 0,
        distanceMiles: null,
      };
    }

    const eventInterests = await this.prisma.eventInterest.findMany({
      where: { eventId: event.id },
    });

    const eventMembers = await this.prisma.member.findMany({
      where: {
        eventId: event.id,
        status: { in: ['JOINED', 'COMMITTED'] },
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

    const userEmbedding = user.embedding
      ? new Float32Array(
          user.embedding.buffer.slice(
            user.embedding.byteOffset,
            user.embedding.byteOffset + user.embedding.byteLength,
          ),
        )
      : undefined;

    const eventEmbedding = event.embedding
      ? new Float32Array(
          event.embedding.buffer.slice(
            event.embedding.byteOffset,
            event.embedding.byteOffset + event.embedding.byteLength,
          ),
        )
      : undefined;

    const otherMembers = eventMembers.filter((m) => m.userId !== userId);
    const cohortMemberEmbeddings = otherMembers.map((m) =>
      m.user.embedding
        ? new Float32Array(Buffer.from(m.user.embedding).buffer)
        : undefined,
    );

    const first5Participants = eventMembers.slice(0, 5).map((m) => ({
      id: m.user.id,
      name: m.user.name,
      avatar: m.user.avatar,
      status: m.status,
    }));

    let distanceMiles: number | null = null;
    if (user.currentLat && user.currentLng && event.lat && event.lng) {
      const toRad = (d: number) => (d * Math.PI) / 180;
      const R = 3958.7613;
      const lat1 = Number(user.currentLat);
      const lng1 = Number(user.currentLng);
      const lat2 = Number(event.lat);
      const lng2 = Number(event.lng);
      const dLat = toRad(lat2 - lat1);
      const dLng = toRad(lng2 - lng1);
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) *
          Math.cos(toRad(lat2)) *
          Math.sin(dLng / 2) *
          Math.sin(dLng / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      distanceMiles = R * c;
    }

    const scores = calculateVibeScores({
      userEmbedding,
      eventEmbedding,
      userInterests: user.interests.map((i) => ({
        interestId: i.interestId,
        weight: i.weight,
      })),
      eventInterests: eventInterests.map((i) => ({
        interestId: i.interestId,
        weight: i.weight,
      })),
      distanceMiles,
      radiusMiles: user.radiusMiles,
      rating: event.rating ? Number(event.rating) : null,
      cohortMemberEmbeddings,
    });

    return {
      ...scores,
      distanceMiles,
      interestedCount: eventMembers.length,
      participants: first5Participants,
    };
  }
}
