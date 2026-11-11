ALTER TABLE "User" ADD COLUMN "preferredPositions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "User" ADD CONSTRAINT "User_preferredPositions_check" CHECK ("preferredPositions" <@ ARRAY['GK', 'DF', 'MF', 'F']::TEXT[] AND cardinality("preferredPositions") <= 4);
