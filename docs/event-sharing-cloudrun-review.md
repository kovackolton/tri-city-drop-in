# Event sharing and Cloud Run container

Published upcoming games have public /games/:id landing pages. Their initial HTML contains Open Graph title, description, canonical URL, image/alt metadata, icon and Twitter summary tags. No JavaScript is needed to read the event metadata or follow the real Join Game / Join Waitlist link. Previews are intended for iMessage, WhatsApp and Google Messages; those apps decide the final layout, can omit previews and may cache earlier information. A native interactive button inside a message is not promised: the card opens the landing page, which has the actual joining link.

The metadata and landing page show the event title, full venue-local date/time with timezone, venue, price per player and aggregate availability. With no queue, remaining seats are capacity minus confirmed player/guest seats, clamped at zero. If a queue exists, the text says Waitlist open and reports waiting seats even when unused capacity remains, because FIFO may prevent a new party from joining immediately. A full event also offers waitlist joining. The page explains that preview availability is a snapshot and the app rechecks current information on joining. Server HTML is sent no-store; messaging services can still maintain their own caches.

Approved venue photo URLs are reused without downloading/storing copies on the server. Missing/unsafe URLs use the included 1200x630 soccer-ball PNG. The human landing page also replaces a failed photo with that PNG; messaging crawlers cannot run that fallback script, so third-party venue image URLs must remain publicly reachable. A 192x192 soccer icon is provided for icon fallback. These are small local assets, not generated per request. The landing page uses the existing app theme stylesheet and saved theme preference.

The public share query selects only event/venue facts and anonymous seat statuses. It returns no player names, guest names, payment records, account IDs, administrator notes, organizer phone or organizer email fields. Draft, deleted and invalid links return a generic 404 page without revealing draft data. Cancelled/started/ended public games have an explanatory page with no joining link; the single-game joining API rejects them. All untrusted text/URLs are escaped in HTML, image protocols are checked and the configured public origin is used instead of request Host headers.

## Sharing and joining in the app

Upcoming event cards and organizer workspace published-upcoming event cards have Share event controls. Opening sharing fetches current metadata and exposes a native Share action when supported, Copy link and a selectable address fallback. The preparation step lets the eventual native Share call run directly from its own button press, preserving browser activation requirements. Shared text includes date, venue, price and availability even if the receiving app abbreviates metadata. Cancellation of the native share sheet does not show a failure.

Email game opens the user's email composer with a subject, event details, availability snapshot and website join link. The app does not send mail or collect recipients. Standard [mailto links](https://www.rfc-editor.org/rfc/rfc6068.html) provide a plain-text body, so they cannot reliably prefill an HTML card. Copy email card uses the [rich clipboard API](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/write) where available to supply both an inline-styled HTML table and plain text. Users paste it into their own rich-text email draft; the card contains the approved venue image or soccer-ball fallback, event details, availability and a static Join Game/Join Waitlist link opening the public game page. Text/URLs are escaped and unsafe URL protocols rejected. Email apps can strip formatting or block external images, and availability does not update inside a sent email. No email provider, background sender or new cloud service is required. Actual recipient-client rendering remains a manual check.

Join links open /?event=:id in the Angular app. That game is pinned separately from the normal filtered/100-result listing, with its own single-game request and unavailable state. The event query stays in the URL through sign-in, initial profile setup and waiver review. My profile has Return to shared game while a target is selected. Returning refreshes that event. Joining still requires authentication, current waiver acceptance, fewer than three strikes, guest acknowledgment and the paid-cost confirmation as applicable. Opening/sharing a link never books a seat. The refactored event card is shared by the list and targeted view.

## Cloud Run deployment preparation

Dockerfile.cloudrun builds one image containing the Nest API, public preview routes, fallback assets and compiled Angular files. The Node server listens on 0.0.0.0 and Cloud Run's PORT. It serves static files when WEB_DIST_PATH is set (the image sets it automatically). No Nginx upstream service discovery, Redis, scheduled process or second web service is required for this deployment. The existing two-container Compose setup remains available and now proxies /games/ and /share/ alongside /api/.

Build from the repository root:

```powershell
docker build --platform linux/amd64 -f Dockerfile.cloudrun -t tri-city-drop-in:cloudrun-preview .
```

Publish that image to your container registry and deploy it as a public Cloud Run service when ready. No cloud service was created or deployed during this work. The public entrypoint must permit unauthenticated requests so browsers and preview crawlers can load HTML/images; private API routes still require Firebase authentication and application roles. Configure the following at runtime:

- PUBLIC_SITE_ORIGIN: the exact public HTTPS origin, including your custom domain or Cloud Run service hostname. No path/query/credentials. Localhost HTTP origins are allowed explicitly for local Docker tests; remote HTTP origins are rejected.
- DATABASE_URL: your existing externally reachable PostgreSQL connection, supplied using the deployment's secret configuration. Cloud Run does not run the Compose PostgreSQL container. Apply existing schema migrations to a new production database through your established migration process; this feature adds no migration.
- FIREBASE_PROJECT_ID: the existing backend Firebase project.
- PUBLIC_FIREBASE_CONFIG: the public Firebase web app configuration as JSON, with apiKey/authDomain/projectId/appId. Optional messagingSenderId/storageBucket/measurementId are supported. The runtime /config.json route emits only those allowed client fields and no-store headers. It overrides any static file; no service-account JSON or private server configuration is exposed. Add your public hostname to Firebase Authentication's authorized domains and provide the runtime service identity with the permissions needed by the existing token-verification code.

See infra/cloudrun.env.example.yaml for public placeholders. Cloud Run supplies PORT; do not configure a second listener. Dockerfile.cloudrun.dockerignore excludes local web config from this image while preserving the classic web Dockerfile's existing behavior. Local .env/key/credential files are excluded from builds. The normal production WEB_ORIGIN can optionally be set; otherwise CORS uses PUBLIC_SITE_ORIGIN.

For local npm development, restart the web dev server to load the new /games and /share proxy rules. Local Compose uses PUBLIC_SITE_ORIGIN=http://localhost:4200 unless overridden. URLs on localhost cannot be fetched by external messaging apps; real preview verification requires public HTTPS hosting.

No paid messaging API, image-generation subscription or new always-running service was added. Preview requests use the existing database/API and static asset bandwidth, so usage-based hosting still applies. The container build's old npm edgesOut failure was fixed by updating the lockfile to include already-declared vitest/jsdom dependencies; existing locked runtime dependency versions were preserved. Existing dependency audit findings were not remediated as part of this feature.

## Local validation

The combined Docker image built successfully with clean Linux npm ci and production-only runtime dependencies. A smoke test launched the real image on injected PORT=9090 against an isolated local PostgreSQL schema and checked metadata, current availability, the Angular root/stylesheet, soccer PNG, runtime config, cancellation handling and rejection of an unauthenticated private API request. Its container and schema were removed afterward. To repeat from apps/api after building the image:

```powershell
node --env-file=.env --import tsx test/share-container-smoke.ts
```

API compilation, Angular build, 39 API unit tests, 57 isolated PostgreSQL scenarios, 28 frontend logic tests and strict frontend harness type checks passed. Tests cover no-JavaScript metadata, HTML escaping, FIFO, unavailable/draft privacy, absence of personal fields, fallback PNG dimensions, runtime configuration allowlisting, targeted-game/filter separation, stale responses and share preparation. Actual iMessage/WhatsApp/Google Messages rendering, external photo-host behavior and signed-in end-to-end browser flows remain manual checks after public hosting. Messaging apps may use an in-app browser rather than the external browser.
