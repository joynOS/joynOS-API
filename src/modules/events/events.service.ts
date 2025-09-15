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
      const itemsWithActions = await this.addUserActionsToEvents(items, userId);
      return { items: itemsWithActions, nextCursor: null };
    }
    const items = await this.repo.getRecommendations();
    const formattedItems = items.map(item => this.formatEventWithActions(item, []));
    return { items: formattedItems, nextCursor: null };
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
      return events.map(event => this.formatEventWithActions(event, []));
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

    const sortedEvents = eventsWithScores.sort(
      (a, b) => b.vibeMatchScoreEvent - a.vibeMatchScoreEvent,
    );

    return sortedEvents.map(event =>
      this.formatEventWithActions(event, event.userActions || [])
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

    return await this.addUserActionsToEvents(eventsWithScores, userId);
  }

  async detail(eventId: string, userId?: string) {
    const event = await this.repo.getById(eventId, userId);
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
    let whyThisMatch: any = null;

    if (userId) {
      scores = await this.calculateVibeScoresForEvent(event, userId);
      whyThisMatch = await this.generateWhyThisMatch(event, userId);
    }

    const baseEvent = {
      ...event,
      plans: plans2,
      ...scores,
      whyThisMatch,
    };

    return this.formatEventWithActions(baseEvent, (event as any).userActions || []);
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

    const filteredConnectedUserIds = connectedUserIds.filter(
      (id) => id !== userId,
    );

    return {
      eventId: review.eventId,
      userId: review.userId,
      placeRating: review.placeRating,
      planRating: review.planRating,
      planId: review.planId,
      comment: review.comment,
      connectedUserIds: filteredConnectedUserIds,
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

    // Filter out the current user from participants list
    const first5Participants = otherMembers.slice(0, 5).map((m) => ({
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

  private async generateWhyThisMatch(event: any, userId: string) {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        include: {
          interests: {
            include: {
              interest: true,
            },
          },
        },
      });

      if (!user) return null;

      // Get event interests
      const eventInterests = event.tags || [];
      const userInterests = user.interests.map((ui) => ui.interest.slug);

      // Find common interests
      const commonInterests = eventInterests.filter((tag: string) =>
        userInterests.includes(tag),
      );

      // Get participants with their interests
      const participants = await this.prisma.member.findMany({
        where: {
          eventId: event.id,
          userId: { not: userId },
          status: { in: ['JOINED', 'COMMITTED'] },
        },
        include: {
          user: {
            include: {
              interests: {
                include: {
                  interest: true,
                },
              },
            },
          },
        },
        take: 5,
      });

      // Calculate participant matches based on common interests
      const participantMatches = participants.map((member) => {
        const memberInterests = member.user.interests.map(
          (ui) => ui.interest.slug,
        );
        const sharedInterests = userInterests.filter((interest) =>
          memberInterests.includes(interest),
        );

        return {
          name: member.user.name,
          score: Math.min(90, 50 + sharedInterests.length * 10),
          reasons:
            sharedInterests.length > 0
              ? [
                  `Shares ${sharedInterests.length} interests: ${sharedInterests.slice(0, 3).join(', ')}`,
                ]
              : ['New connection opportunity'],
        };
      });

      // Generate reasons based on data
      const eventReasons: string[] = [];
      if (commonInterests.length > 0) {
        eventReasons.push(
          `Matches ${commonInterests.length} of your interests: ${commonInterests.slice(0, 3).join(', ')}`,
        );
      }
      if (event.vibeKey) {
        eventReasons.push(
          `Perfect for your ${event.vibeKey.toLowerCase()} vibe`,
        );
      }
      if (event.venue) {
        eventReasons.push(`Great location at ${event.venue}`);
      }
      if (eventReasons.length === 0) {
        eventReasons.push('New experience to explore');
      }

      const eventScore = Math.min(
        95,
        60 + commonInterests.length * 8 + (event.vibeKey ? 10 : 0),
      );

      return {
        eventMatch: {
          score: eventScore,
          reasons: eventReasons,
        },
        participantMatches,
        planMatch: {
          reasons: event.selectedPlanId
            ? ['Plan selected based on group preferences']
            : ['Multiple plans available for voting'],
        },
        overallExplanation:
          commonInterests.length > 0
            ? `Great match! You share ${commonInterests.length} interests with this event.`
            : 'Perfect opportunity to explore new interests and meet like-minded people.',
      };
    } catch {
      return {
        eventMatch: {
          score: 85,
          reasons: [
            'Great match with your interests',
            'Perfect location for you',
          ],
        },
        participantMatches: [],
        planMatch: {
          reasons: ['Plans align with your preferences'],
        },
        overallExplanation:
          'This event is a great match for your vibe and interests!',
      };
    }
  }

  private async getEventParticipantsForChat(
    eventId: string,
    excludeUserId: string,
  ) {
    const members = await this.prisma.member.findMany({
      where: {
        eventId,
        userId: { not: excludeUserId },
        status: { in: ['JOINED', 'COMMITTED'] },
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
      take: 10,
    });

    return members.map((m) => ({
      id: m.user.id,
      name: m.user.name,
      avatar: m.user.avatar,
    }));
  }

  async generateChatSuggestions(eventId: string, userId: string) {
    try {
      const event = await this.repo.getById(eventId);
      const plans = await this.repo.listPlans(eventId);
      const participants = await this.getEventParticipantsForChat(
        eventId,
        userId,
      );
      const recentMessages = await this.repo.listChat(
        eventId,
        undefined,
        5,
        userId,
      );

      return await this.ai.generateChatSuggestions({
        eventTitle: event?.title || '',
        plans: plans.map((p) => ({
          title: p.title,
          description: p.description || '',
        })),
        participants: participants.map((p) => ({
          name: p.name,
          interests: [], // Could be enhanced with actual interests
        })),
        recentMessages:
          recentMessages?.items?.map((m) => ({
            userName: m.user?.name || 'Anonymous',
            message: m.text,
            timestamp: m.createdAt,
          })) || [],
      });
    } catch {
      // Fallback suggestions
      return {
        suggestions: [
          'Hey everyone! Looking forward to this event!',
          'This looks like such a great group! Anyone been to something like this before?',
        ],
        context: 'Fallback suggestions due to processing error',
      };
    }
  }

  // Event Actions (Save/Like)
  async toggleSave(eventId: string, userId: string) {
    // Check if already saved
    const existing = await this.prisma.userEventAction.findUnique({
      where: {
        userId_eventId_actionType: {
          userId,
          eventId,
          actionType: 'SAVED',
        },
      },
    });

    if (existing) {
      await this.repo.unsaveEvent(eventId, userId);
      return { saved: false, message: 'Event unsaved' };
    } else {
      await this.repo.saveEvent(eventId, userId);
      return { saved: true, message: 'Event saved' };
    }
  }

  async toggleLike(eventId: string, userId: string) {
    // Check if already liked
    const existing = await this.prisma.userEventAction.findUnique({
      where: {
        userId_eventId_actionType: {
          userId,
          eventId,
          actionType: 'LIKED',
        },
      },
    });

    if (existing) {
      await this.repo.unlikeEvent(eventId, userId);
      return { liked: false, message: 'Event unliked' };
    } else {
      await this.repo.likeEvent(eventId, userId);
      return { liked: true, message: 'Event liked' };
    }
  }

  // Helper method to add saved/liked status to events
  private async addUserActionsToEvents(events: any[], userId: string) {
    if (!events.length) return events;

    const eventIds = events
      .map((e) => e.id || e.eventId)
      .filter((id) => id !== undefined && id !== null);
    if (!eventIds.length)
      return events.map((event) => this.formatEventWithActions(event, []));

    const actions = await this.repo.getUserEventActions(eventIds, userId);

    const actionsMap = actions.reduce(
      (acc, action) => {
        if (!acc[action.eventId]) {
          acc[action.eventId] = [];
        }
        acc[action.eventId].push(action);
        return acc;
      },
      {} as Record<string, any[]>,
    );

    return events.map((event) => {
      const eventId = event.id || event.eventId;
      return this.formatEventWithActions(
        { ...event, id: eventId },
        actionsMap[eventId] || []
      );
    });
  }

  private formatEventWithActions(event: any, userActions: any[]) {
    const hasLiked = userActions.some(action => action.actionType === 'LIKED');
    const hasSaved = userActions.some(action => action.actionType === 'SAVED');

    return {
      ...event,
      userActions,
      isLiked: hasLiked,
      isSaved: hasSaved,
      liked: hasLiked,
      saved: hasSaved,
      favorited: hasSaved,
    };
  }
}
