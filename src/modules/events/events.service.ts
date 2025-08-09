import { Injectable, NotFoundException } from '@nestjs/common';
import { EventsRepository } from './events.repository';
import { VOTING_DEFAULT_DURATION_SECONDS } from '../../common/constants/domain.constants';

@Injectable()
export class EventsService {
  constructor(private readonly repo: EventsRepository) {}

  async recommendations() {
    const items = await this.repo.getRecommendations();
    return { items, nextCursor: null };
  }

  async detail(eventId: string) {
    const event = await this.repo.getById(eventId);
    if (!event) throw new NotFoundException();
    await this.repo.ensureTwoPlans(eventId);
    const plans = await this.repo.listPlans(eventId);
    return { ...event, plans };
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
