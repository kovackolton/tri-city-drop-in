# Versioned waiver and collapsible profile sections

The current strike banner (including its refresh error) now appears only on My profile and My games. Join-card blocking explanations remain available on individual games. View strikes and reasons opens My profile, expands Strikes & joining access, and scrolls/focuses that section. Notification strike actions use the same target. The strike section starts collapsed on a normal visit and can be opened/closed by its button; a later target request reopens it even after manual collapse.

A separate Participation & strike rules waiver section lives on My profile and starts collapsed. Review & e-sign waiver opens the complete rules and an explicit I agree button. Acceptance is independent of the profile editing form and is available after account creation as well as during the initial profile setup. Signed users can expand and reread the waiver and see the recorded account identity, version and timestamp.

Signed-in users who still need to agree see a prominent banner at the top of Upcoming games and My games. Its action opens, expands and focuses the waiver section on My profile. Join and invitation-accept controls stay disabled until the current waiver is accepted. Strike eligibility remains independent: signing does not remove strikes or override a three-strike restriction.

## Published rules and electronic record

The authoritative version, title, clauses and content hash live in apps/api/src/waiver.ts. The frontend renders those server-provided clauses rather than maintaining a second copy. The current version is participation-strikes-v2. It adds the purpose of reducing organizer stress and uncertainty about collecting funds that may be needed to reserve locations, in both the waiver and the electronic acknowledgment. Earlier signed records remain unchanged; accounts that signed v1 must explicitly agree to v2 before new bookings. The rules cover event/guest payment responsibility, 24-hour reminders and grace period, explicitly organizer-unpaid seats only, informational player payment reports, organizer-confirmed clearance/reapplication, reviewed attendance/late-cancellation incidents, permanent administrator strikes, equal strike weights and the three-strike restriction, preserved existing bookings, and where reasons/counts/contact information can be found.

GET /api/me/waiver returns the current document and the signed-in account's matching acceptance, if any. POST /api/me/waiver requires exactly version and agree: true. There is no automatic signature on profile/account creation, no accepting on behalf of another user, and no way to inject an identity or timestamp through the request. Acceptance records contain the exact text, version, SHA-256 hash, account display-name/email snapshot and database-server acceptance time. A unique account/version key and account lock make duplicate/concurrent requests idempotent, with one audit entry. An existing signed record is never overwritten.

Change the version whenever changing published text. A future version requires a fresh acceptance and preserves earlier records. Current-version hash mismatches also block new bookings and cannot silently overwrite a signed document.

## Booking enforcement and migration

The common booking path checks the user's current version/hash acceptance under the same account lock as strike enforcement. This covers direct joins, waitlists, invitation acceptance and organizer-created immediate bookings, for Player, Organizer and Administrator accounts alike. Existing bookings are returned unchanged on identical retries before this new-booking check; unsigned users can still browse, review payments and cancel their existing bookings. Existing waitlist entries retain normal promotion behavior.

Migration 20261103030000_participation_waiver creates the acceptance table and was applied locally. It intentionally does not backfill signatures: existing real accounts must explicitly agree before making another booking. No external e-sign service, delivery provider or scheduled worker was added. The waiver is a record of agreement to the app's participation/strike rules; no separate legal enforceability determination was implemented.

## Validation

API compilation, production Angular build, 35 API unit tests, 54 isolated PostgreSQL scenarios, 24 frontend logic tests and strict frontend harness type checking passed locally. Added coverage checks unsigned blocking across all booking paths/roles, preserved legacy booking/cancellation behavior, explicit agreement and input rejection, immutable snapshots, concurrent retries, audit deduplication, client signing/reset behavior and repeated section-open requests. Existing payment/strike tests use explicitly accepted fixture accounts; no real account was automatically signed. Test schemas are removed afterward.

Browser visual, keyboard and end-to-end signed-in navigation review remains manual. Check banner visibility on each page, both deep links, manual collapse/reopen, initial profile setup and I agree submission, and an existing unsigned account. The same-version Prisma engine DLL remained locked by the running Windows API during generation; metadata/types updated and migrations/compilation/database scenarios passed without stopping that server.
