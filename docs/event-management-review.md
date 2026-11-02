# Event management and in-app notifications

This milestone runs against local PostgreSQL. No email, SMS, push provider, notification worker, or cloud resources are needed. Existing Firebase authentication is retained; automated backend tests call services directly and test the authentication guards with local doubles, without contacting Firebase. No authentication bypass was added.

## Behavior

- Existing creation/publishing and administrator editing/deletion remain available. Organizers can cancel their own future draft/published events; administrators can cancel across organizers. Cancellation keeps the event visible in the workspace and My games history, cancels all active seats without a late-cancellation penalty, voids payment obligations, and writes one notice per booking account in the same transaction. It does not promote the waitlist. Cancellation retries are idempotent.
- Organizers/administrators can mark published events completed after the end time. Attendance, financial records, strikes and audit history remain available for review. Cancelled/completed events cannot be edited or reopened. Editing permissions remain administrator-only. Unchanged edits do not generate notices or audits; existing accepted-price snapshots remain unchanged by edits.
- Signed-in players have a Notifications page and unread badge. Event edits/cancellations, organizer booking removal, and waitlist promotions appear there. Notices belong to the account holder, including their guests. Read state is persistent and private. Individual and bulk mark-read requests cannot affect another account's notices.
- Refreshing the inbox creates reminders for confirmed bookings starting within 24 hours. Waitlisted, cancelled, deleted and past events receive no new reminder. Reminder creation uses the event lock and a unique booking/start-time key; rescheduling allows one new reminder. Notices already created remain historical records even after later changes.
- The app refreshes notifications every 30 seconds while open and supports manual refresh. Reminders are generated on refresh, rather than by a background scheduler while the app is closed. The latest 100 notices are shown; unread count covers all available notices and Mark all as read covers them all. There is no pagination in this milestone.
- Existing PENDING/SENT outbox rows become visible in the inbox once availableAt is due; FAILED and scheduled rows remain hidden. Reading does not change delivery status, attempts, or sentAt. No external delivery is claimed.

## Local setup and verification

The migration `20261102000000_in_app_notifications` adds readAt and a user/creation-order index. It was applied to the local database. On another checkout run:

```powershell
npm run db:deploy --workspace @tri-city/api
npm run db:generate
npm run build
npm test --workspace @tri-city/api
npm run test:integration --workspace @tri-city/api
```

Production builds and all 16 API unit tests passed. All 26 PostgreSQL integration scenarios passed in an isolated temporary schema, removed afterward. Seven new scenarios cover cancellation authorization/idempotency/charges, completion timing/access, cancellation-versus-join races, private read state, concurrent reminder deduplication, future/failed visibility, reminder windows/rescheduling, and unchanged edits. Existing signup, payment, administrator, location and organizer scenarios still pass.

The frontend test runner could not start: declared Vitest/jsdom dependencies are absent from node_modules. An offline npm install failed internally (`edgesOut`); no external download was attempted. Frontend regression tests were added for account-switch response isolation, mark-all reloads, and error recovery, but are unexecuted. The existing app smoke assertion now checks the visible Upcoming games heading. No browser or live Firebase session test is claimed.

For manual review with an existing signed-in session, restart the API/web dev servers, join a future game as a player, edit it as an administrator, and refresh Notifications. Verify the unread badge, mark-read persistence after reload, and that a different account cannot see the notice. Cancel as the owner and verify My games shows cancelled seats and void payments. For a game within 24 hours, verify a confirmed account receives one reminder across repeated refreshes while a waitlisted account does not. For an ended published event, mark completed and verify attendance/payment review is still available.

## Endpoints

- POST /api/organizer/events/:id/cancel
- POST /api/organizer/events/:id/complete
- GET /api/me/notifications
- POST /api/me/notifications/:id/read
- POST /api/me/notifications/read-all

All endpoints require the existing authenticated session. Event transitions additionally require organizer/administrator role and owner checks on the server.
