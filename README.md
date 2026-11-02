# Tri-City Drop-In

Current review milestone: Administrator role, event edit/delete controls, a separate workspace Locations page, and duplicate-location prevention/cleanup. Players pay in person; signup, payment reviews, organizer attendance and strikes remain in place. Start with the [Administrator review](docs/administrator-review.md), [organizer review](docs/organizer-review.md), [signup review](docs/signup-review.md) and [Firebase setup](docs/firebase-setup.md).

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
2. **Completed:** Firebase Google/Facebook integration, verified API identity, profile and organizer authorization; event creation. Email/password and additional provider screens are future extensions.
3. **Current review:** transactional signups, guests, capacity enforcement, cancellations, waitlist promotion, payment obligations and private rosters; concurrency tests.
4. **Current review:** organizer party removal/promotion, attendance, manual strikes/revocation and audit history. See [organizer review](docs/organizer-review.md). Payment review is implemented; automatic suspension/expiry policy is not selected.
5. Notification worker, reminder scheduling, Cloud SQL/Cloud Run infrastructure and deployment checks.

See [database and behavior decisions](docs/architecture.md). No cloud resources are provisioned by these repository commands.
