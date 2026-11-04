ALTER TABLE "Event" ADD COLUMN "bibsProvided" BOOLEAN, ADD COLUMN "shirtColorCount" INTEGER, ADD COLUMN "minPlayers" INTEGER;
ALTER TABLE "Event" ADD CONSTRAINT "Event_shirtColorCount_check" CHECK ("shirtColorCount" BETWEEN 1 AND 10);
ALTER TABLE "Event" ADD CONSTRAINT "Event_minPlayers_check" CHECK ("minPlayers" BETWEEN 1 AND "capacity");
ALTER TABLE "Event" ADD CONSTRAINT "Event_bibs_shirts_check" CHECK ("bibsProvided" IS DISTINCT FROM true OR "shirtColorCount" IS NULL);
