# Tri-City Drop-In

Current review milestone: [payment reminders and strike restrictions](docs/payment-reminders-strikes-review.md), plus [organizer workspace layout](docs/organizer-workspace-layout-review.md), plus [editable themes and header shortcuts](docs/theme-review.md), plus [Users, administrator ratings and account roles](docs/admin-ratings-review.md), plus [game filters, grouped history and team reshuffle](docs/filters-history-reshuffle-review.md), plus [teams, player selection, organizer contacts and review dialogs](docs/teams-invitations-review.md), plus [event equipment and player targets](docs/event-guidance-review.md), plus [player identity, skill ratings, organizer requests and guest responsibility](docs/player-identity-review.md), plus [venue photos and Google map embeds](docs/location-media-review.md), plus [player contact, avatars and My Games](docs/player-profiles-review.md), plus [event management and in-app notifications](docs/event-management-review.md), tested with local PostgreSQL and no external notification services. Administrator role, event edit/delete controls, a separate workspace Locations page, and duplicate-location prevention/cleanup. Players pay in person; signup, payment reviews, organizer attendance and strikes remain in place. Start with the [Administrator review](docs/administrator-review.md), [organizer review](docs/organizer-review.md), [signup review](docs/signup-review.md) and [Firebase setup](docs/firebase-setup.md).

## Local Docker development

Requires Docker Desktop with Linux containers.

```powershell
docker compose build
docker compose up -d db
docker compose run --rm api npx prisma migrate deploy --schema apps/api/prisma/schema.prisma
docker compose up -d
```

Open http://localhost:4200. API: http://localhost:3000/api/events and `/api/health`. Initially the event list is empty. No fake users or published events are created automatically. The commands apply committed migrations. Native development is recommended for first-time Firebase setup; Docker additionally requires backend ADC credentials mounted read-only (see the setup guide). Production will use `prisma migrate deploy` in a separate migration job.

## Native development

Use Node 22.12+ with npm. From the root, run `npm install`, copy `apps/api/.env.example` to `apps/api/.env`, start PostgreSQL with `docker compose up -d db`, then run `npm run db:deploy --workspace @tri-city/api`. In separate terminals run `npm run dev:api` and `npm run dev:web`. Both native API development and Prisma commands read `apps/api/.env`. Configure Firebase using the linked guide to enable sign-in.

`npm run build` builds both applications. `npm run db:generate` regenerates the Prisma client.

## Review sequence

1. **Completed:** foundation, schema, and read-only event listing.
2. **Completed:** Firebase Google and email/password sign-in, email registration/verification/password reset, verified API identity, profile and organizer authorization; event creation. Facebook sign-in has been removed. See [email/password review](docs/email-password-review.md).
3. **Current review:** transactional signups, guests, capacity enforcement, cancellations, waitlist promotion, payment obligations and private rosters; concurrency tests.
4. **Current review:** organizer party removal/promotion, attendance, manual strikes/revocation and audit history. See [organizer review](docs/organizer-review.md). Payment review is implemented; automatic suspension/expiry policy is not selected.
5. **Current review:** owner/administrator event cancellation and completion, private in-app notification inbox, unread state and refresh-driven 24-hour reminders. See [event management review](docs/event-management-review.md). External delivery workers and Cloud SQL/Cloud Run deployment remain future work.

See [database and behavior decisions](docs/architecture.md). No cloud resources are provisioned by these repository commands.
