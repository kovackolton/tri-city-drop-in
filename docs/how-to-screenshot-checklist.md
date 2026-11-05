# How to screenshot checklist

The in-app handbook contains 26 guides and 28 screenshot placeholders. Each capture checkbox below corresponds to one placeholder.

Put your PNG screenshots in `apps/web/public/images/how-to/` using the exact filenames below. After adding an image, rebuild/deploy; the placeholder automatically becomes the screenshot, with no component edits required. Missing/unreadable images keep an obvious Screenshot coming soon panel.

Use fictional/test accounts and games. Crop out credentials, personal contact details and private invitation keys. Capture only the relevant UI; a consistent width around 1200px works for desktop steps, and 375-430px for phone-specific steps. Keep labels readable; the site scales images to fit. Review each caption and capture instruction before adding the image.

## Capture list

- [ ] **sign-in-options.png** - Google and email sign-in
  - Guide: Getting started > Sign in, register and recover access > Continue with Google.
  - Account: Player / signed-out where appropriate.
  - Capture: Capture the Sign in page with Continue with Google and the email fields, without entering real credentials.
  - File: `apps/web/public/images/how-to/sign-in-options.png`.

- [ ] **profile-setup.png** - Player identity and contact setup
  - Guide: Getting started > Set up your profile > Set your player identity.
  - Account: Player / signed-out where appropriate.
  - Capture: Capture the profile identity, skill, avatar and contact sections with clearly fictional example values.
  - File: `apps/web/public/images/how-to/profile-setup.png`.

- [ ] **waiver-agreement.png** - Waiver and I agree action
  - Guide: Getting started > Review and e-sign the waiver > Record your agreement.
  - Account: Player / signed-out where appropriate.
  - Capture: Capture the expanded waiver ending with the electronic acknowledgment and I agree button; use a test account.
  - File: `apps/web/public/images/how-to/waiver-agreement.png`.

- [ ] **mobile-navigation.png** - Mobile menu and current page
  - Guide: Getting started > Navigate on mobile and change appearance > Move between pages.
  - Account: Player / signed-out where appropriate.
  - Capture: Capture a phone-width screen with Menu expanded, the current page label and header shortcuts visible.
  - File: `apps/web/public/images/how-to/mobile-navigation.png`.

- [ ] **game-filters.png** - Expanded upcoming-game filters
  - Guide: Playing > Find an upcoming game > Narrow down the list.
  - Account: Player / signed-out where appropriate.
  - Capture: Capture Filters with a sample city/date choice, the active count and Apply/Clear controls.
  - File: `apps/web/public/images/how-to/game-filters.png`.

- [ ] **join-cost-confirmation.png** - Paid game cost acknowledgment
  - Guide: Playing > Join a game and acknowledge its cost > Request a place.
  - Account: Player / signed-out where appropriate.
  - Capture: Capture the cost dialog showing a fictional game, per-player price, party total and acknowledgment button.
  - File: `apps/web/public/images/how-to/join-cost-confirmation.png`.

- [ ] **guest-booking.png** - Guest names and payment responsibility
  - Guide: Playing > Bring guests and use the waitlist > Add your party.
  - Account: Player / signed-out where appropriate.
  - Capture: Capture a booking form with one fictional guest, the guest responsibility checkbox and party total.
  - File: `apps/web/public/images/how-to/guest-booking.png`.

- [ ] **private-game-invitation.png** - Hidden private-game joining view
  - Guide: Playing > Open a private game invitation > Use the invitation.
  - Account: Player / signed-out where appropriate.
  - Capture: Capture the Private game heading and game card; omit or redact the invite key from any visible address bar.
  - File: `apps/web/public/images/how-to/private-game-invitation.png`.

- [ ] **my-games-booking.png** - My games party and cancellation
  - Guide: Playing > Manage your bookings and history > Use a My games card.
  - Account: Player / signed-out where appropriate.
  - Capture: Capture an active booking card with party information and cancellation controls, using fictional names.
  - File: `apps/web/public/images/how-to/my-games-booking.png`.

- [ ] **player-payment-review.png** - Player payment review dialog
  - Guide: Playing > Payments, acknowledgments and strikes > Report payment after the event.
  - Account: Player / signed-out where appropriate.
  - Capture: Capture the player payment dialog with I paid / I have not paid and the displayed seat amount.
  - File: `apps/web/public/images/how-to/player-payment-review.png`.

- [ ] **strike-reasons.png** - Strike reasons and joining access
  - Guide: Playing > Payments, acknowledgments and strikes > Resolve a joining block.
  - Account: Player / signed-out where appropriate.
  - Capture: Capture the expanded My profile strike section with a fictional payment discrepancy and its event details.
  - File: `apps/web/public/images/how-to/strike-reasons.png`.

- [ ] **notification-inbox.png** - Notifications and action buttons
  - Guide: Playing > Read notifications and invitations > Use your inbox.
  - Account: Player / signed-out where appropriate.
  - Capture: Capture an inbox containing fictional promotion and payment reminder notices with their actions.
  - File: `apps/web/public/images/how-to/notification-inbox.png`.

- [ ] **share-options.png** - Game sharing and email options
  - Guide: Playing > Share a game or email card > Choose a sharing method.
  - Account: Player / signed-out where appropriate.
  - Capture: Capture the expanded Share event panel with Copy link, Email game and Copy email card where supported. Use a public test game.
  - File: `apps/web/public/images/how-to/share-options.png`.

- [ ] **organizer-request.png** - Request organizer access in My profile
  - Guide: Playing > Request organizer access > Send and follow a request.
  - Account: Player / signed-out where appropriate.
  - Capture: Capture the player profile organizer request control and pending-state explanation.
  - File: `apps/web/public/images/how-to/organizer-request.png`.

