# Deploy to Google Cloud with GitHub Actions

This guide deploys the current repository: Angular, Nest API and event-preview HTML in **one public Cloud Run service**, PostgreSQL 16 on Cloud SQL, images in Artifact Registry, database URLs in Secret Manager, and Firebase Authentication. GitHub Actions tests changes, builds images, runs a separate database migration job, and releases the application using keyless Workload Identity Federation (WIF).

The original [architecture draft](architecture.md) proposed separate web/API services and delivery workers. The combined [Cloud Run container](../Dockerfile.cloudrun) now provides same-origin `/api`, `/games` and static assets without a load balancer. Current notifications and payment reminders are generated on relevant app/inbox refreshes; no Cloud Tasks, Cloud Scheduler or continuously running worker is needed. This does not introduce background email, SMS, push notifications or exact-time delivery.

These are instructions and templates, not an executed deployment. Commands that create resources incur charges. No GitHub workflow is enabled merely by adding this document.

For optional email copies of notifications and background reminders while nobody is online, follow [Resend email notifications](resend-email-notifications.md). It uses this same image in a separate scheduled Cloud Run Job. Keep the worker disabled until Resend and the rollout timestamp are configured.

## 1. Prepare your accounts and choose the environment

Use **Google Cloud Shell with Bash** for all terminal commands below. They are not PowerShell commands. Clone your GitHub repository into Cloud Shell, open it, and keep commands in that directory. A fresh Cloud Shell session requires re-exporting the variables below. Use GitHub's web editor or your normal local editor for committing the Dockerfile and workflow templates.

