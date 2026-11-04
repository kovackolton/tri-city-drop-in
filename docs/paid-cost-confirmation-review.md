# Paid event cost confirmation

Clicking Join game / Join waitlist on a fee-bearing event opens a native confirmation dialog before submitting a booking. It shows the event title, USD price per seat, party size including guests and total payable if confirmed. I acknowledge the cost & join is the separate second button press. Going back preserves the player's entries. Free events continue to submit directly.

Paid invitation acceptance uses the same two-step approach, with I acknowledge the cost & accept. Declining invitations and accepting free invitations remain direct. Both dialogs explain that payment is in person, no online payment is taken and nothing is due while waitlisted; the accepted quote applies upon promotion. Existing guest-payment acknowledgment, waiver requirements and strike restrictions still apply independently.

Confirmation captures the displayed price and party details. Changed prices or guest details invalidate the pending confirmation, and the server independently checks the quoted price. Repeated submissions remain idempotent. Failed requests retain a retryable dialog; refreshing details does not silently accept a new price.

Paid join and paid-invitation APIs now require costAcknowledged: true. Missing/false/nonboolean acknowledgments cannot create a paid booking. A new booking records one PLAYER_EVENT_COST_ACKNOWLEDGED audit entry with actor, event/booking IDs, per-seat quote, currency, party size, total, source, terms version and server audit time. Retries do not duplicate the record. Free joins do not create a cost-consent entry. Organizer-created immediate bookings retain their existing behavior and do not manufacture a player acknowledgment.

No schema migration, payment processor or external service was added. The signed participation waiver is unchanged; this is a separate acknowledgment of each paid event's specific cost.

Validation: API compilation, production Angular build, 36 API unit tests, 56 isolated PostgreSQL scenarios, 26 frontend logic tests and strict frontend harness type checks passed locally. Coverage includes missing/false/nonboolean acknowledgment, per-guest totals, stale prices, duplicate consent/submission, paid invitations, cancellation of the confirmation and direct free joins. Browser modal/keyboard/mobile review remains manual.
