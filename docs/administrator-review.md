# Administrator and location management

The role hierarchy is PLAYER → ORGANIZER → ADMINISTRATOR. Roles are stored in PostgreSQL and never accepted from profile updates. Administrators inherit organizer access across all events, including roster/payment/attendance/strike review and audit history. Regular organizers keep their own-event limits. Only administrators can edit/delete existing locations and edit/delete events through the new administrative endpoints.

## Enable your administrator account

After signing into the website at least once, run from the repository root:

```powershell
npm run administrator:grant --workspace @tri-city/api -- YOUR_FIREBASE_UID
```

Reload or retry your profile to refresh the role. No account has been silently elevated. The existing organizer grant remains available. Both commands require trusted local database access; there is no public role-assignment endpoint.

## Locations page

Open the workspace and select Locations. Add/edit uses a Check for duplicates step before Save becomes available. Changing a form field invalidates the check. The API repeats the check, and PostgreSQL's unique expression index prevents a race between two saves.

Duplicate identity is the case-insensitive pitch name plus address, ignoring leading/trailing and repeated whitespace. It does not merge different named pitches at the same address or guess whether abbreviations refer to the same place. Timezone does not allow a duplicate physical location.

The migration merges matching legacy locations, keeping the most-referenced record (UUID tie-breaker), moving any event references to it and deleting the redundant records. In this local database it removed the unreferenced duplicate Midland Civic Arena at 123 dr; the original record and its three events remain.

Organizers can add and browse locations. Administrators also get Edit and Delete buttons. Deleting a location referenced by any event, including historical events, returns a clear conflict instead of deleting its events. Reassign relevant events before deleting it. Editing a shared location updates the shared record used by its events.

## Event editing and deletion

Administrators see All events and Edit/Delete controls. Edit supports title, description, pitch, schedule, capacity, USD price, guest allowance and cancellation cutoff. Existing signup price quotes and payment amounts are preserved. Reducing capacity below confirmed occupancy is rejected; increasing capacity promotes fitting FIFO parties under the event lock. Time changes to already-started events are rejected; metadata can still be corrected. Pending obligation due dates follow the event end.

Delete is archival: the event disappears from listings, while attendance, payments, strikes and audit history remain stored. For future events, active parties are cancelled without late penalties, outstanding charges are voided, and cancellation notifications are queued. Repeat deletes are idempotent. There is no permanent purge or restore UI in this milestone.

Event changes and deletions write audit history and enqueue notifications. Email delivery remains unconnected, so verify changes in the app rather than expecting an email. Location edits do not yet broadcast an event-change email.

## Review

1. Grant an existing profile Administrator and refresh it. Confirm it can manage another organizer's event while a regular organizer cannot.
2. Visit Locations. Check/save a new pitch, then try the same name/address with different capitalization and spacing. Save must be blocked.
3. Edit the location as Administrator; try deleting the used Midland location and verify it is protected.
4. Edit an event's price and verify existing bookings keep their accepted amounts. Test capacity below confirmed occupancy and an increase that promotes a waitlisted party.
5. Delete a test event with bookings. Verify it leaves listings while players retain cancelled booking history and void charges.

API: POST `/api/locations/check`, POST `/api/locations`; administrator-only PATCH/DELETE `/api/locations/:id` and PATCH/DELETE `/api/admin/events/:id`. Existing organizer endpoints admit Administrators and apply trusted server-side role checks for cross-event access.

The migration and duplicate cleanup were applied locally. API compilation, frontend production build, 16 unit tests and 19 isolated PostgreSQL scenarios passed. Browser review is manual.
