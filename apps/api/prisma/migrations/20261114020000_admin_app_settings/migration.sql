CREATE TABLE "AppSetting" (
 "key" TEXT NOT NULL PRIMARY KEY, "value" JSONB NOT NULL, "revision" INTEGER NOT NULL DEFAULT 0 CHECK ("revision" >= 0),
 "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- No seed: the first worker run imports its existing environment values. Admin saves take precedence.
