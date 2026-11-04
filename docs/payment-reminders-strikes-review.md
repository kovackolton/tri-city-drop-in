# Overdue payment reminders and joining restrictions

This milestone replaces the previous rule that missed-payment strikes required matching player/organizer unpaid reports. The player confirmed the new rule: only seats explicitly marked Not received by the organizer can receive automatic payment strikes. Unreviewed seats do not count, even when the organizer has reviewed other players at the event.

## Payment reminders

After more than 24 hours from the event end, confirmed fee-bearing seats with no player payment report generate one in-app reminder per booking. A host's guest seats are included. Either paid or unpaid completes that seat's player report. The reminder stays relevant while any eligible seat in the party is unreviewed; free, voided, waitlisted and cancelled event/seat records are excluded. Repeated/concurrent refreshes do not duplicate notices. Once all applicable player reports are complete, an existing unread reminder is marked read on the next inbox refresh. Read history is retained.

Review payment status opens My games, expands past games, scrolls/focuses the matching event and exposes its normal payment controls. An optional owner-scoped includeEventId query keeps a reminder-linked event reachable even outside the normal 100-event history window, without revealing another account's seats. Targeted history refreshes ignore older competing responses and retain the target until the session store resets.

## Strike rules

- The grace period is 24 elapsed hours after event end. Before that, payment strikes do not count.
- After grace, each confirmed fee-bearing seat explicitly marked unpaid by the organizer receives one payment strike against its booking account. Guests count as separate seats. An event with no organizer reviews produces no payment strikes. Starting reviews never penalizes unreviewed seats.
- An organizer's late unpaid review updates the applicable strikes in the same transaction. Earlier unpaid reviews reconcile when the app next reads notifications, strike status, the staff roster/user directory, or starts a new booking.
- The player's I paid / I have not paid report is informational for resolving discrepancies. It does not clear, cause or veto a payment strike. An organizer-paid seat never counts as a payment strike, even if the player's report says unpaid or is missing.
- Marking payment received clears the corresponding payment strike immediately, retains history/audit records and creates a clearance notification. Generic strike revocation cannot bypass payment confirmation. Correcting payment back to explicitly unpaid reapplies the same seat's strike after grace rather than creating duplicate strike records.
- Three or more current strikes block new joins and waitlists. Server-side enforcement also covers accepting invitations and organizer-created immediate bookings. Already booked parties remain, including existing waitlist entries; identical booking retries do not cancel/rebook them. Existing attendance and late-cancellation strikes remain reviewed and count equally when current. Revoked or expired strikes do not count.
- Administrators can issue permanent account strikes from Users, with a required reason visible to the player. They have no event/signup requirement, do not expire and are not cleared by event payments. A request UUID prevents duplicate issuance on retries. Only an administrator can correct/revoke one, with a required audit reason; the original reason remains in history. Each counts as one strike.

## Visibility and access

A prominent site-wide status banner shows the current count and joining consequence. Join/waitlist and invitation-accept buttons are disabled at the limit, with an explanation linking the issue to previous-game payment discrepancies and other strike reasons. Existing booking cancellation remains available. My profile shows a strike ledger containing current/cleared state, event/venue/time, player or guest seat, price, both payment reports, and administrator reasons. Where the organizer has supplied public contact information, it is displayed with their call preference respected.

Manage players displays the booking account's total current strikes on each player/guest row, including administrator strikes. Users shows current counts and opens administrator-only strike management. Shared participant lists and public event cards do not expose account strike counts or administrator notes.

## Local architecture

No external delivery service or scheduler was added. Notifications and current-strike status refresh roughly every 30 seconds while the app is open, and on relevant reads/actions. Players returning to the app receive their due reminders then. Organizer payment changes apply immediately server-side; other signed-in clients pick up updated counts through their next refresh. Event/account locks, per-seat uniqueness and notification dedupe keys protect concurrent operations. Multi-player immediate bookings acquire account locks in consistent order while preserving selection/FIFO order.

Migration 20261103020000_payment_strike_policy adds nullable signup association, permanent/automatic flags, a stored note and a unique admin request ID, with a constraint for permanent strike records. Existing history is preserved. Existing overdue organizer-unpaid seats are reconciled under the new policy on refresh.

API endpoints added: GET /api/me/strikes; GET/POST /api/admin/users/:id/strikes; POST /api/admin/users/:id/strikes/:strikeId/revoke. Role and ownership checks remain server-side. The existing notification and payment-review routes are reused.

## Validation

Production frontend build, API compilation, 35 API unit tests, 51 isolated PostgreSQL scenarios, 21 frontend logic tests, 3 theme tests and strict frontend test-harness type checks passed locally. Coverage includes the grace boundary, unknown/paid/unpaid reviews, guest responsibility, duplicate/concurrent reminders and strikes, payment-only clearance, permanent-strike authorization/retries/correction, mixed three-strike blocking on all booking paths, preserved existing seats, expired/revoked exclusions, private old-history links and client reset safety. PostgreSQL test schemas are removed after testing. No external services were called for validation. Browser visual, keyboard, dialog and end-to-end session review remains manual.

The running Windows API held the Prisma engine DLL during generation, so the same-version engine-file rename reported EPERM. Generated metadata/types were updated; migrations applied and compilation/database scenarios validated the new schema without stopping the user's server.