1. Link billing to the intended GCP project. Prefer the existing Firebase project's underlying GCP project so existing authentication users and provider configuration continue to work. A new project/database does not automatically contain local app profiles or games.
2. Push the repository, lockfile and all `apps/api/prisma/migrations` to GitHub. Never push local `.env`, public runtime config files containing unintended data, ADC files or service-account keys. Review existing dependency audit findings before opening production to users; do not run an unreviewed major-version upgrade as part of deployment.
3. Choose one region for Cloud Run, Cloud SQL and Artifact Registry. `us-east1` below is an example; change it before provisioning if another region suits your users.
4. In Cloud Billing, create a budget and email alerts. A budget is an alert, not a spending cap. Cloud SQL is normally the principal always-on cost; Cloud Run can scale to zero. Review the [Google Cloud calculator](https://cloud.google.com/products/calculator) for your region, database tier, storage/backups and expected traffic. GitHub Actions minutes/storage depend on your GitHub plan and repository visibility. No Maps, SMS or paid image API is needed by this deployment.
5. The human doing initial setup needs permission to enable APIs, create SQL/Run/registry/secrets resources and manage IAM/WIF. Do not grant those setup permissions to the runtime service account.

```bash
export PROJECT_ID="YOUR_EXISTING_FIREBASE_GCP_PROJECT"
export FIREBASE_PROJECT_ID="$PROJECT_ID"
export REGION="us-east1"
export SERVICE="tri-city-drop-in"
export REPOSITORY="tri-city"
export SQL_INSTANCE="tri-city-postgres"
export DATABASE="tricity"
export GH_REPO="YOUR_GITHUB_OWNER/YOUR_REPOSITORY"

gcloud config set project "$PROJECT_ID"
gcloud services enable run.googleapis.com sqladmin.googleapis.com \
  artifactregistry.googleapis.com secretmanager.googleapis.com \
  iam.googleapis.com iamcredentials.googleapis.com sts.googleapis.com \
  identitytoolkit.googleapis.com

export PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
export RUNTIME_SA="tri-city-runtime@${PROJECT_ID}.iam.gserviceaccount.com"
export MIGRATOR_SA="tri-city-migrator@${PROJECT_ID}.iam.gserviceaccount.com"
export DEPLOY_SA="tri-city-github@${PROJECT_ID}.iam.gserviceaccount.com"
export IMAGE_BASE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}"
```

If Firebase belongs to a different project, set `FIREBASE_PROJECT_ID` to that existing project instead and perform the Firebase IAM grant in step 3 there. Do not create a second Firebase project just for hosting.

## 2. Create the image registry and service identities

```bash
gcloud artifacts repositories create "$REPOSITORY" \
  --repository-format=docker --location="$REGION"

gcloud iam service-accounts create tri-city-runtime --display-name="Soccer app runtime"
gcloud iam service-accounts create tri-city-migrator --display-name="Soccer schema migrations"
gcloud iam service-accounts create tri-city-github --display-name="GitHub releases"

for SA in "$RUNTIME_SA" "$MIGRATOR_SA"; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:$SA" --role="roles/cloudsql.client"
done
```

These are separate identities: the app reads/writes application data; the migration job changes schema; GitHub updates deployments. Neither runtime identity needs project Owner/Editor. The Cloud Run service agent is a fourth, Google-managed identity; keep its normal Cloud Run service-agent role. This guide keeps images and Run in the same project.

## 3. Configure Firebase for the deployed runtime

The API calls `verifyIdToken(token, true)`, which checks disabled/revoked users as well as signatures. Grant the runtime identity Firebase Auth read access in the **Firebase project**:

```bash
gcloud projects add-iam-policy-binding "$FIREBASE_PROJECT_ID" \
  --member="serviceAccount:$RUNTIME_SA" --role="roles/firebaseauth.viewer"
```

In Firebase Console, confirm Google and Email/Password providers, password policy, email enumeration protection, verification/reset templates and Google OAuth consent-screen publishing status. See [Firebase setup](firebase-setup.md). Cloud Run uses its assigned identity through Application Default Credentials: do not upload a private-key JSON or set `GOOGLE_APPLICATION_CREDENTIALS`/`FIREBASE_AUTH_EMULATOR_HOST` in production.

Keep the Firebase public web config handy (`apiKey`, `authDomain`, `projectId`, `appId` and optional public fields). It goes into runtime `PUBLIC_FIREBASE_CONFIG`, not a server credential. Authorized domains are added after the Cloud Run URL exists in step 8.

## 4. Create Cloud SQL and separate database accounts

This example chooses Enterprise edition, a small dedicated instance, SSD storage, automatic storage growth, daily backups, point-in-time recovery and deletion protection. It is **single-zone** to reduce starting cost; choose regional HA for stronger uptime requirements. Check current region/tier availability and estimated cost before running. Storage growth and backups also cost money.

```bash
gcloud sql instances create "$SQL_INSTANCE" \
  --database-version=POSTGRES_16 --edition=ENTERPRISE \
  --region="$REGION" --tier=db-custom-1-3840 \
  --availability-type=ZONAL --storage-type=SSD --storage-size=10 \
  --storage-auto-increase --backup-start-time=07:00 \
  --enable-point-in-time-recovery --deletion-protection

gcloud sql databases create "$DATABASE" --instance="$SQL_INSTANCE"
export SQL_CONNECTION="$(gcloud sql instances describe "$SQL_INSTANCE" --format='value(connectionName)')"
```

The simple path uses the instance's public IP **with Cloud Run's authenticated Cloud SQL socket integration**, not an open database firewall. Do not add `0.0.0.0/0` to authorized networks. A private-IP-only organization needs VPC/Direct VPC egress configuration instead; the socket attachment alone does not set that up. [Cloud SQL connection guidance](https://docs.cloud.google.com/sql/docs/postgres/connect-run).

Set the `postgres` administrative password using Cloud SQL Console -> Users (save it in your password manager). Connect from Cloud Shell:

```bash
gcloud sql connect "$SQL_INSTANCE" --user=postgres --database="$DATABASE"
```

That command may temporarily authorize the Cloud Shell client IP. Remove any temporary authorized network entry afterward. Inside `psql`, run the following; `\password` prompts privately rather than putting passwords in SQL/history. Generate two different strong passwords and save them in your password manager. These SQL-created roles do not inherit Cloud SQL's broad default user role.

```sql
CREATE ROLE tricity_migrator LOGIN;
\password tricity_migrator
CREATE ROLE tricity_app LOGIN;
\password tricity_app

REVOKE ALL ON DATABASE tricity FROM PUBLIC;
GRANT CONNECT ON DATABASE tricity TO tricity_migrator, tricity_app;
GRANT TEMPORARY ON DATABASE tricity TO tricity_migrator;
CREATE SCHEMA app AUTHORIZATION tricity_migrator;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA app TO tricity_app;
ALTER DEFAULT PRIVILEGES FOR ROLE tricity_migrator IN SCHEMA app
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO tricity_app;
ALTER DEFAULT PRIVILEGES FOR ROLE tricity_migrator IN SCHEMA app
  GRANT USAGE, SELECT ON SEQUENCES TO tricity_app;
\q
```

Use the same `app` schema in both connection URLs. The migration account owns schema objects; the app has data access, not schema ownership. This is a fresh-database procedure: if you need existing local data, plan a reviewed backup/restore and ownership/permission conversion first. Do not point tests at production or copy test fixtures into it.

## 5. Store the database URLs in Secret Manager

Prisma 6 supports PostgreSQL Unix sockets through the `host` query parameter. For this repository, URLs have this shape (passwords must be URL-encoded):

```text
postgresql://tricity_app:ENCODED_PASSWORD@localhost/tricity?host=/cloudsql/PROJECT:REGION:INSTANCE&schema=app&connection_limit=5&pool_timeout=20
postgresql://tricity_migrator:ENCODED_PASSWORD@localhost/tricity?host=/cloudsql/PROJECT:REGION:INSTANCE&schema=app&connection_limit=2&pool_timeout=20
```

The following Bash/Python commands prompt for the saved passwords, encode them and pipe directly to Secret Manager without printing URLs. They create version 1 of each secret; use `gcloud secrets versions add` with the same private input approach for later rotations.

```bash
for NAME in tri-city-db-app tri-city-db-migrator; do
  gcloud secrets create "$NAME" --replication-policy=automatic
done

python3 -c 'import getpass,os,urllib.parse as u; p=u.quote(getpass.getpass("Application DB password: "),safe=""); print("postgresql://tricity_app:"+p+"@localhost/"+os.environ["DATABASE"]+"?"+u.urlencode({"host":"/cloudsql/"+os.environ["SQL_CONNECTION"],"schema":"app","connection_limit":"5","pool_timeout":"20"}),end="")' \
  | gcloud secrets versions add tri-city-db-app --data-file=-

python3 -c 'import getpass,os,urllib.parse as u; p=u.quote(getpass.getpass("Migration DB password: "),safe=""); print("postgresql://tricity_migrator:"+p+"@localhost/"+os.environ["DATABASE"]+"?"+u.urlencode({"host":"/cloudsql/"+os.environ["SQL_CONNECTION"],"schema":"app","connection_limit":"2","pool_timeout":"20"}),end="")' \
  | gcloud secrets versions add tri-city-db-migrator --data-file=-

gcloud secrets add-iam-policy-binding tri-city-db-app \
  --member="serviceAccount:$RUNTIME_SA" --role=roles/secretmanager.secretAccessor
gcloud secrets add-iam-policy-binding tri-city-db-migrator \
  --member="serviceAccount:$MIGRATOR_SA" --role=roles/secretmanager.secretAccessor
```

Pin numeric secret versions in deployments, starting at `1`. Runtime does not get access to the migration secret; GitHub does not need either secret's contents. Secrets are injected only into their respective Run service/job.

## 6. Add a dedicated migration image

The production app image prunes development dependencies, including the Prisma CLI. Do **not** use `npx prisma` there and let it download an arbitrary version at startup. Add the following tracked file at the repository root as `Dockerfile.migrations`:

```dockerfile
FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci
COPY apps/api apps/api
RUN npm run build --workspace @tri-city/api
ENV NODE_ENV=production
USER node
CMD ["node", "node_modules/prisma/build/index.js", "migrate", "deploy", "--schema", "apps/api/prisma/schema.prisma"]
```

Use the repository's existing `.dockerignore`. This image deliberately retains the lockfile-pinned migration tools; it is only run as a restricted job. It also compiles the existing administrator-bootstrap script. Commit this file before configuring CI. Do not run `prisma migrate dev`, `db push` or reset against production.

## 7. Build images and apply the first migration

Run from the repository root, after adding the migration Dockerfile. These commands use Cloud Shell's Docker engine rather than creating a Cloud Build pipeline.

```bash
export RELEASE="$(git rev-parse HEAD)"
gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet
docker build --platform linux/amd64 -f Dockerfile.cloudrun -t "$IMAGE_BASE/app:$RELEASE" .
docker build --platform linux/amd64 -f Dockerfile.migrations -t "$IMAGE_BASE/migrations:$RELEASE" .
docker push "$IMAGE_BASE/app:$RELEASE"
docker push "$IMAGE_BASE/migrations:$RELEASE"

gcloud run jobs deploy tri-city-migrate \
  --image="$IMAGE_BASE/migrations:$RELEASE" --region="$REGION" \
  --service-account="$MIGRATOR_SA" --set-cloudsql-instances="$SQL_CONNECTION" \
  --set-secrets=DATABASE_URL=tri-city-db-migrator:1 \
  --tasks=1 --parallelism=1 --max-retries=0 --task-timeout=10m \
  --cpu=1 --memory=512Mi
gcloud run jobs execute tri-city-migrate --region="$REGION" --wait
```

Continue only after the execution succeeds. Read failure details in Cloud Run -> Jobs -> Executions -> Logs. Correct the underlying issue before rerunning; never mark a failed migration resolved without checking the actual schema. Migrations run once per release job, not on every web instance startup.

## 8. Deploy the app, then set its real public origin

Create a temporary runtime settings file outside the repository; it contains public configuration only. Replace the Firebase fields with the existing web app values. The initial valid HTTPS placeholder lets the first revision start; do not share links or announce the app until it is replaced.

```bash
cat > /tmp/tri-city-runtime.yaml <<EOF
PUBLIC_SITE_ORIGIN: "https://example.invalid"
FIREBASE_PROJECT_ID: "$FIREBASE_PROJECT_ID"
PUBLIC_FIREBASE_CONFIG: '{"apiKey":"YOUR_PUBLIC_FIREBASE_API_KEY","authDomain":"YOUR_PROJECT.firebaseapp.com","projectId":"$FIREBASE_PROJECT_ID","appId":"YOUR_WEB_APP_ID"}'
EOF

gcloud run deploy "$SERVICE" \
  --image="$IMAGE_BASE/app:$RELEASE" --region="$REGION" \
  --service-account="$RUNTIME_SA" --execution-environment=gen2 \
  --add-cloudsql-instances="$SQL_CONNECTION" \
  --set-secrets=DATABASE_URL=tri-city-db-app:1 \
  --env-vars-file=/tmp/tri-city-runtime.yaml \
  --port=8080 --cpu=1 --memory=512Mi --concurrency=20 \
  --min-instances=0 --max-instances=3 --timeout=60 \
  --ingress=all --allow-unauthenticated

export PUBLIC_ORIGIN="$(gcloud run services describe "$SERVICE" --region="$REGION" --format='value(status.url)')"
gcloud run services update "$SERVICE" --region="$REGION" \
  --update-env-vars="PUBLIC_SITE_ORIGIN=$PUBLIC_ORIGIN"
printf 'Open: %s\n' "$PUBLIC_ORIGIN"
```

The human setup identity must be able to change the service's IAM policy for `--allow-unauthenticated`. If organizational policy blocks public access, resolve that with the project administrator; do not put the whole service behind an identity gate and expect message crawlers to work. Public Cloud Run invocation permits HTML, photos and public event queries. Existing Firebase/role guards still protect private API routes. [Public access options](https://docs.cloud.google.com/run/docs/authenticating/public).

With 3 instances and `connection_limit=5`, plan for at least 15 application connections plus migrations, maintenance and overlapping revisions. This is a starting budget, not an absolute SQL connection cap. Monitor pool waits/SQL connections before raising instance/concurrency limits. Zero minimum instances saves idle compute but creates cold starts; set a minimum of 1 later if latency justifies the cost.

In Firebase Authentication -> Settings -> Authorized domains, add the hostname from `PUBLIC_ORIGIN` (no `https://` or path). Keep `authDomain` as the Firebase-provided auth domain unless separately configuring a custom auth domain. Confirm Google consent-screen test-user restrictions will not exclude your intended players. Verify email/password sign-in, verification links and password resets using a real account.

For a custom domain later, follow Cloud Run's supported domain-routing options for your region. Provision DNS/TLS, update `PUBLIC_SITE_ORIGIN` and the GitHub variable below, add the domain to Firebase, and retest sign-in/share URLs. A load balancer may add cost and is optional for the initial `run.app` URL.

## 9. Bootstrap the first administrator

First sign in through the deployed website and complete the profile so the PostgreSQL user exists. Copy **your own Firebase UID** from Firebase Authentication. Firebase user creation alone is insufficient.

Run the compiled role-grant script in a one-off job using the migration identity/secret. This changes a role in the production database; verify the project and UID before executing. The UID is an identifier, not a password.

```bash
gcloud run jobs deploy tri-city-bootstrap-admin \
  --image="$IMAGE_BASE/migrations:$RELEASE" --region="$REGION" \
  --service-account="$MIGRATOR_SA" --set-cloudsql-instances="$SQL_CONNECTION" \
  --set-secrets=DATABASE_URL=tri-city-db-migrator:1 \
  --command=node \
  --args=apps/api/dist/grant-organizer.js,--administrator,YOUR_FIREBASE_UID \
  --tasks=1 --parallelism=1 --max-retries=0 --task-timeout=5m
gcloud run jobs execute tri-city-bootstrap-admin --region="$REGION" --wait
gcloud run jobs delete tri-city-bootstrap-admin --region="$REGION"
```

Refresh the website and verify Administrator -> Users. Use that page for subsequent role changes. GitHub CI should not bootstrap administrators.

## 10. Connect GitHub to GCP without a service-account key

Create one WIF pool/provider restricted to **your exact repository, `main` branch, and production environment**. These instructions assume the default branch is `main`; change every branch reference consistently if yours differs.

```bash
gcloud iam workload-identity-pools create github --location=global \
  --display-name="GitHub Actions"
gcloud iam workload-identity-pools providers create-oidc github-main \
  --location=global --workload-identity-pool=github \
  --issuer-uri=https://token.actions.githubusercontent.com \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
  --attribute-condition="assertion.repository == '$GH_REPO' && assertion.ref == 'refs/heads/main' && assertion.sub == 'repo:$GH_REPO:environment:production'"

gcloud iam service-accounts add-iam-policy-binding "$DEPLOY_SA" \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github/attribute.repository/$GH_REPO"

gcloud artifacts repositories add-iam-policy-binding "$REPOSITORY" --location="$REGION" \
  --member="serviceAccount:$DEPLOY_SA" --role=roles/artifactregistry.writer
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$DEPLOY_SA" --role=roles/run.developer
for SA in "$RUNTIME_SA" "$MIGRATOR_SA"; do
  gcloud iam service-accounts add-iam-policy-binding "$SA" \
    --member="serviceAccount:$DEPLOY_SA" --role=roles/iam.serviceAccountUser
done
```

The deployer's Run Developer grant is project-scoped here because it manages both the service and job. Use a dedicated app project; a larger shared project should use a custom/scoped deployment policy. GitHub can run workloads as those two service accounts, so protection of release code and reviewers is essential even though GitHub cannot directly read the secrets. IAM changes may take a few minutes to propagate. [Google's GitHub authentication action](https://github.com/google-github-actions/auth) documents WIF and service-account impersonation.

In GitHub -> repository Settings:

1. Create an Environment named **production**. Limit deployment branches to `main`. Add required reviewers if supported by your GitHub plan, or omit reviewers if you want automatic releases after CI. Reviewers add an approval gate; they are not technically required by this app.
2. Protect `main` with pull requests and required CI checks. Do not give untrusted PR code production credentials. Consider CODEOWNERS review for workflow/Dockerfile/migration changes.
3. Add the following **repository Actions variables**. They are configuration identifiers/public client settings, not secret database URLs. Environment-level variables can override them if you intentionally introduce staging later.

| Variable | Value |
| --- | --- |
| `GCP_PROJECT_ID` | `PROJECT_ID` |
| `GCP_REGION` | `REGION` |
| `AR_REPOSITORY` | `REPOSITORY`, e.g. `tri-city` |
| `CLOUD_RUN_SERVICE` | `SERVICE`, e.g. `tri-city-drop-in` |
| `CLOUD_SQL_CONNECTION` | Full `project:region:instance` |
| `GCP_DEPLOY_SA` | `DEPLOY_SA` email |
| `GCP_RUNTIME_SA` | `RUNTIME_SA` email |
| `GCP_MIGRATOR_SA` | `MIGRATOR_SA` email |
| `GCP_WIF_PROVIDER` | `projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github/providers/github-main` |
| `PUBLIC_SITE_ORIGIN` | Exact HTTPS origin obtained in step 8 |
| `FIREBASE_PROJECT_ID` | Existing Firebase project ID |
| `PUBLIC_FIREBASE_CONFIG` | One-line JSON containing the public web config, without an outer `firebase` wrapper |
| `APP_DB_SECRET_VERSION` | `1` initially |
| `MIGRATION_DB_SECRET_VERSION` | `1` initially |

No GCP private key or database password is stored in GitHub. If your repository customizes OIDC subject claims, adjust the provider condition to match the actual production-environment subject.

## 11. Add the GitHub Actions workflow

Create `.github/workflows/deploy.yml` with the following template. It tests pull requests without cloud credentials. Pushes to `main` and manual runs on `main` also build/push both images, wait for successful migrations, then deploy and smoke-check. The production environment gate, if configured, applies before the release job. Concurrency queues releases instead of cancelling a running migration.

The action major tags below are readable starting points; pin them to reviewed full commit SHAs and use Dependabot for updates before adopting a stricter production supply-chain policy. Do not use `pull_request_target` to run untrusted code with credentials.

```yaml
name: Test and deploy
on:
  pull_request:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
          POSTGRES_DB: tricity_test
        ports: ['5432:5432']
        options: >-
          --health-cmd "pg_isready -U test -d tricity_test"
          --health-interval 5s --health-timeout 5s --health-retries 12
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: npm
      - run: npm ci
      - run: npm run build
      - run: npm test --workspace @tri-city/api
      - name: Database integration tests (disposable CI database only)
        run: |
          printf '%s\n' 'DATABASE_URL=postgresql://test:test@localhost:5432/tricity_test' > apps/api/.env
          npm run test:integration --workspace @tri-city/api
      - run: npm run test:auth --workspace @tri-city/web
      - run: npm run test:profile --workspace @tri-city/web
      - run: npm run test:theme --workspace @tri-city/web

  deploy:
    if: github.ref == 'refs/heads/main' && github.event_name != 'pull_request'
    needs: test
    runs-on: ubuntu-latest
    environment: production
    concurrency:
      group: tri-city-production
      cancel-in-progress: false
    permissions:
      contents: read
      id-token: write
    env:
      PROJECT_ID: ${{ vars.GCP_PROJECT_ID }}
      REGION: ${{ vars.GCP_REGION }}
      SERVICE: ${{ vars.CLOUD_RUN_SERVICE }}
      SQL_CONNECTION: ${{ vars.CLOUD_SQL_CONNECTION }}
      IMAGE_BASE: ${{ vars.GCP_REGION }}-docker.pkg.dev/${{ vars.GCP_PROJECT_ID }}/${{ vars.AR_REPOSITORY }}
      RUNTIME_SA: ${{ vars.GCP_RUNTIME_SA }}
      MIGRATOR_SA: ${{ vars.GCP_MIGRATOR_SA }}
      PUBLIC_ORIGIN: ${{ vars.PUBLIC_SITE_ORIGIN }}
      FIREBASE_PROJECT_ID: ${{ vars.FIREBASE_PROJECT_ID }}
      PUBLIC_FIREBASE_CONFIG: ${{ vars.PUBLIC_FIREBASE_CONFIG }}
      APP_DB_VERSION: ${{ vars.APP_DB_SECRET_VERSION }}
      MIGRATION_DB_VERSION: ${{ vars.MIGRATION_DB_SECRET_VERSION }}
    steps:
      - uses: actions/checkout@v4
      - name: Build commit-tagged images before requesting cloud credentials
        run: |
          docker build --platform linux/amd64 -f Dockerfile.cloudrun -t "$IMAGE_BASE/app:$GITHUB_SHA" .
          docker build --platform linux/amd64 -f Dockerfile.migrations -t "$IMAGE_BASE/migrations:$GITHUB_SHA" .
      - uses: google-github-actions/auth@v3
        with:
          workload_identity_provider: ${{ vars.GCP_WIF_PROVIDER }}
          service_account: ${{ vars.GCP_DEPLOY_SA }}
      - uses: google-github-actions/setup-gcloud@v3
      - name: Configure registry and public runtime settings
        run: |
          gcloud config set project "$PROJECT_ID"
          gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet
          python3 - <<'PY'
          import json, os
          config = {
            'PUBLIC_SITE_ORIGIN': os.environ['PUBLIC_ORIGIN'],
            'FIREBASE_PROJECT_ID': os.environ['FIREBASE_PROJECT_ID'],
            'PUBLIC_FIREBASE_CONFIG': json.dumps(json.loads(os.environ['PUBLIC_FIREBASE_CONFIG']))
          }
          # JSON is valid YAML; avoid shell escaping the Firebase JSON.
          with open('/tmp/runtime.yaml', 'w') as f:
            json.dump(config, f)
          PY
      - name: Push commit-tagged images
        run: |
          docker push "$IMAGE_BASE/app:$GITHUB_SHA"
          docker push "$IMAGE_BASE/migrations:$GITHUB_SHA"
      - name: Migrate before serving the new revision
        run: |
          gcloud run jobs deploy tri-city-migrate --region="$REGION" \
            --image="$IMAGE_BASE/migrations:$GITHUB_SHA" \
            --service-account="$MIGRATOR_SA" --set-cloudsql-instances="$SQL_CONNECTION" \
            --set-secrets="DATABASE_URL=tri-city-db-migrator:$MIGRATION_DB_VERSION" \
            --tasks=1 --parallelism=1 --max-retries=0 --task-timeout=10m \
            --cpu=1 --memory=512Mi --quiet
          gcloud run jobs execute tri-city-migrate --region="$REGION" --wait
      - name: Deploy app (existing public IAM policy is retained)
        run: |
          gcloud run deploy "$SERVICE" --region="$REGION" \
            --image="$IMAGE_BASE/app:$GITHUB_SHA" \
            --service-account="$RUNTIME_SA" --execution-environment=gen2 \
            --add-cloudsql-instances="$SQL_CONNECTION" \
            --set-secrets="DATABASE_URL=tri-city-db-app:$APP_DB_VERSION" \
            --env-vars-file=/tmp/runtime.yaml \
            --port=8080 --cpu=1 --memory=512Mi --concurrency=20 \
            --min-instances=0 --max-instances=3 --timeout=60 \
            --ingress=all --quiet
      - name: Public smoke checks
        run: |
          curl --fail --retry 4 --retry-all-errors "$PUBLIC_ORIGIN/api/health"
          curl --fail --retry 4 --retry-all-errors "$PUBLIC_ORIGIN/api/events" > /dev/null
          curl --fail "$PUBLIC_ORIGIN/" | grep -q '<app-root'
          curl --fail "$PUBLIC_ORIGIN/share/soccer-ball.png" -o /tmp/soccer-ball.png
          test "$(curl -s -o /dev/null -w '%{http_code}' "$PUBLIC_ORIGIN/api/me")" = 401
```

This is an in-document template, not a workflow already installed or tested on GitHub. Commit it and the migration Dockerfile in a PR, confirm the test job passes, then merge. Select the actual `test` check in branch protection after GitHub has seen the workflow. First-time setup commands in earlier steps are deliberately not repeated by every CI deployment. Never run CI integration tests with a production `DATABASE_URL`.

The current release updates live traffic after migrations and then checks it. Failed post-deployment checks leave that revision serving until you roll it back. For higher-risk releases, extend the pipeline with a no-traffic tagged revision, pre-traffic checks and an explicit promotion stage. Build tags use commit SHAs; Cloud Run resolves deployed image tags to digests, so overwriting a tag does not alter an existing revision. Preserve known-good image digests for rollback.

## 12. Verify the deployed product before inviting players

- `/api/health`, `/api/events`, `/`, `/config.json`, `/styles.css` and `/share/soccer-ball.png` load over HTTPS. `/config.json` contains only the public Firebase fields. A signed-out `/api/me` returns 401. Health alone does not prove Firebase or all database permissions work.
- Google and verified email/password accounts sign in; verification/reset emails work; a normal player cannot access administrator or organizer endpoints. Your bootstrap administrator sees Users and can change roles.
- Create a location and draft game, publish it, then use a second player to accept the waiver, acknowledge a paid cost, join/cancel, add a guest, and exercise a full-game waitlist. Confirm privacy using a signed-out window.
- Organizers see rosters, ratings and contact details only where authorized. Confirm payment review, strike visibility and joining restriction behavior with controlled test accounts/events; avoid assigning real users test strikes.
- Share a published `/games/UUID` URL through iMessage, WhatsApp and Google Messages. Check photo/fallback, venue-local time, USD spacing, spots/waitlist text and the browser joining path. Preview layouts/cache belong to the messaging app; no interactive in-message button is guaranteed. Cancelled/past events must not offer joining. Verify draft URLs reveal no draft details.
- Confirm in-app notifications/reminders appear after the relevant refresh; this deployment does not schedule notifications while everyone is offline.

## 13. Operations, rollback and recovery

**Observe:** use Cloud Run service/job logs and revision metrics, Cloud SQL connection/CPU/storage metrics, Secret Manager access logs where enabled, and budget alerts. Add alerts for recurring 5xx, failed migration jobs, SQL storage/connection pressure and backup failure. Set an Artifact Registry cleanup policy with a retention window that preserves known-good releases; do not remove images still needed for recovery.

**Rollback application traffic:** list revisions and route traffic to the last known-good one. Run from Cloud Shell with the setup variables restored:

```bash
gcloud run revisions list --service="$SERVICE" --region="$REGION"
gcloud run services update-traffic "$SERVICE" --region="$REGION" \
  --to-revisions=YOUR_KNOWN_GOOD_REVISION=100
```

This restores app code/config, **not the database schema**. Use backward-compatible expand/contract migrations: deploy additive schema first, deploy code, remove old schema only in a later release after old revisions are retired. Do not attempt automated down-migrations. Serialize manual migrations with CI too; the GitHub concurrency group cannot block a human running a job separately. If a destructive migration fails, stop further releases and follow a reviewed database recovery plan.

**Backups:** verify actual automated backup/PITR status and retention in Cloud SQL, and rehearse restoration to a separate instance before relying on it. For a recovery, validate the restored database, recreate/check DB accounts and permissions, update both connection secrets and Cloud SQL attachments, then redeploy/check the service and jobs. A revision rollback alone cannot recover deleted data.

**Rotate secrets:** update the SQL role's password and add a matching secret version, then update the appropriate numeric GitHub variable and redeploy/re-execute as needed. Coordinate this because old instances can lose new connections when the old password stops working. Retain older secret versions only according to your recovery/security policy; never assume an old password will work after rotation.

**Common failures:**

| Symptom | Check |
| --- | --- |
| Container cannot start / Prisma cannot connect | Schema migrations succeeded; correct socket `host` and database/schema; Run Cloud SQL attachment; SQL Client IAM; correct secret version/password; adequate connection budget |
| Firebase API returns 503 | Matching project IDs; runtime identity has Firebase Auth read permissions in that project; Identity Toolkit API enabled; no emulator/private-key override |
| Google sign-in blocked | Firebase authorized hostname; OAuth consent-screen/test-user configuration; correct public config |
| GitHub WIF denied | Numeric project number, exact owner/repository and branch, `production` environment subject, service-account WIF binding and IAM propagation |
| CI cannot deploy or execute migration | Registry Writer, Run Developer and Service Account User bindings; job/runtime secret access belongs to their identities |
| Previews missing/stale | Public HTTPS/no identity gate; correct `PUBLIC_SITE_ORIGIN`; crawlable `/games` and image URL; messaging cache and external photo-host availability |
| App succeeds locally but empty in production | Cloud SQL is a separate database; production data is not seeded/copied automatically |

## References

- [Current container and event-preview behavior](event-sharing-cloudrun-review.md)
- [Cloud Run container contract](https://docs.cloud.google.com/run/docs/container-contract)
- [Cloud SQL connections from Cloud Run](https://docs.cloud.google.com/sql/docs/postgres/connect-run)
- [Cloud Run jobs deployment flags](https://docs.cloud.google.com/sdk/gcloud/reference/run/jobs/deploy)
- [GitHub authentication action / WIF setup](https://github.com/google-github-actions/auth)
- [Google Cloud SDK action](https://github.com/google-github-actions/setup-gcloud)
- [Firebase Admin setup](https://firebase.google.com/docs/admin/setup)

Cloud command syntax and action documentation were checked while preparing this guide. Provisioning, the migration-image template and the GitHub workflow still need validation in your account; the existing combined app image has passed local container checks.
