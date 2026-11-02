# Email/password authentication review

Google remains supported. Facebook was removed from the frontend UI and client SDK integration. Email/password sign-in uses the existing Firebase project and configuration. No database migration or new external provider is needed.

## Credential handling

The browser submits passwords directly to Firebase Authentication through its official SDK. Firebase manages password hashing/storage and reset/verification action links. The app does not implement a second credential store: PostgreSQL has no password fields, and the app does not write passwords or hashes to browser storage, logs, analytics, URLs or its API. The API continues to receive only Firebase ID tokens and resolves accounts by UID rather than linking them by matching email.

Forms use password input fields and password-manager autocomplete hints, permit pasting and passphrases, and never trim passwords. Password fields are cleared before async sign-in/registration, on mode changes and on component destruction. Invalid/mismatched forms stay open for correction. Registration requires 12 characters and also checks Firebase's configured password policy; existing shorter passwords remain usable for sign-in. Set Firebase Password policy to Enforce with a minimum of at least 12 for server enforcement; the browser rule alone does not change your project's policy. Enable email enumeration protection in Firebase. Reset confirmation text is identical for existing and nonexistent accounts, and errors never display raw SDK exception messages.

New email accounts remain on a verification screen until the emailed link is opened. They can resend it or check verification; the latter reloads the Firebase user and forces a fresh ID token before loading the app profile. Failed verification-email sends leave a recoverable signed-in account. The backend rejects unverified password-provider tokens even when a database profile already exists. Existing Google sign-in and role assignment are preserved.

## Firebase configuration

Email/Password is already enabled per the project setup. No runtime config change is required. Review email verification/password-reset templates and the password policy in the console. Firebase's default hosted email action handler is used. Disable Facebook in Firebase Authentication -> Sign-in method if you want the provider disabled at the project level too; no remote console settings were changed by this patch. Existing accounts are retained.

## Local verification

```powershell
npm run test:auth --workspace @tri-city/web
npm test --workspace @tri-city/api
npm run build --workspace @tri-city/web
npx tsc -p apps/api/tsconfig.json
```

- 11 auth tests passed with local Firebase SDK doubles, exercising sign-in credential routing, registration/policy, verification, resend/failure recovery, reset privacy, safe errors, Google support, late profile responses, and form password clearing/confirmation.
- All 18 API unit tests passed, including verified/unverified password-token tests.
- Angular production build and API TypeScript compilation passed. The auth test harness also passed strict TypeScript checking.
- The combined root build hit an existing Windows Prisma engine DLL lock during regeneration. This feature does not change the schema; the current generated client works for API compilation/tests. Stop the process holding that DLL before regenerating rather than replacing it while loaded.
- The full Angular DOM test suite still requires the previously missing Vitest/jsdom packages. The new auth suite uses installed Node/tsx tooling and does not need those packages. No real Firebase signup, verification email, password-reset delivery, or browser test was performed. No new accounts or emails were created/sent during tests.

## Manual review

1. Restart the dev servers and open Sign in. Confirm email/password, Create account, Forgot password, and Google are offered; Facebook is absent.
2. Create a test email account with a long unique password. Confirm no authenticated app profile/actions appear before verification. Open the verification link and click I've verified my email; profile and bookings become available.
3. Sign out and back in with email/password. Check wrong-password errors, password-manager autofill, session restoration on reload, and sign-out clearing private app state.
4. Request a password reset, open Firebase's link, set a new password, and sign in with it. Verify the old password fails.
5. Confirm Google sign-in and existing organizer/administrator permissions still work. A cross-provider email conflict must never silently create or merge another database profile.

Official SDK references: [password authentication](https://firebase.google.com/docs/auth/web/password-auth) and [verification/reset](https://firebase.google.com/docs/auth/web/manage-users).
