ALTER TABLE "User"
  ADD COLUMN "contactEmail" TEXT,
  ADD COLUMN "phone" TEXT,
  ADD COLUMN "avatarColor" TEXT NOT NULL DEFAULT 'emerald',
  ADD COLUMN "useGooglePhoto" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD CONSTRAINT "User_avatarColor_check" CHECK ("avatarColor" IN ('emerald', 'teal', 'sky', 'indigo', 'violet', 'rose', 'amber', 'slate'));
