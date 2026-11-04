ALTER TABLE "Event" ADD COLUMN "teamCount" INTEGER NOT NULL DEFAULT 2,
 ADD COLUMN "teamBalancingEnabled" BOOLEAN NOT NULL DEFAULT false,
 ADD COLUMN "organizerContactEmail" TEXT, ADD COLUMN "organizerContactPhone" TEXT,
 ADD COLUMN "contactCallAllowed" BOOLEAN NOT NULL DEFAULT false,
 ADD COLUMN "contactTextAllowed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Event" ADD CONSTRAINT "Event_teamCount_check" CHECK ("teamCount" BETWEEN 2 AND 16);
ALTER TABLE "Signup" ADD COLUMN "teamNumber" INTEGER;
ALTER TABLE "Signup" ADD CONSTRAINT "Signup_teamNumber_check" CHECK ("teamNumber" IS NULL OR ("teamNumber" BETWEEN 1 AND 16 AND "status" = 'CONFIRMED'));
CREATE TABLE "EventInvitation" (
 "id" UUID NOT NULL, "eventId" UUID NOT NULL, "userId" UUID NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'PENDING', "bookingId" UUID,
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "EventInvitation_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "EventInvitation_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "EventInvitation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "EventInvitation_status_check" CHECK ("status" IN ('PENDING', 'ACCEPTED', 'DECLINED'))
);
CREATE UNIQUE INDEX "EventInvitation_eventId_userId_key" ON "EventInvitation"("eventId", "userId");
CREATE INDEX "EventInvitation_userId_status_idx" ON "EventInvitation"("userId", "status");
