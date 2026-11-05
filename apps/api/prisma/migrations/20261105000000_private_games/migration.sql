ALTER TABLE "Event" ADD COLUMN "isPrivate" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "privateInviteToken" TEXT;
CREATE UNIQUE INDEX "Event_privateInviteToken_key" ON "Event"("privateInviteToken");
ALTER TABLE "Event" ADD CONSTRAINT "Event_private_invite_check"
  CHECK ((NOT "isPrivate" AND "privateInviteToken" IS NULL) OR
         ("isPrivate" AND "privateInviteToken" IS NOT NULL AND "privateInviteToken" ~ '^[a-f0-9]{64}$'));
