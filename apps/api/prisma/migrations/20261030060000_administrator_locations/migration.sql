ALTER TYPE "Role" ADD VALUE 'ADMINISTRATOR';
ALTER TABLE "Event" ADD COLUMN "deletedAt" TIMESTAMPTZ(3);
-- Canonical identity ignores case and repeated whitespace, retaining separate pitches
-- with distinct names at the same address. Keep the most-referenced duplicate.
CREATE FUNCTION location_identity(value TEXT) RETURNS TEXT
LANGUAGE SQL IMMUTABLE STRICT AS $$ SELECT lower(regexp_replace(btrim(value), '\s+', ' ', 'g')) $$;
CREATE TEMP TABLE location_merges ON COMMIT PRESERVE ROWS AS
SELECT id, first_value(id) OVER (
  PARTITION BY location_identity(name), location_identity(address)
  ORDER BY (SELECT count(*) FROM "Event" e WHERE e."locationId" = l.id) DESC, id
) AS canonical FROM "Location" l;
UPDATE "Event" e SET "locationId" = m.canonical FROM location_merges m WHERE e."locationId" = m.id AND m.id <> m.canonical;
DELETE FROM "Location" l USING location_merges m WHERE l.id = m.id AND m.id <> m.canonical;
DROP TABLE location_merges;
CREATE UNIQUE INDEX "Location_identity_key" ON "Location" (location_identity(name), location_identity(address));
