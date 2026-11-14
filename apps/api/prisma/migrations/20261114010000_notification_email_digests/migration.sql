ALTER TABLE "User" ADD COLUMN "emailDigestEnabled" BOOLEAN NOT NULL DEFAULT true,
 ADD COLUMN "emailUrgentEnabled" BOOLEAN NOT NULL DEFAULT true;
UPDATE "User" SET "emailDigestEnabled" = "emailNotificationsEnabled", "emailUrgentEnabled" = "emailNotificationsEnabled";
CREATE TABLE "NotificationEmailBatch" (
 "id" UUID NOT NULL PRIMARY KEY, "userId" UUID NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "kind" TEXT NOT NULL CHECK ("kind" IN ('DIGEST','URGENT')), "status" TEXT NOT NULL DEFAULT 'PENDING'
 CHECK ("status" IN ('PENDING','SENDING','SENT','FAILED','UNKNOWN','SKIPPED')),
 "attempts" INTEGER NOT NULL DEFAULT 0 CHECK ("attempts" >= 0),
 "nextAttemptAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "claimedAt" TIMESTAMPTZ(3), "sentAt" TIMESTAMPTZ(3),
 "recipient" TEXT, "providerMessageId" TEXT, "lastError" TEXT,
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMPTZ(3) NOT NULL
);
ALTER TABLE "NotificationEmail" ADD COLUMN "batchId" UUID REFERENCES "NotificationEmailBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "NotificationEmail_batchId_idx" ON "NotificationEmail"("batchId");
CREATE INDEX "NotificationEmailBatch_status_nextAttemptAt_idx" ON "NotificationEmailBatch"("status","nextAttemptAt");
CREATE INDEX "NotificationEmailBatch_userId_kind_claimedAt_idx" ON "NotificationEmailBatch"("userId","kind","claimedAt");
