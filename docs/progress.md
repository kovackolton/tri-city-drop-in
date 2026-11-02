# Current milestone: player identity, organizer requests and guest responsibility

New profile setup includes optional nickname and a private 1-5 self-rated skill level with a team-balancing blurb. Existing account names are preserved and locked. Players can request organizer access; administrators have a Users page, request flags/filters, notifications and audited Grant/Clear decisions. Guest booking requires explicit payment-responsibility acknowledgment, retained through waitlist promotion. Per the selected policy, strikes remain organizer-reviewed and guest strikes belong to the booking account. The local migration is applied; builds, 27 API unit tests, 32 local PostgreSQL scenarios and 21 frontend logic tests passed. Browser review remains manual. See [identity/request review](player-identity-review.md).

## Previous milestone: venue photos and map embeds


Locations now supports an optional approved external photo URL, credit text and a manually copied Google Maps embed. Game cards and My Games show thumbnails beside titles and maps near addresses; a building icon and directions link cover missing media. No image files, API keys or paid Maps/Places API integration were added. The local migration is applied. Frontend build, API compilation, 25 unit tests, 28 isolated PostgreSQL scenarios and seven frontend profile/map tests passed. Existing locations need their optional media configured; live image/map and browser checks remain manual. See [venue media review](location-media-review.md).

## Previous milestone: player contact, avatars and My Games


My profile now supports optional contact email/phone, a Google-hosted profile photo, or a colored initial. Private event rosters expose contact links only to the owning organizer and administrators; shared player cards exclude contact information. My Games has redesigned game/party cards and avatar lineups. No profile image files are stored. The local additive migration is applied. Frontend build, API compilation, 22 API unit tests, 27 isolated PostgreSQL scenarios and 16 frontend logic tests passed. Live Google photos and browser layouts remain manual checks. See [player profiles review](player-profiles-review.md).

## Previous milestone: event management and in-app notifications


Email/password authentication is now implemented alongside Google; Facebook UI/client integration is removed. Registration uses Firebase's password policy plus a 12-character app minimum, with verification resend/check and password reset. Passwords are handled only by Firebase's SDK and are never sent to the application API or persisted by the application. Password-token API access now requires verified email even for existing profiles. Eleven local auth service/form tests and 18 API unit tests pass. See [email/password review](email-password-review.md).

Added owner/administrator event cancellation and completion, persistent private notification inbox/read state, unread badge, and refresh-driven 24-hour reminders. Existing administrator-only edit/delete permissions remain. Cancellation locks the event, cancels active parties, voids charges, writes notices and audits atomically. Completion retains attendance/payment review. Cancelled/completed events cannot be edited; unchanged edits create no notices.

The inbox migration was applied locally. Both production builds, 16 API unit tests and all 26 isolated PostgreSQL scenarios passed without external services. Frontend tests are blocked by missing Vitest/jsdom; the offline dependency restore failed. No browser or live Firebase test is claimed. See [event management review](event-management-review.md) for exact behavior, endpoints and local review steps. No external delivery or deployment was performed.

## Previous milestone: Administrator and Locations


Added ADMINISTRATOR above ORGANIZER, inheriting cross-event organizer access plus administrator-only event/location edit/delete controls. Locations now has its own workspace page with a required duplicate precheck, repeated server validation and database uniqueness. The applied migration removed one duplicate Midland Civic Arena record and retained the canonical location with all three linked events. Event deletion archives history; referenced locations cannot be deleted. No accounts were automatically promoted; use the trusted administrator:grant CLI. API compilation, frontend production build, 16 unit tests and 19 isolated PostgreSQL scenarios passed. See [Administrator review](administrator-review.md).

The Prisma client was generated successfully for the new schema before testing. A redundant generation attempt after migration encountered a Windows engine-file lock; the installed client was checked and contains both ADMINISTRATOR and deletedAt. If regenerating on Windows, stop the API process first.

## Previous milestone: organizer attendance and strike review

Current additions: event owners can mark attendance, remove whole parties, explicitly promote a waitlisted party within capacity, issue eligible strikes with notes, revoke strikes and view event history. Cancelled seats are retained in the private roster for late-cancellation review. Players see their own attendance and strike history; shared participant lists remain names/status-only. No schema migration is required. See [organizer checklist](organizer-review.md).

## Frontend

My games now identifies the event organizer and lets confirmed/waitlisted participants view all confirmed players, waitlisted players and guests. A separate participant API exposes only names, guest flags and booking statuses; payment details remain private. Nonparticipants and cancelled bookings cannot access this list. No database migration is required for this addition.

Players can join a game with named guests, cancel a whole party, and view confirmed/waitlisted/cancelled booking history under My games. Prices, payment records and late-cancellation flags are visible. My games and the organizer's private event player list each display separate player/organizer payment-review ticks with paid/unpaid labels. NgRx Signal Store manages bookings, loading/error states and mutation progress; session changes clear prior-account data. Refresh retrieves promotion/review changes; live push is not implemented.

## Backend

Added authenticated signup/history/cancellation endpoints and an owner-only organizer roster endpoint. Event-row locks serialize every booking change, including guest seats and waitlist promotion. Whole-party FIFO prevents smaller parties from bypassing a blocked head party. Retried joins reuse an identical active booking, and cancellation targets a booking UUID so old requests cannot cancel a new rejoin. Promotion notices commit to the outbox with the signup changes.

Existing Firebase identity/profile/organizer authorization remains in place. The IPv4 development proxy fix is retained. No cloud resources were provisioned.

## Database and architecture

Applied the third migration to the local dropin database. It preserves existing signup records, adds booking UUIDs and accepted-price snapshots, replaces the old unique seat index with booking/guest uniqueness, adds a partial unique active-host index, and creates per-seat PaymentObligation records for new confirmations. Cancelled history is never overwritten by rejoining.

Accepted prices are locked at signup/queue entry and honored on promotion. Players pay physically at the event, with no advance payment required to register. Free confirmations have no debt; waitlisted seats have no obligation. Cancellation voids charges. The late flag is stored for future organizer review; this milestone issues no strikes or cancellation fees. Payment is due by event end, then player and organizer independently record paid/unpaid reviews. A tick records review completion, not necessarily payment. Disagreement is highlighted; only the organizer's review sets settlement status. Corrections are audited. See [signup review](signup-review.md) for the complete decisions and manual checklist.

The payment-review migrations add separate nullable paid flags and timestamps, organizer reviewer identity, and PAID settlement status. Free/cancelled seats are exempt. Each side can update only its own review; guest payments are reviewed by the booking account. Review API routes are authorized and take the event lock before changing payment state.

## Verification

- Both production builds passed via npm run build.
- All 15 backend unit tests passed.
- All 17 PostgreSQL integration scenarios passed using an isolated signup_test_* schema removed afterward. Coverage includes signup concurrency/FIFO, history, payments/privacy, owner-only roster overrides, attendance timing, eligible manual strikes, revocation and automatic missed-payment revocation after payment corrections.
- Local migration deployment and Prisma Client generation passed.
- No automated browser test or email-delivery test is claimed. The signed-in multi-account review checklist is ready for manual review.

## Next milestone

Manual addition of existing players, dispute resolution/waivers, external notification delivery/background scheduling and Cloud Run/Cloud SQL deployment. Automatic suspensions and strike-expiry thresholds remain unset. Manual strikes require organizer review; conflicting payment reports do not qualify.
