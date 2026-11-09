# Co-organizers and player team columns

Expand Organizers during event creation or editing to search existing organizers/administrators and select up to 20 co-organizers. The creator remains the immutable primary organizer. Adding/removing co-organizers takes effect on save, is audited, and sends an in-app notice. It does not create or cancel player bookings.

Co-organizers see assigned games in My events, including private/draft games. They share editing, publication, cancellation, player management/invitations, team management, attendance/payment review, history and private sharing permissions. Unrelated organizers retain only the existing minimal public overview. Removal revokes management access immediately. Delete and review-completion sign-off remain administrator-only. Existing signed-in role checks still apply; assigning a player without organizer/admin permission is rejected. Public displays expose organizer display names, not private contact/account data. Contact fields remain the event's explicit shared organizer contact.

Co-organizer UUIDs are stored in Event.coOrganizerIds with an empty default and GIN index. Inputs validate existence, eligible role, uniqueness, maximum count and exclusion of the primary organizer. Existing events need no backfill. Migration 20261109000000_event_coorganizers must run before deployment; the existing migration job handles this.

My games -> Teams & players shows configured teams in responsive columns, with confirmed players and guests under their assigned team. Unassigned confirmed players and waitlisted seats are separate. Team N suggests the Nth named shirt color from the event's equipment list. No color is invented or repeated for teams beyond that list; the entire shirt-color line is hidden. Suggestions do not change team assignments or equipment data; bib provision and the organizer's final decision remain explicit. Team columns stack on small screens.

Existing How to guides were updated without adding image placeholders.

Validation: 41 API unit tests, 73 isolated PostgreSQL scenarios and 50 frontend logic tests passed. Browser checks verified organizer selection, team assignments, guests, unassigned/waitlisted groups, dark/light/fallback suggestions and no horizontal overflow at 320, 375, 430, 768, 1280 and 1920 pixels. The local database migration is applied.
