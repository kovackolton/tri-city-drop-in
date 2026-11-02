ALTER TABLE "Notification" ADD COLUMN "readAt" TIMESTAMPTZ(3);
CREATE INDEX "Notification_userId_createdAt_id_idx" ON "Notification"("userId", "createdAt", "id");
