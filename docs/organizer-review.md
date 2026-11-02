# Organizer attendance, roster overrides and strikes

Open Organizer workspace → View players on an event. The roster now includes cancelled history so late cancellations remain reviewable. Player-facing lists still exclude cancelled seats and private details.

## Attendance

For confirmed seats, mark Present, Absent, Excused or Unmarked. Attendance opens at event start; Absent is available only after the event ends. Guests are marked separately. Corrections are audited. If an active no-show strike exists, revoke it with a note before changing attendance away from Absent.

## Roster adjustments

Before an event starts, the host row offers whole-party removal and waitlist promotion. Both require a reason and inline confirmation. Removal voids charges and promotes fitting FIFO parties; it never records a late player cancellation. Promotion can deliberately bypass the queue, but all guest seats must fit within the existing cap. Accepted prices are preserved, and duplicate requests do not duplicate charges, notices or audit entries. Each override is checked against event ownership inside the same event-row lock as player signups.

Manual creation of another player's booking, event editing/cancellation and capacity-edit screens remain future work. This milestone operates on existing bookings only.

## Strike review

After event end, the organizer can issue a strike with a review note:

| Reason | Required evidence |
| --- | --- |
| No-show | Confirmed seat marked Absent |
| Late cancellation | Seat cancelled by its player inside the cutoff; organizer removals do not qualify |
| Missed payment | Paid seat still UNPAID, with both player and organizer explicitly reporting unpaid |

Missing reviews, conflicting payment reports, Free seats and cancelled charges cannot receive missed-payment strikes. No strikes or suspensions are created automatically. There is no automatic suspension threshold or expiry policy yet; expiry stays unset. Strikes are per seat/incident, including guests, and belong to the booking account responsible for that seat.

The organizer can revoke a strike with a note. Revoked history remains visible; the same seat/reason cannot be reissued. Correcting either payment review so that unpaid agreement no longer holds automatically revokes an existing missed-payment strike and records why. An organizer cannot edit another organizer's event, attendance, strikes or history.

Players see attendance and recorded/revoked strikes on their own My games seats. These details are not exposed in the names-only participant list. The organizer's View event history shows the most recent 100 changes with actor, time and review/override notes.

## Review checklist

1. On a future event, create a blocked waitlist party and a smaller party behind it. With a reason, promote the smaller party into free space. Confirm capacity is never exceeded and the history records the exception.
2. Remove a whole confirmed party. Confirm all guests cancel, charges are voided, and the next fitting waitlist parties move up without a late penalty on the removed party.
3. On an ended event, mark a confirmed seat Absent. Issue a no-show strike with a note. Verify it appears in the player's My games.
4. Revoke that strike, then mark the seat Excused. Verify both the revoked history and corrected attendance remain visible.
5. For an ended paid seat, submit opposite payment reports. A missed-payment strike must be unavailable. Set both reports unpaid and issue one; correct either report to paid and verify automatic revocation.
6. Review a late player cancellation from cancelled history. Compare with an organizer removal, which must not qualify.
7. Open View event history to review decisions. Another organizer must receive no access to this event's private endpoints.

## API additions

- POST `/api/organizer/signups/:id/attendance`: `{ "attendance": "PRESENT" }`
- POST `/api/organizer/signups/:id/strikes`: `{ "reason": "NO_SHOW", "note": "Reviewed absence" }`
- POST `/api/organizer/signups/:id/strikes/:strikeId/revoke`: `{ "note": "Approved absence" }`
- POST `/api/organizer/events/:id/bookings/:bookingId/remove`: `{ "reason": "Organizer correction" }`
- POST `/api/organizer/events/:id/bookings/:bookingId/promote`: `{ "reason": "Approved queue exception" }`
- GET `/api/organizer/events/:id/audit`

All require organizer role and event ownership. No new schema migration is required; this milestone uses the existing attendance, strike, payment and audit tables. Browser verification remains manual. Email notices are queued in the outbox but delivery is not connected yet.
