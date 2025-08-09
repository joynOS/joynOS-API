export enum VotingState {
  NOT_STARTED = 'NOT_STARTED',
  OPEN = 'OPEN',
  CLOSED = 'CLOSED',
}
export enum MemberStatus {
  INVITED = 'INVITED',
  JOINED = 'JOINED',
  COMMITTED = 'COMMITTED',
  CANT_MAKE_IT = 'CANT_MAKE_IT',
  WAITLIST = 'WAITLIST',
}
export enum BookingStatus {
  NONE = 'NONE',
  PENDING = 'PENDING',
  BOOKED = 'BOOKED',
}
export enum MessageKind {
  CHAT = 'CHAT',
  SYSTEM = 'SYSTEM',
  VOTE = 'VOTE',
  BOOKING = 'BOOKING',
}
export const VOTING_DEFAULT_DURATION_SECONDS = 180;
export const RECOMMENDATIONS_PAGE_SIZE = 20;
export const CHAT_PAGE_SIZE = 50;
export const MATCHING_OVERLAP_WEIGHT = 0.35;
export const MATCHING_SIMILARITY_WEIGHT = 0.35;
export const MATCHING_RATING_WEIGHT = 0.15;
export const MATCHING_DISTANCE_WEIGHT = 0.15;
export const VIBESCORECACHE_TTL_SECONDS = 7200;
export const ALLOWED_EVENT_SOURCES = [
  'ticketmaster',
  'seatgeek',
  'manual',
] as const;
