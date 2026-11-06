ALTER TABLE "Event" ADD COLUMN "bibCount" INTEGER,
  ADD COLUMN "shirtColors" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Event" DROP CONSTRAINT "Event_bibs_shirts_check";
ALTER TABLE "Event" ADD CONSTRAINT "Event_bibCount_check"
  CHECK ("bibCount" IS NULL OR ("bibsProvided" IS TRUE AND "bibCount" BETWEEN 1 AND 1000));
ALTER TABLE "Event" ADD CONSTRAINT "Event_shirtColors_check"
  CHECK (cardinality("shirtColors") <= COALESCE("shirtColorCount", 0));
