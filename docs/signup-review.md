# Milestone 3: signup and waitlist review

## What is included

- Signed-in players can join future published games, alone or with named guests up to the event allowance.
- The whole party is confirmed if it fits and no party is already waiting; otherwise the whole party queues.
- FIFO promotion uses host queue timestamp, then host ID as a tie-breaker. A large party at the head blocks smaller parties behind it until it fits or cancels.
- Players can cancel their whole booking, including guests. The UI asks for confirmation and shows the cancellation cutoff.
- My games shows the latest 100 whole bookings, their guests, statuses and payment obligations. Refresh retrieves promotions; there is no server-push subscription yet.
- Organizers can open their event's active roster. Other players and organizers cannot read it.
- In My games, confirmed and waitlisted players can open a names/status-only player list for their joined event, including guests. Cancelled bookings and nonparticipants cannot access it. Joined players can still view the list after the event completes. Every My games card also names the event organizer. Private organizer roster/payment-review access remains separate.

## Data and transaction rules

Every join/cancel transaction locks the event row with `SELECT ... FOR UPDATE` and reads occupancy afterward at READ COMMITTED isolation. Future roster overrides, event cancellation, price/capacity changes and other registration writers must take this same lock. Party members share a booking UUID; a partial unique database index enforces one active host booking per user/event. The service creates all party seats atomically.

Exact retries of an active booking reuse it; changes to the guest list require cancellation and rejoining. Each rejoin gets a new booking UUID, so cancellations and future attendance/strike records retain their original seat history. Cancelling an old booking UUID cannot cancel a newer rejoin. Cancellation retries do not duplicate promotion notices or charges.

Players send the price they reviewed. A stale price is rejected. The accepted per-seat price is captured at queue entry and honored on promotion, even if a later event edit changes the advertised price. This deliberately simplifies the earlier proposal to ask for new price consent during promotion: waiting players now keep their accepted price. No event-edit API is included in this milestone.

Each confirmed seat has one payment obligation with USD amount and due date at event end. Players pay in person at the event, never in advance to secure a place. Waiting seats have none. Free seats cannot carry unpaid debt. Cancellation voids the obligation, including a late cancellation; no cancellation fee is imposed. Late confirmed cancellations are recorded for organizer review, not automatically struck.

After the event ends, the player (or guest's booking account) and event organizer each report paid or unpaid. Two ticks per seat indicate those independent reviews are complete; both ticks can be present even if the reports disagree or both say unpaid. Disagreement is highlighted. Only the organizer's review changes the settlement status to PAID/UNPAID. Reviews can be corrected with an audit trail. Free/cancelled seats are exempt. Neither joining nor a missing review triggers a strike. Dispute resolution, waivers, refunds and missed-payment strike enforcement remain future work.

Promotion and its outbox notification commit together. Email delivery is not connected yet, so players must refresh My games to see status changes. Outbox keys deduplicate by booking UUID.

The migration preserves existing rows. For legacy signups that lacked a price snapshot it uses the event's price at migration time. It does not invent retroactive debts for existing confirmed seats. Cancelled history is preserved, and new signups get the complete payment behavior.

## API additions

| Endpoint | Access |
| --- | --- |
| GET `/api/me/signups` | Current player's latest 100 whole bookings |
| GET `/api/events/:id/players` | Confirmed/waitlisted participants; names, guest labels and statuses only |
| POST `/api/events/:id/signups` | Signed-in player; body `{ "guests": [], "expectedPriceCents": 1250 }` |
| POST `/api/events/:id/signups/:bookingId/cancel` | Booking owner only |
| GET `/api/organizer/events/:id/roster` | That event's organizer only |
| POST `/api/signups/:id/payment/player-review` | Booking account; body `{ "paid": true }` or false |
| POST `/api/signups/:id/payment/organizer-review` | That event's organizer; same body |

Public event responses include guest allowance and cancellation cutoff but no attendee names or payment details. Profile/roster data is returned only through authenticated endpoints.

## Run and review

Restart your API after the migration/client generation, and reload the frontend. If applying these changes on another machine:

```powershell
npm run db:deploy --workspace @tri-city/api
npm run db:generate
npm run dev:api
```

In another terminal: `npm run dev:web`.

1. Create a published event with capacity 3, guest allowance 1 and a USD price.
2. Join as player A with one guest. Confirm two seats and two obligations in My games.
3. Join as player B with one guest. Both seats should wait, with nothing owed yet.
4. Join as player C alone. C must wait behind B even though one seat is free.
5. Cancel A's party. B's two seats and C's single seat should all become confirmed. Refresh their My games views to see this.
6. Open the organizer roster to see all three confirmed seats.
7. Cancel and rejoin. Both old cancelled and new active bookings should appear in history.
8. Repeat with a Free event. Confirmed seats should show Free, not unpaid.
9. For an ended paid event, open My games as the player and record paid/unpaid. Confirm only the player tick appears. Review it from the organizer player list and confirm the second tick appears. Opposite reports should show a disagreement; correction should update the review without changing the other side.

## Automated verification

```powershell
npm run build
npm run test --workspace @tri-city/api
npm run test:integration --workspace @tri-city/api
```

Integration tests create a uniquely named `signup_test_*` schema in the configured PostgreSQL database, apply migrations there, run real concurrent transactions and remove only that test schema. The database user needs schema-creation permission. Application tables and Firebase accounts are untouched. Tests cover capacity races, duplicate requests, FIFO/guest promotion, notification deduplication, accepted prices, free seats, ownership, cancellation retries/history, late flags, and draft/past restrictions.

The browser sign-in and multi-account review checklist still needs manual review; no automated browser test is claimed.
