-- Add UserEventAction table for saves and likes
CREATE TABLE "UserEventAction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "actionType" TEXT NOT NULL CHECK ("actionType" IN ('SAVED', 'LIKED')),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserEventAction_pkey" PRIMARY KEY ("id")
);

-- Create unique index to prevent duplicate actions
CREATE UNIQUE INDEX "UserEventAction_userId_eventId_actionType_key" ON "UserEventAction"("userId", "eventId", "actionType");

-- Create indexes for performance
CREATE INDEX "UserEventAction_userId_idx" ON "UserEventAction"("userId");
CREATE INDEX "UserEventAction_eventId_idx" ON "UserEventAction"("eventId");
CREATE INDEX "UserEventAction_actionType_idx" ON "UserEventAction"("actionType");

-- Add foreign keys
ALTER TABLE "UserEventAction" ADD CONSTRAINT "UserEventAction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserEventAction" ADD CONSTRAINT "UserEventAction_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;