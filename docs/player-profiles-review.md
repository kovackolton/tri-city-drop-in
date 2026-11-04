# Player contact, avatars and My Games

## Player contact

My profile now includes optional contact email and phone fields. Empty contact email falls back to the account's existing sign-in email; editing it does not change Firebase credentials or the database sign-in email. An empty phone clears it. Contact email and phone are self-reported, not separately verified. Phone accepts 7-15 digits plus common formatting and an optional leading country-code plus sign.

The owning organizer and administrators can see email/phone links in the private event roster for booked accounts, including booking history. Other organizers cannot open the roster. Guest contact goes through the booking account. Participant lists and My Games organizer summaries exclude email and phone. Clicking a contact link opens the user's mail/phone application; this app does not send messages or provision an external messaging service.

## Profile pictures

The Firebase guard imports a Google profile photo URL from verified Google-provider ID tokens for both new and existing accounts. Only HTTPS URLs on numbered Google image hosts such as lh3.googleusercontent.com are accepted. Profile updates cannot submit arbitrary photo URLs. The app stores only the URL, an avatar-color name and a Google-photo preference; no image bytes, uploads, image storage service, or generated image files are used.

Players can choose their initial and one of eight background colors instead. Google is selected by default, with an initial shown when no photo exists or an image load fails. Initials use the first Unicode code point of the display name. Guests use their own name's initial and the booking account's color, without inheriting the account holder's face. Initial preference is preserved when Google photo metadata refreshes. A user who chooses an initial does not expose their stored photo URL in participant/roster summaries.

Existing Google accounts pick up photo metadata on their next authenticated Google session request. A linked account using password sign-in can sign in with Google to refresh it; no automatic account linking was added. Google photos remain remotely hosted, and viewing one makes a browser image request to Google with no referrer. Choosing initials avoids that image request.

## My Games

Game cards now have a dark green header, pitch-local date tile, readable booking/event badges, kickoff/end times, venue address, accepted per-player price, descriptions and an organizer avatar. Party cards show account/guest identity, avatars, price/payment review, attendance and strikes. The expandable lineup uses avatar tiles, confirmed/waitlisted counts and guest-to-booking-account labels. Cancellation confirmation, payment reviews and participant authorization remain intact.

## Local migration and verification

Applied `20261102010000_player_contact_avatars` to local PostgreSQL. It adds nullable contactEmail/phone and defaulted avatarColor/useGooglePhoto fields, with a database palette constraint. Existing user IDs, roles, sign-in emails, and bookings are retained. On another checkout run db:deploy and regenerate the client.

- Angular production build and API TypeScript compilation passed.
- All 22 backend unit tests and 27 isolated PostgreSQL scenarios passed. Coverage includes input validation, safe Google URLs, preserved preferences, contact persistence/removal, organizer/admin permissions, and strict absence of contact fields from shared responses.
- All 12 local auth tests and four new profile/avatar tests passed using installed Node/tsx tooling, without Firebase calls. The frontend test harness also passed strict TypeScript checking.
- Local /api/health returned ok. The existing dev servers were left running.
- Prisma regeneration encountered the existing Windows engine-file lock held by the dev API. The updated generated types/runtime contain the new fields and were exercised successfully by compilation and PostgreSQL integration tests; the already-installed engine is the same Prisma version. No process was killed to replace the loaded DLL.
- Browser/visual checks and live Google photo retrieval were not performed. The Angular DOM suite still depends on the previously missing Vitest/jsdom packages.

```powershell
npm run test:profile --workspace @tri-city/web
npm run test:auth --workspace @tri-city/web
npm test --workspace @tri-city/api
npm run test:integration --workspace @tri-city/api
npm run build --workspace @tri-city/web
npx tsc -p apps/api/tsconfig.json
```

For manual review, save a contact email/phone and initial color in My profile, refresh to confirm persistence, then open the owning organizer's player list and test the contact links. Confirm another booked player sees the avatar/name but no contact details in Meet the players. Switch back to Google photo when available, and verify that a failed image falls back to an initial. Check My Games on desktop and mobile, including guest parties, waitlisted/cancelled bookings and payment review controls.
