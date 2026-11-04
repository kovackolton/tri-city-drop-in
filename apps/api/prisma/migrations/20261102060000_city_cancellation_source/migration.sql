ALTER TABLE "Location" ADD COLUMN "city" TEXT;
ALTER TABLE "Signup" ADD COLUMN "cancellationSource" TEXT;
ALTER TABLE "Signup" ADD CONSTRAINT "Signup_cancellationSource_check" CHECK ("cancellationSource" IS NULL OR ("cancellationSource" IN ('PLAYER', 'ORGANIZER', 'EVENT') AND "status" = 'CANCELLED'));
UPDATE "Signup" AS s SET "cancellationSource" = 'ORGANIZER' WHERE s."status" = 'CANCELLED' AND EXISTS (
 SELECT 1 FROM "AuditLog" a WHERE a."eventId" = s."eventId" AND a."action" = 'ORGANIZER_REMOVED_PARTY' AND a."details"->>'bookingId' = s."bookingId"::text
);
