# Player identity, skill ratings, organizer requests and guest payment terms

## Profile setup and names

Newly created authenticated app profiles are sent to profile setup. Players can choose an optional nickname and self-rate skill from 1 (Beginner) to 5 (Competitive), or choose Not rated. The blurb explains that this is for organizers who want help automatically balancing event teams. This milestone records the rating; it does not add a team-generation algorithm. Ratings are available to the player, event organizers in the private roster and administrators, and are omitted from shared participant lists.

Account names are locked after initial assignment. Google names are captured on app profile creation. Email registration now asks for an account name and sets Firebase profile metadata before verification. If name setup fails or a provider supplies no name, the authenticated profile screen allows one initial account-name entry. Server-side row locking ensures two concurrent setup requests cannot overwrite the established name. Later changes to Firebase display-name metadata do not overwrite the app's stored account name.

Players can edit/clear their nickname, contacts, avatar and self-rating. Public player labels and avatar initials use the nickname when provided, otherwise the account name. Organizers see the nickname plus original account name and skill rating; the admin Users page shows both names. Profile requests cannot change role, email, or an established account name. The legacy database displayName column remains the immutable account-name snapshot; API displayName is the effective nickname/account label and accountName supplies the original name explicitly.

The migration preserves and locks existing stored account names, and marks existing profiles set up so existing players are not forced through onboarding. They can add a nickname/rating from My profile. It does not attempt to reconstruct an earlier Google name if an account had previously edited its display name.

## Organizer requests and admin Users

Players can request organizer access from My profile and see Pending, Granted or Cleared state. Repeating a pending request reuses it. Clearing does not grant access and allows a later new request. Doing nothing leaves it pending.

Administrators now have a Users page with name/nickname/email search, an Organizer requests filter/count, pending flags, and Grant/Clear controls. Decisions require confirmation alongside the relevant user. Lists paginate 50 users at a time. Notifications link admins directly to the pending-request view. Every current administrator receives a deduplicated in-app request notice; administrators appointed later receive outstanding notices when they refresh their inbox.

Only administrators can list users or decide requests. Grant sets PLAYER -> ORGANIZER; it never demotes an administrator or modifies unrelated permissions. Requests retain requestedAt, terminal status, reviewedAt and reviewer identity. User-row locks serialize submissions/reviews, and decisions target request UUIDs so stale actions cannot clear a replacement request. Identical decisions are idempotent; conflicting decisions are rejected. Resolving a request marks its admin notices read and sends the requester one outcome notice. Reading a notice alone does not clear its pending request. Granted users can Refresh access to load their updated database role without signing out.

## Guest payment acknowledgment and reviewed strikes

Adding any guests requires an unchecked-by-default acknowledgment that the booking account is responsible for paying for all guest seats when fees apply and unpaid guest seats may result in organizer-reviewed strikes against that account. Changing guest count resets it. Both form submission and the API enforce acknowledgment, including free/waitlisted guest parties. Solo bookings need none.

Signup records store the server acknowledgment timestamp and guest-payment-v1 terms version on the whole party. Retries and waitlist promotions preserve that evidence. The organizer roster and My Games show the acknowledgment. Existing historical bookings are unchanged; no consent is fabricated for them.

As explicitly selected, strikes remain organizer-reviewed. Existing eligibility is preserved: missed-payment review opens after event end for confirmed, paid-price seats; both player and organizer reviews must agree unpaid. Free, cancelled, disputed or unreviewed payments do not automatically produce strikes. A guest strike belongs to the booking account's user ID and the affected guest signup ID. Organizer review creates an audit record and an in-app strike notice. Correcting payment review continues to revoke an ineligible missed-payment strike. No automatic suspensions, strike thresholds, fees or automatic payment collection were added.

## Local migration and tests

Applied 20261102030000_player_identity_requests_guest_terms to local PostgreSQL. It adds nickname, nullable skillLevel (database 1-5 constraint), account-name/setup timestamps, OrganizerRequest history with a partial unique pending-request index, and guest acknowledgment metadata.

Passed: frontend production build, API TypeScript compilation, 27 API unit tests, 32 isolated PostgreSQL scenarios, 13 local auth tests and eight local profile/signup tests. The frontend test harness passed strict TypeScript checking. Tests cover concurrent name setup, nickname/skill privacy, immutable-name rejection, request deduplication/admin-only decisions/races, newly appointed admins, user pagination with tied creation times, guest acknowledgment enforcement and promotion retention, reviewed guest strikes assigned to the host, and payment-correction revocation.

Tests use local PostgreSQL and Firebase SDK doubles; no external accounts, emails or cloud resources were created. Browser/visual and real multi-account session testing remain manual, and the full Angular DOM suite still needs the previously missing Vitest/jsdom packages. Prisma's existing Windows engine DLL lock recurred during regeneration; the updated generated runtime/types were verified through successful compilation and database tests with the same installed engine. No running process was killed.

```powershell
npm test --workspace @tri-city/api
npm run test:integration --workspace @tri-city/api
npm run test:auth --workspace @tri-city/web
npm run test:profile --workspace @tri-city/web
npm run build --workspace @tri-city/web
npx tsc -p apps/api/tsconfig.json
```

Manual review: create/verify an email account or sign in with a new Google account, complete optional nickname/skill setup, then confirm account name is read-only. Request organizer access as a player; check an admin's Notifications and Users pages. Leave one request pending, clear another, and grant access to a third. Refresh the granted player's access. Finally add a guest, verify joining is blocked until acknowledgment, and check its timestamp on the organizer roster. After an event ends, use the existing payment-review flow to test a reviewed unpaid-guest strike and correction.
