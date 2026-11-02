CREATE TYPE "Currency" AS ENUM ('USD');
ALTER TABLE "Event"
  ADD COLUMN "priceCents" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "currency" "Currency" NOT NULL DEFAULT 'USD',
  ADD CONSTRAINT "Event_positive_capacity" CHECK ("capacity" > 0),
  ADD CONSTRAINT "Event_nonnegative_price" CHECK ("priceCents" >= 0),
  ADD CONSTRAINT "Event_valid_times" CHECK ("endsAt" > "startsAt"),
  ADD CONSTRAINT "Event_valid_guest_limit" CHECK ("maxGuestsPerUser" >= 0 AND "maxGuestsPerUser" < "capacity"),
  ADD CONSTRAINT "Event_nonnegative_cutoff" CHECK ("cancellationCutoffHours" >= 0);
ALTER TABLE "Signup"
  ADD CONSTRAINT "Signup_nonnegative_guest_number" CHECK ("guestNumber" >= 0),
  ADD CONSTRAINT "Signup_guest_name" CHECK (
    ("guestNumber" = 0 AND "guestName" IS NULL) OR
    ("guestNumber" > 0 AND "guestName" IS NOT NULL AND length(trim("guestName")) > 0)
  );
