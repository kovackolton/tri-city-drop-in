# Firebase setup for the sign-in milestone

No cloud resources have been created automatically. Public event browsing works without Firebase. Sign-in and organizer actions need the configuration below.

## 1. Create your project and enable sign-in

1. Open https://console.firebase.google.com/ and create a project. Google Analytics is optional for this application.
2. In Project settings → General, register a Web app. Copy its public Firebase configuration into `apps/web/public/config.json` under `firebase`: `apiKey`, `authDomain`, `projectId`, `appId`. These identify the web application and are public; never put service-account private keys in this file.
3. Open Authentication → Get started → Sign-in method. Enable Google and select a support email.
4. In Authentication → Settings → Authorized domains, add `localhost` for local development and your production domain when it exists. New projects may not include localhost automatically.
5. Enable Email/Password in Authentication -> Sign-in method (already enabled if you have configured it). Email-link/passwordless authentication is not used here. Google remains available. Disable the Facebook provider in the Firebase console if it was previously enabled; its client UI and SDK integration have been removed. Do not delete existing Firebase users or database profiles.
6. In Authentication -> Settings -> Password policy, configure a minimum of at least 12 characters and Enforce mode. The registration form also requires 12 characters and validates Firebase's configured policy. Configure server enforcement in Firebase so a direct SDK request cannot bypass the browser rule. Enable email enumeration protection for the project.
7. Review Authentication -> Templates for email verification and password reset. Firebase's hosted action pages handle those links; no custom action URL or app password endpoint is required. Use HTTPS for the deployed web app.

The application exposes Google and email/password sign-in, account creation, verification-email resend/check, and password reset. A newly created email/password account must verify its email before accessing authenticated app endpoints. Cross-provider email conflicts never merge database accounts automatically; sign in with the original account. Passwords are sent directly to Firebase through its SDK, and Firebase manages their credential storage. No passwords or password hashes are stored in this application's database, browser storage, application logs, or API requests. Firebase session persistence remains managed by its SDK. See [email/password review](email-password-review.md).

## 2. Configure and authorize the backend

Copy `apps/api/.env.example` to `apps/api/.env` if needed. Keep your existing database URL. Set `FIREBASE_PROJECT_ID` to the same project ID as the frontend.

For native local development, install the Google Cloud CLI and use Application Default Credentials:

```powershell
gcloud auth application-default login
gcloud auth application-default set-quota-project YOUR_PROJECT_ID
```

The local Google identity needs Firebase Authentication read permissions in that project (for example Firebase Authentication Viewer), because the API checks revoked/disabled sessions as well as token signatures. Enable the Identity Toolkit API if requested. Do not send credentials in chat or commit them. The project administrator may need to grant the relevant IAM permission.

On Cloud Run, use the service's dedicated runtime identity and grant the corresponding Firebase Auth read permission. Do not deploy a downloaded private-key file. Cloud Run provisioning remains a later milestone.

For Docker, `FIREBASE_PROJECT_ID` is forwarded from the shell or root Compose `.env`; native `apps/api/.env` is not read by Compose. Local Docker also needs an ADC file mounted read-only with `GOOGLE_APPLICATION_CREDENTIALS` pointing to the mounted path. The supplied Compose file does not mount host credentials; use native API development for the first real-provider test.

## 3. Install, migrate and run

From the repository root:

```powershell
npm install
docker compose up -d db
npm run db:deploy --workspace @tri-city/api
npm run build
npm run test --workspace @tri-city/api
```

Run `npm run dev:api` and `npm run dev:web` in separate terminals. Open http://localhost:4200 and sign in with Google or email/password. For a new email account, open Create account, verify through the emailed link, then click "I've verified my email". The first verified API request creates your PLAYER profile.

The pricing/constraints migration is additive and preserves the existing initial migration. Existing invalid data will cause the new CHECK constraints to fail; correct that data before retrying. Do not reset a database containing data you need.

## 4. Grant yourself organizer access

Find your UID in Firebase Authentication → Users after your first sign-in, then run:

```powershell
npm run organizer:grant --workspace @tri-city/api -- YOUR_FIREBASE_UID
```

This requires local database access. There is no public role-assignment endpoint. Click Retry profile or reload the page to refresh the role; the Organizer workspace becomes available. Create a location, create a Free or paid event as a draft, then publish it. Open a separate signed-out browser to confirm only published events appear.

## Review checklist

If the Angular terminal reports `ECONNREFUSED ::1:3000`, the request has not reached Firebase verification. The development proxy uses `127.0.0.1:3000` to match Nest's IPv4 listener. Restart `npm run dev:web` after changing proxy configuration. Opening `/api/me` directly without a bearer token returns 401 by design; test the signed-in application request instead.

- Google and verified email/password sign-in persist on reload; sign-out removes the profile and organizer controls.
- Profile display names can be edited. Email and role cannot be changed through that API.
- A normal PLAYER cannot call organizer endpoints, even by crafting HTTP requests.
- An organizer can create a location and a draft event; drafts remain private to that organizer.
- Publishing makes the event appear publicly with location time, capacity and USD price.
- Another organizer cannot publish your draft.
- Negative or fractional-cent prices and invalid time ranges are rejected.

Automated unit tests cover input and authorization logic with injected test doubles. A real Firebase project and PostgreSQL instance are still required to verify complete provider sign-in and database behavior.

## Optional authentication emulator

For isolated local testing, start the Firebase Authentication emulator with a demo project ID using the Firebase CLI. Set backend `FIREBASE_PROJECT_ID=demo-tricity` and `FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099`; set frontend project ID to the same demo ID, nonempty demo values for the other Firebase fields, and top-level `authEmulatorUrl` to `http://127.0.0.1:9099` in `config.json`. Use only locally created emulator accounts. The frontend restricts emulator use to localhost, and the API refuses the emulator in production.

## Official references

- https://firebase.google.com/docs/auth/web/google-signin
- https://firebase.google.com/docs/auth/web/password-auth
- https://firebase.google.com/docs/auth/web/manage-users
- https://firebase.google.com/docs/auth/admin/verify-id-tokens
- https://firebase.google.com/docs/admin/setup
