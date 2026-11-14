CREATE TABLE "EventPreset" (
 "id" UUID NOT NULL PRIMARY KEY, "ownerId" UUID NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "name" TEXT NOT NULL, "nameKey" TEXT NOT NULL, "settings" JSONB NOT NULL, "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "EventPreset_name_check" CHECK (char_length("name") BETWEEN 1 AND 80)
);
CREATE UNIQUE INDEX "EventPreset_ownerId_nameKey_key" ON "EventPreset"("ownerId","nameKey");
