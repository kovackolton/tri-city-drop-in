ALTER TABLE "User" ADD COLUMN "emailNotificationsEnabled" BOOLEAN NOT NULL DEFAULT true;
CREATE TABLE "NotificationEmail" (
  "id" UUID NOT NULL, "notificationId" UUID NOT NULL, "status" TEXT NOT NULL DEFAULT 'PENDING', "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "claimedAt" TIMESTAMPTZ(3), "sentAt" TIMESTAMPTZ(3),
  "recipient" TEXT, "providerMessageId" TEXT, "lastError" TEXT, "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL, CONSTRAINT "NotificationEmail_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "NotificationEmail_status_check" CHECK ("status" IN ('PENDING','SENDING','SENT','FAILED','UNKNOWN','SKIPPED')),
  CONSTRAINT "NotificationEmail_attempts_check" CHECK ("attempts" >= 0),
  CONSTRAINT "NotificationEmail_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "NotificationEmail_notificationId_key" ON "NotificationEmail"("notificationId");
CREATE INDEX "NotificationEmail_status_nextAttemptAt_idx" ON "NotificationEmail"("status","nextAttemptAt");
