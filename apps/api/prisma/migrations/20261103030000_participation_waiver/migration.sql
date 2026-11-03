CREATE TABLE "WaiverAcceptance" (
 "id" UUID NOT NULL, "userId" UUID NOT NULL, "version" TEXT NOT NULL,
 "contentHash" TEXT NOT NULL, "contentText" TEXT NOT NULL,
 "signedName" TEXT NOT NULL, "signedEmail" TEXT NOT NULL,
 "acceptedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "WaiverAcceptance_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "WaiverAcceptance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "WaiverAcceptance_userId_version_key" ON "WaiverAcceptance"("userId", "version");
