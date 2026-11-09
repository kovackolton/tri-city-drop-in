ALTER TABLE "Event" ADD COLUMN "minimumSkillLevel" INTEGER, ADD COLUMN "maximumSkillLevel" INTEGER;
ALTER TABLE "Event" ADD CONSTRAINT "Event_skill_eligibility_check" CHECK (("minimumSkillLevel" IS NULL OR "minimumSkillLevel" BETWEEN 1 AND 5) AND ("maximumSkillLevel" IS NULL OR "maximumSkillLevel" BETWEEN 1 AND 5) AND ("minimumSkillLevel" IS NULL OR "maximumSkillLevel" IS NULL));
