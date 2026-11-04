# Event equipment and informational player targets

Event creation and existing administrator editing now include:

- A Pinnies / bibs will be provided checkbox.
- When unchecked, the number of different shirt colors each player should bring (1-10, default 2). The description can name the desired colors. When bibs are provided, the shirt count is hidden and stored as null.
- An optional Minimum player target (1 through capacity). Blank means no target. This is explicitly informational: falling below it never cancels, unpublishes, closes registration, blocks publishing, or blocks event completion.

Upcoming games, My Games and organizer event cards show the equipment guidance and confirmed count versus target. Confirmed guest seats count; waitlisted and cancelled seats do not. Cards indicate the remaining number or that the target has been reached, and state that organizers may run below target. Counts update with the existing refresh flow rather than live push.

Existing events have null guidance/target so the migration does not invent equipment promises or a minimum. Edits that omit these fields preserve them. Administrators can set/clear targets and update equipment under the existing event-edit permissions, audit history and participant-change notices. Reducing capacity below a configured target requires lowering or clearing the target in the same edit; this validates configuration only and never cancels a game because too few players join.

Applied additive migration 20261102040000_event_equipment_player_target to local PostgreSQL. It adds nullable bibsProvided, shirtColorCount and minPlayers plus database range/consistency constraints. No scheduling worker, cancellation policy, new external service or new permission was introduced.

Verification: Angular production build, API TypeScript compilation, all 29 API unit tests and all 33 isolated PostgreSQL integration scenarios passed. New tests cover defaults/invalid inputs, preserving unknown legacy guidance, bib/shirt transitions, target clearing, confirmed guests, data in public/private/organizer views, and publishing/booking/completing below-target events. Browser/visual testing remains manual. The existing Windows Prisma engine DLL lock recurred during generation; the updated generated runtime/types were exercised by successful compilation and PostgreSQL tests with the same installed engine.

For manual review, create a draft with no bibs, three shirt colors and a target above current bookings. Publish it and join with a guest; check the target and clothing guidance on Upcoming games and My Games. Confirm the guest counts and the event stays published below target. As an administrator, edit to provide bibs, then clear the target. Check that shirt-count guidance disappears and no automatic cancellation happens.
