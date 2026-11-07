# Calendar, follow-up queues and Users directory

Upcoming games, My games and the organizer/administrator event workspace share a calendar with day/week filtering, month navigation, Today and All dates. Weeks run Monday through Sunday; filtering uses each venue timezone. Keyboard arrows navigate dates. The calendar stays beside results on wide screens and expands from a button above results on smaller screens.

My games has Upcoming games and Past games & payments tabs. Search, venue, organizer, booking and player payment-report filters retain the existing one-card-per-event history. Needs my payment report includes eligible, unreported confirmed host/guest paid seats after an event ends. Reporting paid/unpaid uses the existing payment dialog and never substitutes for an organizer's payment record.

The event workspace retains ownership and minimal cross-organizer visibility. All/Upcoming/Past tabs, calendar, search, venue/status and Review state / missing-record filters narrow the list. Follow-up counts include only ended published/completed events and confirmed seats: UNMARKED attendance or paid non-void/non-free seats without an organizer answer. Both Received and Not received count as reviewed. Counts and filters are calculated before the 100-result limit; completing reviews refreshes the queue.

Users is a card-styled table that becomes stacked rows on narrow screens. Server-side filters cover search, role, pending organizer requests, presence of an admin rating, and current strikes/three-strike blocks. Sort by account name, date joined, email, role or admin rating; cursor pagination uses a stable ID tie-breaker and reports the matching count. Manage expands the existing contact, rating, role, request and strike controls. Permission checks and confirmations are retained.

Existing How to guides were updated without new screenshots or placeholders. No schema changes, external services or scheduled jobs are required.

Validation: 40 API unit tests, 69 isolated PostgreSQL scenarios and 46 frontend logic tests passed. Production frontend build passed. Local headless browser checks verified calendar filtering, mobile disclosure, user column sorting and no horizontal overflow at 320, 375, 430, 768, 1280 and 1920 pixels across Upcoming, My games, workspace and collapsed/expanded Users views.

## Collapsed events and review sign-off

My games filters start collapsed and share the Upcoming games summary text color. Locations has a collapsed filter panel for venue/address search, city, photo/map coverage and name/city sorting.

Managed event cards start collapsed with date, title, organizer, lifecycle status, review status and missing-record counts. Needs review means no ATTENDANCE_UPDATED audit action exists, even if payments have been entered. In progress means attendance history exists, including later resets to UNMARKED. Completed requires an explicit EVENT_REVIEW_COMPLETED audit entry from an administrator confirming players had an opportunity to address payment discrepancies. Sign-off works at any time, is idempotent, does not alter lifecycle/payment/strike data, and does not prevent later corrections. A separate legacy lifecycle completion route is also administrator-only.

The three missing past events in the development database had deletedAt set. Admin All events now includes retained deleted past games, labeled as deleted, without restoring public discovery, editing, sharing or adding players. Administrators start on All events; organizers still start on My events. Deleted past games do not contribute to outstanding-record counts. Existing How to text is updated without new screenshot placeholders. Review sign-off uses the existing audit table; no database migration is required.

Follow-up validation: 40 API unit tests, 71 isolated PostgreSQL scenarios and 48 frontend logic tests passed. Read-only verification of the actual development database returns all three retained past games (two free, one paid). Browser checks confirm collapsed My games filters, identical summary text colors, collapsed/expanded workspace cards, admin acknowledgement, location filters, and no horizontal overflow at 320-1920 pixels.
