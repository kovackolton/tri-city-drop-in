CREATE TYPE "PaymentStatus" AS ENUM ('UNPAID', 'NOT_REQUIRED', 'VOID');
ALTER TABLE "Signup" ADD COLUMN "bookingId" UUID,
  ADD COLUMN "quotedPriceCents" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lateCancellation" BOOLEAN NOT NULL DEFAULT false;
-- Preserve old signup rows, grouping each existing host and guests together.
UPDATE "Signup" AS s SET "bookingId" = COALESCE(
  (SELECT h."id" FROM "Signup" h WHERE h."eventId" = s."eventId" AND h."userId" = s."userId" AND h."guestNumber" = 0 LIMIT 1), s."id");
-- Legacy rows had no price snapshot. Use the current event price as their baseline;
-- deliberately do not create retroactive debts for already-confirmed legacy rows.
UPDATE "Signup" AS s SET "quotedPriceCents" = e."priceCents" FROM "Event" e WHERE e."id" = s."eventId";
ALTER TABLE "Signup" ALTER COLUMN "bookingId" SET NOT NULL;
DROP INDEX "Signup_eventId_userId_guestNumber_key";
CREATE UNIQUE INDEX "Signup_bookingId_guestNumber_key" ON "Signup"("bookingId", "guestNumber");
-- Only one active host booking per event/account, while preserving cancelled history.
CREATE UNIQUE INDEX "Signup_active_host_key" ON "Signup"("eventId", "userId")
  WHERE "guestNumber" = 0 AND "status" IN ('CONFIRMED', 'WAITLISTED');
ALTER TABLE "Signup" ADD CONSTRAINT "Signup_nonnegative_quote" CHECK ("quotedPriceCents" >= 0);
CREATE TABLE "PaymentObligation" (
  "id" UUID NOT NULL PRIMARY KEY,
  "signupId" UUID NOT NULL REFERENCES "Signup"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "amountCents" INTEGER NOT NULL CHECK ("amountCents" >= 0),
  "currency" "Currency" NOT NULL DEFAULT 'USD',
  "status" "PaymentStatus" NOT NULL,
  "dueAt" TIMESTAMPTZ(3) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "PaymentObligation_free_status" CHECK (
    ("amountCents" = 0 AND "status" IN ('NOT_REQUIRED', 'VOID')) OR
    ("amountCents" > 0 AND "status" IN ('UNPAID', 'VOID'))
  )
);
CREATE UNIQUE INDEX "PaymentObligation_signupId_key" ON "PaymentObligation"("signupId");
CREATE INDEX "PaymentObligation_status_dueAt_idx" ON "PaymentObligation"("status", "dueAt");
