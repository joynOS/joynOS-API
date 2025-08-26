// Sync intervals for external event APIs
export const SYNC_INTERVALS = {
  // Main sync frequencies (in minutes)
  DEFAULT_SYNC_INTERVAL: 360, // 6 hours
  FAST_SYNC_INTERVAL: 60, // 1 hour
  RAPID_SYNC_INTERVAL: 5, // 5 minutes

  // Per-API sync frequencies based on costs & rate limits
  API_SYNC_INTERVALS: {
    // Free APIs - can sync more frequently
    MEETUP: 60, // 1 hour (free, 500 points/60s allows frequent sync)
    NYC_PARKS: 180, // 3 hours (free, but events change less frequently)
    SEATGEEK: 120, // 2 hours (free, but rate limited)
    TICKETMASTER: 90, // 1.5 hours (free, 5000/day, 5 req/sec)

    // Paid APIs - sync less frequently to control costs
    YELP: 360, // 6 hours (paid per call, events are more static)
  },

  // Dynamic intervals based on event proximity
  PROXIMITY_SYNC_INTERVALS: {
    HAPPENING_SOON: 15, // 15 min (events starting in next 2 hours)
    TODAY: 60, // 1 hour (events happening today)
    THIS_WEEK: 240, // 4 hours (events this week)
    FUTURE: 720, // 12 hours (events beyond this week)
  },

  // Batch sizes to respect rate limits
  SYNC_BATCH_SIZES: {
    YELP: 50, // Small batches due to cost
    MEETUP: 100, // Larger batches, points-based limit
    SEATGEEK: 75, // Medium batches
    NYC_PARKS: 200, // Large batches, no limit
    TICKETMASTER: 100, // Good batch size, respects 5 req/sec
  },

  // Cost control thresholds
  COST_LIMITS: {
    DAILY_YELP_CALLS: 480, // Max Yelp calls per day (500 limit - buffer)
    MONTHLY_YELP_BUDGET: 240, // Max monthly spend on Yelp ($240)
    ALERT_THRESHOLD: 0.8, // Alert when 80% of budget used
  },
} as const;

// Sync job types
export enum SyncJobType {
  DISCOVERY = 'discovery', // Find new events
  UPDATE = 'update', // Update existing events
  STATUS_CHECK = 'status_check', // Check if events cancelled/updated
  CLEANUP = 'cleanup', // Remove past/cancelled events
}

// Event update priorities
export enum UpdatePriority {
  CRITICAL = 'critical', // Events starting soon
  HIGH = 'high', // Events today
  NORMAL = 'normal', // Events this week
  LOW = 'low', // Future events
}

// Sync status tracking
export enum SyncStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  RATE_LIMITED = 'rate_limited',
  BUDGET_EXCEEDED = 'budget_exceeded',
}
