ALTER TABLE "User" ADD COLUMN "adminSkillLevel" INTEGER;
ALTER TABLE "User" ADD CONSTRAINT "User_adminSkillLevel_check" CHECK ("adminSkillLevel" BETWEEN 1 AND 5);
