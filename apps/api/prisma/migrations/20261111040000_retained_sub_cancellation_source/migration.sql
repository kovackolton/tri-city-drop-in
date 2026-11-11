ALTER TABLE "Signup" DROP CONSTRAINT "Signup_cancellationSource_check";
ALTER TABLE "Signup" ADD CONSTRAINT "Signup_cancellationSource_check" CHECK (
  "cancellationSource" IS NULL
  OR ("cancellationSource" IN ('PLAYER', 'ORGANIZER', 'EVENT') AND "status" = 'CANCELLED')
  OR ("cancellationSource" = 'PLAYER' AND "status" = 'CONFIRMED' AND "subResponsibilityAcknowledgedAt" IS NOT NULL AND "cancelledAt" IS NOT NULL)
);
