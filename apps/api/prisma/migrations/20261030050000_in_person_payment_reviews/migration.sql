ALTER TABLE "PaymentObligation"
  ADD COLUMN "playerPaid" BOOLEAN,
  ADD COLUMN "playerReviewedAt" TIMESTAMPTZ(3),
  ADD COLUMN "organizerPaid" BOOLEAN,
  ADD COLUMN "organizerReviewedAt" TIMESTAMPTZ(3),
  ADD COLUMN "organizerReviewedById" UUID REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentObligation" DROP CONSTRAINT "PaymentObligation_free_status";
ALTER TABLE "PaymentObligation" ADD CONSTRAINT "PaymentObligation_free_status" CHECK (
  ("amountCents" = 0 AND "status" IN ('NOT_REQUIRED', 'VOID')) OR
  ("amountCents" > 0 AND "status" IN ('UNPAID', 'PAID', 'VOID'))
);
ALTER TABLE "PaymentObligation"
  ADD CONSTRAINT "PaymentObligation_player_review_consistent" CHECK (("playerPaid" IS NULL) = ("playerReviewedAt" IS NULL)),
  ADD CONSTRAINT "PaymentObligation_organizer_review_consistent" CHECK (
    ("organizerPaid" IS NULL AND "organizerReviewedAt" IS NULL AND "organizerReviewedById" IS NULL) OR
    ("organizerPaid" IS NOT NULL AND "organizerReviewedAt" IS NOT NULL AND "organizerReviewedById" IS NOT NULL)
  );