- [ ] **workspace-event-scopes.png** - Workspace chips and event actions
  - Guide: Organizing > Find your events in the workspace > Choose the right workspace view.
  - Account: Organizer or administrator.
  - Capture: Capture My events / All events beside Refresh events and an owned card showing organizer details.
  - File: `apps/web/public/images/how-to/workspace-event-scopes.png`.

- [ ] **event-creation-form.png** - Event essentials and expandable sections
  - Guide: Organizing > Create, publish or privately invite to a game > Complete the event form.
  - Account: Organizer or administrator.
  - Capture: Capture the event form with basic fields filled using a fictional venue and the expandable section headings.
  - File: `apps/web/public/images/how-to/event-creation-form.png`.

- [ ] **event-publication-dialog.png** - Draft/publish dialog and private toggle
  - Guide: Organizing > Create, publish or privately invite to a game > Choose draft, publish and privacy.
  - Account: Organizer or administrator.
  - Capture: Capture Create your event with the private-game checkbox, Create draft and Create and publish controls.
  - File: `apps/web/public/images/how-to/event-publication-dialog.png`.

- [ ] **location-form.png** - Location form and media settings
  - Guide: Organizing > Add and maintain locations > Add a reusable venue.
  - Account: Organizer or administrator.
  - Capture: Capture Add location with a fictional address, timezone and optional photo/map fields.
  - File: `apps/web/public/images/how-to/location-form.png`.

- [ ] **event-edit-draft.png** - Editing and returning to draft
  - Guide: Organizing > Edit, unpublish, cancel or complete a game > Save event changes or return to draft.
  - Account: Organizer or administrator.
  - Capture: Capture the event editor with Publication after saving and Return to draft selected.
  - File: `apps/web/public/images/how-to/event-edit-draft.png`.

- [ ] **add-player-panel.png** - Add player search and booking modes
  - Guide: Organizing > Add players with or without confirmation > Search and choose a booking mode.
  - Account: Organizer or administrator.
  - Capture: Capture a selected fictional player, the confirmation-mode selector and current price in the Add player panel.
  - File: `apps/web/public/images/how-to/add-player-panel.png`.

- [ ] **player-management.png** - Expanded roster player management
  - Guide: Organizing > Find players, contacts and event history > Open a player record.
  - Account: Organizer or administrator.
  - Capture: Capture one fictional player expanded with payment/contact sections and the attendance/booking disclosure; redact private data.
  - File: `apps/web/public/images/how-to/player-management.png`.

- [ ] **team-management.png** - Team lists, assignments and balancing
  - Guide: Organizing > Assign, balance and reshuffle teams > Set up teams and assign players.
  - Account: Organizer or administrator.
  - Capture: Capture team columns with fictional players, Assign team selectors and balancing/reshuffle actions.
  - File: `apps/web/public/images/how-to/team-management.png`.

- [ ] **organizer-payment-review.png** - Organizer receipt confirmation dialog
  - Guide: Organizing > Confirm player and guest payments > Review each applicable seat.
  - Account: Organizer or administrator.
  - Capture: Capture Review payment received with Payment received / Not received and the seat amount for a fictional player.
  - File: `apps/web/public/images/how-to/organizer-payment-review.png`.

- [ ] **attendance-strike-review.png** - Attendance and reviewed strike controls
  - Guide: Organizing > Review attendance, incidents and booking overrides > Record attendance and reviewed incidents.
  - Account: Organizer or administrator.
  - Capture: Capture attendance controls and a strike review dialog for a fictional completed event, with an example explanatory note.
  - File: `apps/web/public/images/how-to/attendance-strike-review.png`.

- [ ] **admin-user-controls.png** - Users rating and role controls
  - Guide: Administration > Manage users, roles, ratings and requests > Find a user and change role or rating.
  - Account: Administrator.
  - Capture: Capture a fictional user card with separate self/admin ratings, Administrator rating and Account role controls.
  - File: `apps/web/public/images/how-to/admin-user-controls.png`.

- [ ] **admin-organizer-requests.png** - Pending organizer request actions
  - Guide: Administration > Manage users, roles, ratings and requests > Review organizer requests.
  - Account: Administrator.
  - Capture: Capture the Organizer requests filter and a fictional pending request with Grant/Clear actions.
  - File: `apps/web/public/images/how-to/admin-organizer-requests.png`.

- [ ] **admin-permanent-strikes.png** - Administrator permanent-strike management
  - Guide: Administration > Issue or correct permanent strikes > Use administrator strike management.
  - Account: Administrator.
  - Capture: Capture the administrator strike dialog with a fictional reason, issue button and a correct/revoke control.
  - File: `apps/web/public/images/how-to/admin-permanent-strikes.png`.

- [ ] **admin-event-actions.png** - Administrator event deletion confirmation
  - Guide: Administration > Manage events across organizers > Use administrator event access.
  - Account: Administrator.
  - Capture: Capture an administrator-owned test view of Event actions and the Delete event confirmation, using a fictional future event.
  - File: `apps/web/public/images/how-to/admin-event-actions.png`.

## Review after adding images

- [ ] Open the relevant guides on desktop and phone; confirm every image replaces its placeholder.
- [ ] Check light and dark themes, image legibility, captions and image cropping.
- [ ] Verify organizer/admin guides using the corresponding role and verify player navigation excludes them.

Guide text and screenshot IDs live in `apps/web/src/app/how-to/how-to-content.ts`. Update the image title there to change its caption and alt text. If you add/remove placeholders, update this checklist too.
