# Frontend structure

Angular components live in `apps/web/src/app`. The root component has its files directly in `app/`; each other component has a named subdirectory:

```text
src/
  main.ts
  auth.service.ts
  events.store.ts
  registrations.store.ts
  models.ts
  styles.css
  app/
    app.component.ts
    app.component.html
    app.component.scss
    app.component.spec.ts
    locations/
      locations.component.ts
      locations.component.html
      locations.component.scss
      locations.component.spec.ts
    my-games/
    organizer/
    organizer-seat/
    payment-review/
    players/
    roster/
    signup/
```

All nine components follow the four-file structure. Components use `templateUrl` and `styleUrl`; there are no inline component templates. `main.ts` only loads runtime configuration and bootstraps Angular. Event state has moved to `events.store.ts`. Existing shared Tailwind styles remain in `styles.css`; component SCSS files provide the place for future scoped styles without duplicating global utilities.

Specs render each component's external template using Angular TestBed with mocked HTTP responses and an unconfigured Firebase client, so they do not contact the API or Firebase. Production TypeScript excludes specs; `tsconfig.spec.json` includes them for the Angular Vitest runner.

```powershell
npm install
npm run build --workspace @tri-city/web
npm run test --workspace @tri-city/web
```

The production build passed after the refactor. Spec execution is pending: this session could not download Vitest/jsdom due to network restrictions, and the elevated command runner failed to initialize. The dependencies are declared, but `npm install` must update the lockfile and install them before tests can run. No backend, database or application behavior change is intended.
