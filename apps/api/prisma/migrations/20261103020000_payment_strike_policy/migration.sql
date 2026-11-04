ALTER TABLE "Strike" ALTER COLUMN "signupId" DROP NOT NULL;
ALTER TABLE "Strike" ADD COLUMN "permanent" BOOLEAN NOT NULL DEFAULT false,
 ADD COLUMN "automatic" BOOLEAN NOT NULL DEFAULT false,
 ADD COLUMN "note" TEXT,
 ADD COLUMN "adminRequestId" UUID;
CREATE UNIQUE INDEX "Strike_adminRequestId_key" ON "Strike"("adminRequestId");
ALTER TABLE "Strike" ADD CONSTRAINT "Strike_permanent_check" CHECK (NOT "permanent" OR ("signupId" IS NULL AND "expiresAt" IS NULL AND "issuedById" IS NOT NULL AND "note" IS NOT NULL));
