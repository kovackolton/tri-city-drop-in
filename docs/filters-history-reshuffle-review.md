# Upcoming filters, grouped booking history and rating-aware reshuffle

## Upcoming games

The filter panel supports All dates / Specific day / Week of selected date, venue, city, organizer, title/venue/address search, free games and available places. Today and This week are shortcuts; Clear filters restores the full upcoming listing. Date matching uses each event venue's timezone, with Monday-Sunday weeks. Existing upcoming-only visibility remains: expired, draft, deleted and cancelled events are excluded.

Filtering happens server-side before the existing 100-result cap, including availability/date checks. Available places excludes full events and events with a waiting queue, since FIFO may prevent joining even when unused capacity remains. Results stay chronological, and active filters persist across refresh, joining games and navigating away/back. Newer filter responses win over stale in-flight requests. Facets come only from venues/organizers with upcoming published events and contain no private contacts or Firebase identifiers.

Locations now has an optional City field. Existing cities were not guessed from free-text addresses. Add a city to an existing venue through its administrator Edit action, or supply it when creating a new location. Venues without one remain visible under All cities and can still be found by venue/address search.

## One My Games card per event

Repeated cancellations/rejoins are grouped by event ID, not title: different scheduled events with identical titles remain distinct. Each event shows its active booking when available, otherwise the latest attempt. Upcoming/ongoing events remain above collapsed Past games. Booking history under each card retains earlier parties, guests, accepted prices, payment review, attendance, strikes and cancellation source/time. No signup, payment or strike records were deleted or merged.

The API now selects the 100 most recently booked distinct events and returns all their complete booking attempts, rather than truncating history at 100 individual bookings. It aggregates per-event player cancellation counts from host seats, so cancelling a party with guests counts once. Retries do not increment a count. Organizers can also see the player's cancellation count for their event in the private roster.

New cancellations record PLAYER, ORGANIZER or EVENT on each affected seat. Organizer removals and event-wide cancellations are excluded from the player's counter. The migration identifies older organizer removals only when an existing audit record positively identifies the booking. Other historical cancellations have no reliable actor; they remain visible as earlier cancelled bookings with actor unknown and are counted separately. No speculative history was attributed to a player.

## Reshuffle and rebalance

Under View players -> Teams, enabled rating-based events now have Reshuffle & rebalance beside the existing deterministic Auto-balance action. Both require organizer confirmation and only the owner or an administrator may run them before the event ends.

Reshuffling samples fresh, evenly sized candidate rosters, evaluates average self-rating spread and prefers fewer repeated teammate pairs. It compares actual teammate groups, not just swapped team labels. The deterministic balance is included as a quality baseline; candidates within one rating point of the best sampled average spread can trade some balance for new teammates. Guests and unrated players still use 3/5. This is approximate and can produce similar rosters when few alternatives exist.

Only confirmed seats participate, each exactly once, and team sizes differ by at most one. Ratings stay private to staff. The existing event-row lock, assignment cleanup and eligibility rules remain. TEAMS_RESHUFFLED audit entries record the operation. Organizers retain their manual assignment dropdowns and final say; later joins do not silently rearrange saved teams.

## Local verification

Applied additive migration 20261102060000_city_cancellation_source to local PostgreSQL. Frontend production build, API TypeScript compilation, all 34 API unit tests, 40 isolated PostgreSQL scenarios and 12 local frontend profile/store tests passed; the frontend test harness passed strict TypeScript checking. Coverage includes venue-timezone day/week boundaries, filter validation/combinations/FIFO availability/facet privacy, grouped attempt history, cancellation source/count idempotency, fresh teammate generation, rating-aware size balance, organizer overrides and stale filter response isolation.

No external services or real Firebase accounts were used for these checks. Browser/visual review remains manual, and the full Angular DOM suite still requires the previously missing Vitest/jsdom packages. Prisma's existing Windows engine lock recurred; updated generated types/runtime were exercised successfully by compilation and database tests with the same installed engine.

Manual review: add City values in Locations, combine date/city/venue/organizer filters and clear them. Cancel/rejoin a game multiple times and verify one card plus an increasing player-cancellation count, then compare an organizer removal/event cancellation which must not increase it. Expand Booking history to inspect earlier guests/payments/strikes. Enable balancing, reshuffle a confirmed roster, and move players manually afterward to confirm organizer control.
