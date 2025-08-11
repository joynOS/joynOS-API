import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventsRepository } from './events.repository';
import { VOTING_DEFAULT_DURATION_SECONDS } from '../../common/constants/domain.constants';
import { AIService } from '../ai/ai.service';
import { MatchingService } from '../matching/matching.service';
import { VotingQueueService } from '../queue/queue.module';

@Injectable()
export class EventsService {
  constructor(
    private readonly repo: EventsRepository,
    private readonly ai: AIService,
    private readonly matching: MatchingService,
    private readonly votingQueue: VotingQueueService,
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
  }) {
    return this.repo.browseEvents(params);
  }

  async detail(eventId: string) {
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
    return { ...event, plans: plans2 };
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

  async bookingInfo(eventId: string) {
    return this.repo.getBooking(eventId);
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

  async chatHistory(eventId: string, cursor?: string, limit?: number) {
    return this.repo.listChat(eventId, cursor, limit);
  }

  async createMessage(eventId: string, userId: string, text: string) {
    return this.repo.postMessage(eventId, userId, text);
  }
}
