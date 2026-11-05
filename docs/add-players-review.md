# Add players after event creation

Open Organizer/Admin workspace -> Manage players -> Players -> Add player on a future draft or published event. Search existing accounts by account name or nickname, select one, then choose:

- Send invitation: the player confirms before booking. Published games notify immediately; draft invitations wait for publication. Private invitations open the private-game link. Pending duplicates are reused, and previously answered invitations can be sent again.
- Book now: the organizer books one seat without player confirmation at the displayed current event price. Full events follow the existing FIFO waitlist. Draft seats are provisional. The player receives an in-app notification and can cancel from My games.

Organizers can add players only to events they own; administrators may do so on any event. The server locks the event, rechecks ownership/lifecycle, requires an existing player, checks the quoted price and enforces the player's current waiver and strike limit. Repeated booking requests retain one booking, audit and notice. A stale price requires refreshing before booking. Started, cancelled, completed and deleted events reject additions.

For private games this is an explicit owner/admin booking exception to link-only player joining. The server supplies the invite key internally after authorization; callers cannot provide an administrator override or bypass ordinary player joining. Invite keys are not returned by this endpoint. A private player who cancels still needs the original invite link to rejoin themselves, or can be added again by an authorized organizer.

Immediate additions are audited as ORGANIZER_BOOKED_PLAYER with playerConfirmation=false. They do not generate PLAYER_EVENT_COST_ACKNOWLEDGED records or claim that the player confirmed the price. A pending invitation is fulfilled and its notification marked read when the organizer books that player. No additional schema migration or external notification service is required.

The responsive add-player panel disables duplicate submissions, retains a failed selection for retry and discards stale search results after changing events. Existing roster payment/strike summaries and management functions remain available. Automated checks cover public/private bookings, ownership/admin access, concurrency/idempotency, capacity/FIFO, stale prices, draft invitations/bookings, re-invitation, waiver/strike enforcement, closed events, frontend selection/modes and stale responses.
