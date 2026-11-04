# Venue thumbnails and Google map embeds

Location records now support optional photoUrl, photoCredit, and mapEmbedUrl fields. Upcoming game cards and My Games use the location's thumbnail beside the title and show its map near the address. The settings are reused across all events at that location. Locations includes a saved-media preview.

## Configure a venue

1. Open Organizer workspace -> Locations. Administrators can edit existing venues; organizers can set media while creating a venue. Existing edit/delete permissions are unchanged.
2. Add a direct HTTPS photo URL that you have permission to embed. Add optional photo credit text. The original host serves the image; the app stores no image files and makes no backend image download/proxy requests.
3. In Google Maps, find the exact venue and choose Share -> Embed a map -> Copy HTML. Paste the copied iframe into Google Maps embed, or paste only its src URL. Verify the map's pin identifies the intended venue/entrance.
4. Run the existing duplicate check and save. The backend checks duplicates again. Existing events use the settings after refreshing their cards.

Only the normalized Google embed URL is stored, never arbitrary HTML. The implementation uses Google Maps' manual share/embed feature, with no API key, billing setup, Places search, photo API, or geocoding call. Existing locations start with empty media fields; no photos or embed links were invented or automatically assigned.

Blank or failed photos display a building icon. Without a configured map, the card still provides a Get directions in Google Maps link using the venue name and address. With a configured map, both the map and directions link appear. Images and iframes use browser lazy loading, and collapsed past-game cards do not render their media until opened. Images use no-referrer; embedded maps retain their standard Google controls/attribution. Cross-origin map availability and pin placement must be checked in a browser; the directions link remains available if an embed fails to load.

## Validation

- Photos must be HTTPS URLs without embedded credentials, explicit nonstandard ports, IP-literal hosts, or common local-only hostnames. Nothing fetches the URL on the server, so this is not an image proxy or URL resolver. Redirect behavior and continued image-host availability remain the responsibility of the approved external host.
- Maps must use HTTPS google.com or www.google.com, exact /maps/embed path and a nonempty pb parameter. Normal sharing links, short links, arbitrary iframe hosts and other Google paths are rejected. Pasted HTML is reduced to its validated src; scripts and HTML body content are rejected.
- The browser independently validates map URLs before creating an Angular trusted resource URL. Raw pasted HTML is never inserted into the DOM.
- Existing location update requests that omit media preserve it. Sending empty strings/null clears it. Duplicate-location checks remain based on name/address.

## Local verification

Applied additive migration 20261102020000_location_photos_maps to local PostgreSQL. Angular production build and API TypeScript compilation passed. All 25 backend unit tests, 28 isolated PostgreSQL scenarios, and seven local profile/map frontend tests passed. The frontend test harness also passed strict TypeScript checking. Local /api/health returned ok.

Tests cover unsafe URL rejection, Google iframe extraction, duplicate prevention, media persistence/clearing, omitted-field preservation, public event and My Games propagation, frontend trusted-resource restrictions and directions encoding. No external photo/map was requested during these tests, and no browser/visual test is claimed. The Angular DOM suite still requires the previously missing Vitest/jsdom packages.

Prisma generation encountered the existing Windows engine DLL lock held by the dev API. The generated client types/runtime contain the new location fields and passed compilation and database tests with the same installed Prisma engine. No running process was killed to replace the loaded engine.

```powershell
npm run db:deploy --workspace @tri-city/api
npm run test:profile --workspace @tri-city/web
npm test --workspace @tri-city/api
npm run test:integration --workspace @tri-city/api
npm run build --workspace @tri-city/web
npx tsc -p apps/api/tsconfig.json
```
