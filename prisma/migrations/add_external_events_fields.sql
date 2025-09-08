-- Migration: Add external event fields
-- Only adding essential fields not covered by existing schema

ALTER TABLE "Event" 
ADD COLUMN "organizerName" VARCHAR(255),
ADD COLUMN "attendeeCount" INTEGER DEFAULT 0,
ADD COLUMN "capacity" INTEGER,
ADD COLUMN "priceDisplay" VARCHAR(100), -- "Free", "$15-25", "$$"
ADD COLUMN "requiresRSVP" BOOLEAN DEFAULT false,
ADD COLUMN "categories" VARCHAR(100)[], -- Original API categories
ADD COLUMN "lastSyncAt" TIMESTAMP,
ADD COLUMN "syncStatus" VARCHAR(50) DEFAULT 'active'; -- 'active' | 'cancelled' | 'sold_out'

-- Add index for external event queries
CREATE INDEX idx_event_external_source ON "Event"(source) WHERE source IS NOT NULL;
CREATE INDEX idx_event_sync_status ON "Event"(syncStatus, lastSyncAt);
CREATE INDEX idx_event_start_time_active ON "Event"(startTime) WHERE syncStatus = 'active';

-- Update existing source values to be more explicit
UPDATE "Event" SET source = 'region_synthetic' WHERE source IS NULL OR source = '';