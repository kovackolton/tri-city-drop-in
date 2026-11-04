# Event editing and returning to draft

Organizers can edit their own events from Organizer workspace -> Event actions -> Edit event. Administrators retain access to all events. The organizer PATCH endpoint checks ownership under the event row lock; changing an event ID or submitting an organizerId cannot bypass that check. Cancelled/completed events remain uneditable.

While editing a future published event, Publication after saving offers Keep published or Return to draft. Saving event details and the draft status is one transaction. Draft transitions are rejected for started events, and normal edit validation still applies. Publishing remains a separate Publish event action rather than a writable arbitrary status.

Returning to draft hides the game from public listings and share pages, pauses joining and invitation acceptance, and retains existing bookings, team assignments and agreed seat prices. Those bookings remain visible as provisional in My games, where players can cancel without a late-cancellation penalty while it is draft. Booked players receive an in-app notice. Draft changes do not promote waiting parties; publication resumes FIFO promotion at each party's original accepted price and notifies booked players that the event is published. Draft invitations retain their existing deduplication behavior.

Edits and draft transitions are audited. No schema migration or additional cloud service is needed. Deploy through the existing GitHub pipeline to make the changes live; this work does not deploy directly.

Validation covers owner/admin editing, rejection of another organizer and ownership-field injection, draft/public visibility, retained booking/payment quotes, paused joins/promotions, draft cancellation, republishing, no-op retries, invalid-edit rollback and invalid lifecycle transitions. Frontend checks cover editing permissions and the guarded edit payload; production Angular compilation validates the updated form.
