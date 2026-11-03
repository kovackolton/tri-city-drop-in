# Event teams, initial players, public organizer contact and review dialogs

## Create an event

The event form now includes Number of teams (2-16), an Enable auto-balancing using player self-ratings checkbox, optional public organizer email/phone and C/T availability, and a search/select control for existing account names or nicknames. Search exposes only identity/avatar labels, not private contacts or ratings. Select up to 100 existing accounts and choose one mode for the selected batch:

- Send in-app invitations: no seats, charges or guest consent are created. Draft invitations are stored and notified only when the event is published. My Games shows pending invitations with the event price and Accept and join / Decline actions. Acceptance uses the player's current-price confirmation and normal capacity/FIFO logic. Answering an invitation marks its notice read and records an audit entry. Repeated acceptance never recreates a subsequently cancelled booking.
- Book seats immediately: each selected account receives a solo booking at the event price; overflow follows the normal FIFO waitlist. Confirmations create existing in-person payment obligations, while waitlisted seats do not. The action and accepted-price snapshot are audited, and each selected player receives an in-app notice. Draft seats are explicitly provisional, appear in that player's My Games and can be cancelled without a late flag. Registration into someone else's draft is still unavailable. No guest acknowledgment is fabricated: organizers add existing accounts only, without guests.

Unknown or duplicate selected IDs fail validation; event creation and all initial invitations/bookings commit atomically. Initial selections are available during creation, not as a new bulk-edit feature afterward.

## Teams

Open View players in the organizer workspace to see the Teams board. The event owner and administrators can change team count/balancing availability, move individual confirmed seats between teams, or leave them unassigned. Changes are allowed for active draft/published events until the end time and are audited. Decreasing the team count clears assignments outside the new range. Completed/cancelled events are read-only.

When the event toggle is enabled, Auto-balance confirmed players opens a confirmation dialog before replacing current assignments. The deterministic heuristic sorts players by descending self-rating, then assigns to a least-populated team with the lowest rating total. Team sizes differ by at most one. This is an approximate balancing aid, not a guarantee of equal ability. Guests and unrated accounts use a neutral estimate of 3/5; guests do not inherit their host's rating. Booking parties may be placed on different teams, while booking/capacity integrity remains unchanged.

New registrations and promoted waitlist seats remain unassigned until the organizer assigns them or runs balancing again; nobody's existing assignment is silently shuffled. Waitlisted/cancelled seats cannot be assigned. Cancellation, removal and future-event deletion clear team assignments in the same booking transaction. Existing player-facing lineup cards and My Games party rows show team numbers but omit individual ratings, account names when a nickname is present, and private contact information.

## Organizer contact on cards

Public contact values are explicitly entered per event; private profile contacts are never automatically copied into public event responses. The email and phone appear on Upcoming games and My Games cards, with C (call) and T (text) indicators/links. Unavailable methods are visibly muted. Entering a phone requires selecting at least one method; selecting a method requires a valid phone. Leave fields blank to publish no contact. Administrators retain their existing general event-edit controls; team-specific owner settings do not grant broad event-edit permissions.

## Payment and strike dialogs

Payment review buttons open a native modal dialog over the main window, showing the affected player/guest and amount before Paid/Unpaid is recorded. Strike review, issuance and revocation are in a separate modal with the review note, eligibility explanation and history. Read-only payment/attendance summaries remain on the roster. Party removal/promotion controls remain separate.

Dialogs use native showModal/close behavior for the backdrop, modal focus handling and background inertness. Escape/Close are supported while idle and disabled during pending mutations. Failed submissions keep the dialog open with a recoverable error; successful saves close and refresh it. Backend payment timing, independent reviews, reviewed-strike eligibility and payment-correction revocation remain unchanged.

## Local migration and verification

Applied 20261102050000_teams_invites_event_contact to local PostgreSQL. It adds team configuration/public contact fields to Event, nullable teamNumber to Signup, and EventInvitation with a unique event/account pair. Old events default to two teams, balancing off, and no public contacts; old bookings remain unassigned.

Passed Angular production build, API TypeScript compilation, 32 API unit tests, 37 isolated PostgreSQL scenarios, 13 local auth tests and 10 local profile/dialog tests. The frontend logic tests also passed strict TypeScript checking. Coverage includes size/rating heuristics, owner-only team mutation, private rating projections, stale/cancelled assignment cleanup, provisional draft bookings, event-creation rollback, invitation publication/acceptance/decline/idempotency/concurrent capacity, explicit public contacts, modal Escape/pending state and failed/successful payment submission. Local /api/health returned ok.

No real external accounts, emails, payments or cloud services were used in tests. Browser visual, keyboard/focus and real multi-account review are still manual. The full Angular DOM suite still requires the previously missing Vitest/jsdom packages. Prisma's existing Windows engine DLL lock recurred; the generated runtime/types with the new fields were exercised successfully by compilation/database tests with the same installed engine. No running process was killed.

Manual review: create one event with invitations and another with immediate bookings; inspect My Games using the selected accounts, accept/decline and cancel a draft reservation. Enable balancing, add a guest/unrated account, run balancing and adjust teams manually. Confirm peers see team numbers but no skill ratings. Check email, C and T actions on cards. For an ended game, open payment and strike dialogs, test keyboard Escape/Close and verify a failed request leaves entered review context visible.
