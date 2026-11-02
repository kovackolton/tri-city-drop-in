# Git workflow and local secrets

`main` contains the initial application commit. Use `development` for ongoing work. No remote is configured or pushed by initialization.

The repository tracks application source, specs, database migrations, package-lock.json, Docker configuration, documentation and blank/safe examples. It ignores dependencies, builds, coverage, caches, editor state, environment files, credential/key files and local database backups. Prisma SQL migrations remain tracked.

`apps/web/public/config.json` is deliberately local and ignored, including its Firebase web API key. New checkouts copy `config.example.json` to `config.json`, then configure Firebase. The Firebase web settings are public client identifiers rather than server credentials, but keeping the configured file local avoids committing environment-specific values. Never put service-account credentials in the web directory.

```powershell
Copy-Item apps/api/.env.example apps/api/.env
Copy-Item apps/web/public/config.example.json apps/web/public/config.json
git config core.hooksPath .githooks
```

The hooks path is configured for this checkout. New clones must configure it as above. The pre-commit hook scans staged filenames and staged contents, blocking local environment files and common credential/token patterns, even if force-added. It prints paths and finding categories, never secret contents.

This is a local safeguard: Git allows hooks/ignore rules to be bypassed, and pattern matching cannot identify every secret. Before sharing the repository, add remote-side secret scanning and branch protections. If a real credential ever enters history, revoke it; removing it from a later commit does not remove earlier copies.

The Compose password and API example URL use a known local-development-only password. They are test defaults, not production credentials. Production configuration must come from managed secrets.
