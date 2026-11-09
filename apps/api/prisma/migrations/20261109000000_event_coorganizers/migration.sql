ALTER TABLE "Event" ADD COLUMN "coOrganizerIds" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[];
CREATE INDEX "Event_coOrganizerIds_idx" ON "Event" USING GIN ("coOrganizerIds");
