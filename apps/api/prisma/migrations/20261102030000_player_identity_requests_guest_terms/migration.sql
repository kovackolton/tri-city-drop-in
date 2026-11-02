ALTER TABLE "User" ADD COLUMN "nickname" TEXT, ADD COLUMN "skillLevel" INTEGER,
  ADD COLUMN "accountNameSetAt" TIMESTAMPTZ(3), ADD COLUMN "profileCompletedAt" TIMESTAMPTZ(3);
UPDATE "User" SET "accountNameSetAt" = "createdAt", "profileCompletedAt" = "createdAt";
ALTER TABLE "User" ADD CONSTRAINT "User_skillLevel_check" CHECK ("skillLevel" BETWEEN 1 AND 5);
ALTER TABLE "Signup" ADD COLUMN "guestPaymentAcknowledgedAt" TIMESTAMPTZ(3), ADD COLUMN "guestPaymentTermsVersion" TEXT;
CREATE TABLE "OrganizerRequest" (
  "id" UUID NOT NULL, "userId" UUID NOT NULL, "status" TEXT NOT NULL DEFAULT 'PENDING',
  "requestedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt" TIMESTAMPTZ(3), "reviewedById" UUID,
  CONSTRAINT "OrganizerRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OrganizerRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "OrganizerRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "OrganizerRequest_status_check" CHECK ("status" IN ('PENDING', 'GRANTED', 'CLEARED'))
);
CREATE UNIQUE INDEX "OrganizerRequest_one_pending_per_user" ON "OrganizerRequest"("userId") WHERE "status" = 'PENDING';
CREATE INDEX "OrganizerRequest_status_requestedAt_idx" ON "OrganizerRequest"("status", "requestedAt");
CREATE INDEX "OrganizerRequest_userId_requestedAt_idx" ON "OrganizerRequest"("userId", "requestedAt");
