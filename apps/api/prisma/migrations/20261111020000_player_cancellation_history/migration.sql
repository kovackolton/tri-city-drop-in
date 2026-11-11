INSERT INTO "AuditLog" ("id", "actorId", "eventId", "action", "details", "createdAt")
SELECT gen_random_uuid(), host."userId", host."eventId", 'PLAYER_CANCELLED_PARTY',
  jsonb_build_object('bookingId', host."bookingId"::text,
    'seatCount', (SELECT COUNT(*) FROM "Signup" party WHERE party."bookingId" = host."bookingId" AND party."eventId" = host."eventId"),
    'cancelledAt', host."cancelledAt", 'lateCancellation', host."lateCancellation"), host."cancelledAt"
FROM "Signup" host
WHERE host."guestNumber" = 0 AND host."status" = 'CANCELLED' AND host."cancellationSource" = 'PLAYER' AND host."cancelledAt" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "AuditLog" audit WHERE audit."eventId" = host."eventId" AND audit."action" = 'PLAYER_CANCELLED_PARTY' AND audit."details"->>'bookingId' = host."bookingId"::text);
