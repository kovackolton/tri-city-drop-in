# Email notifications with Resend Free and Cloud Run Jobs

This guide adds email delivery for the same notifications shown in the app. Sender: **no_reply@contact.tricitiesdropin.com**. No SMS is included. Follow the steps in order; do not enable production sending until the test checklist passes. This document describes the implementation added alongside it; nothing is provisioned or deployed automatically.

## 1. What gets deployed

The existing app continues to create in-app notifications. A separate scheduled Cloud Run **Job**, using the same app image, refreshes due reminders for users even when nobody is online, queues eligible notifications, then sends email through Resend. Run it every five minutes. This is approximate delivery, not a guarantee of an exact send time.

Each notification has its own email-delivery record. Email state never changes whether its in-app notification is read. Email bodies include that notification's title/message, relevant event times/location/price, applicable cutoff/sub/payment guidance, and authenticated Notifications and How to links. Subjects start with the event name when one exists. The worker rechecks time-sensitive reminders before sending.

Existing notification history is not emailed in bulk: EMAIL_NOTIFICATIONS_START_AT is an explicit rollout timestamp. Players can disable notification emails in My profile; emails use the sign-in email, not the separately shared organizer contact address. Guest-seat messages go to the booking account.

## 2. Set up Resend Free and verify your domain

1. Create a Resend account and select the **Free transactional email plan**. It currently includes **3,000 emails/month and 100 emails/day**. Stay on Free; no paid plan is required by this integration. Limits are shared across your Resend account, not per player. A reminder to 150 players cannot all be emailed the same day on this plan. In-app notifications remain immediate; excess emails wait and expired reminders are skipped.
2. In **Domains**, add `contact.tricitiesdropin.com`. Publish the exact SPF/return-path and DKIM DNS records supplied by Resend, then wait for verified status. Preserve existing mailbox DNS and do not create duplicate SPF records on the same hostname. Configure DMARC with your domain administrator. Domain verification allows `no_reply@contact.tricitiesdropin.com` to send; it does not create a mailbox.
3. Keep these messages transactional (account/game updates, no promotional campaigns). Use the profile email preference to stop optional notification emails. Firebase continues handling its own verification/password-reset messages.
4. Optionally create a monitored Reply-To mailbox/alias and set EMAIL_REPLY_TO. Without one, recipients are told to contact organizers through the app. Monitor the Resend dashboard for delivery failures, bounces, complaints and suppressed addresses; investigate issues before retrying. This version has no public webhook and records provider acceptance, not inbox delivery.
5. For initial testing after verification, use a test account you control and a recent test-only rollout timestamp. Before domain verification the default testing sender has restricted recipients and is not a substitute for verifying this app's requested sender.

References: [idempotency keys (24-hour retention)](https://resend.com/docs/dashboard/emails/idempotency-keys), [pricing](https://resend.com/pricing), [domain verification](https://resend.com/docs/dashboard/domains/introduction), [usage limits](https://resend.com/docs/api-reference/rate-limit), [API errors and quota resets](https://resend.com/docs/api-reference/errors).

## 3. Create a restricted Resend API key

In Resend **API Keys**, create a **Sending access** key restricted to the verified sending domain. Copy it once into GCP Secret Manager as `resend-api-key`. Only the email worker needs access. Never put it in GitHub source, frontend assets, Firebase config or Docker build arguments. Rotate keys by creating a replacement, updating the secret and worker, verifying delivery, then revoking the old key.

No additional cloud account or mailbox subscription is needed. Resend is the external email provider; the app, database, background job and scheduler remain in GCP.

## 4. Deploy the code first, then configure the email worker

**The email settings go on the separate Cloud Run Job, not in GitHub.** The one new GitHub variable is `EMAIL_WORKER_ENABLED`, which controls whether future pipeline releases update that job's image. This variable does **not** turn email sending on or off. Sending is controlled by the job's `EMAIL_ENABLED` and `EMAIL_DELIVERY_MODE` settings and by whether the job is executed.

### 4.1 Where each value belongs

| Setting | Where you enter it | Initial value / purpose |
| --- | --- | --- |
| `EMAIL_WORKER_ENABLED` | GitHub repository **Settings > Secrets and variables > Actions > Variables** | Leave absent or set `false` for the first code deployment. Set `true` only after creating/testing the Cloud Run Job. This is a variable, not a GitHub secret. |
| `RESEND_API_KEY` | GCP **Secret Manager**, secret named `resend-api-key`; mapped onto the email job as `RESEND_API_KEY` | Your restricted Resend Sending key. Do not add it to GitHub or the public app service. |
| `DATABASE_URL` | Existing GCP **Secret Manager** runtime database secret, normally `db_url-app`; mapped onto the email job as `DATABASE_URL` | Reuse the production runtime database connection. Do not paste the URL into GitHub or a YAML configuration file. |
| `EMAIL_ENABLED` | Cloud Run **email job** environment | `true` when ready to execute previews; `false` disables the worker entirely. A job does not run simply because this is true. |
| `EMAIL_DELIVERY_MODE` | Cloud Run **email job** environment | Start with `preview`; change to `resend` only at launch. |
| `EMAIL_FROM` | Cloud Run **email job** environment | `no_reply@contact.tricitiesdropin.com` |
| `EMAIL_NOTIFICATIONS_START_AT` | Cloud Run **email job** environment | Explicit UTC activation timestamp ending in `Z`; explained below. |
| `PUBLIC_SITE_ORIGIN` | Cloud Run **email job** environment | Copy the same HTTPS origin already used by the app, e.g. `https://YOUR_SERVICE.us-east1.run.app` or your custom domain. No trailing path, query or hash. |
| `EMAIL_BATCH_SIZE` | Cloud Run **email job** environment | `50` |
| `EMAIL_DAILY_LIMIT` / `EMAIL_MONTHLY_LIMIT` | Cloud Run **email job** environment | `100` / `3000`; lower these if reserving capacity for other account usage. |
| `EMAIL_SEND_INTERVAL_MS` | Optional Cloud Run **email job** environment | Omit to use `1100` milliseconds between attempted sends. |
| `EMAIL_REPLY_TO` | Optional Cloud Run **email job** environment | Omit unless you have a monitored reply mailbox. |
| `EMAIL_PREVIEW_DIR` | Local `apps/api/.env` for local previews | Optional output folder; normally omit on Cloud Run, where files are temporary. |

Your existing GitHub `PUBLIC_SITE_ORIGIN` variable still configures the **public app service** through the workflow. Copy that same value into the email job configuration yourself: GitHub variables are not automatically inherited by a different Cloud Run Job. Likewise, `apps/api/.env` and `.env.example` are not loaded by the production worker. `.env.example` is a template; editing it does not configure GCP.

Sections 6-7 use Cloud Shell variables such as `PROJECT_ID`, `REGION`, `IMAGE`, `SQL_CONNECTION`, `WORKER_SA` and `SCHEDULER_SA`. These are temporary shell helpers for running setup commands, not additional application environment variables or new GitHub settings. Re-enter them if you start a new Cloud Shell session.

### 4.2 First deployment: exact order

1. **Keep the email pipeline step inactive.** In GitHub, open your repository > **Settings > Secrets and variables > Actions > Variables**. Leave `EMAIL_WORKER_ENABLED` absent, or set it to the text `false`. The workflow uses the `production` environment too; if you previously added this variable under **Settings > Environments > production**, check that it is not overriding your repository value with `true`.
2. **If you already created a scheduler/job, pause it before proceeding.** In GCP **Cloud Scheduler**, pause `tricity-email-notifications`. In **Cloud Run > Jobs > tricity-email-notifications > Edit > Variables & Secrets**, set `EMAIL_ENABLED=false` and save. Wait for any already-running execution to finish; changing configuration does not stop an existing execution. Skip this step if these resources do not exist yet. Changing the GitHub variable alone does not pause a schedule or disable a worker.
3. **Commit and push the email feature through your normal branch/PR flow.** Include the worker, templates, profile preference/UI, tests, workflow change, documentation, package files, Prisma schema, and `apps/api/prisma/migrations/20261111050000_notification_email_delivery/`. Keep local `.env`, API keys and credential files out of the commit. Run local checks in section 5 before merging.
4. **Merge to `main` and let your existing GitHub pipeline finish.** It runs tests/builds, pushes the commit-tagged images, deploys and executes `tri-city-migrate`, then deploys the public app. The migration adds the profile preference and email-delivery table. The optional **Update configured notification email worker** step should show **Skipped** at this stage. Do not manually apply the migration to production as an additional step. If the migration/deployment fails, resolve that failure before creating or executing the worker.
5. **Record the successful release's full commit SHA and image.** In GitHub **Actions**, open the successful deployment run and inspect **Build commit-tagged images** / **Push commit-tagged images**. The app image is `<REGION>-docker.pkg.dev/<PROJECT_ID>/<AR_REPOSITORY>/app:<FULL_COMMIT_SHA>`. Copy that exact app image for `IMAGE` in section 6; do not use the migrations image or assume a `latest` tag. You can also find it in **GCP Artifact Registry > your repository > app**. The public app now supports email preferences, but no worker is sending email yet.
6. **Create the provider secret in GCP.** Finish sections 2-3. In **Secret Manager > Create secret**, name it `resend-api-key` and paste the restricted Resend key into the secret value. Confirm the existing `db_url-app` secret is present; do not create a second production database or replace its password. Section 6 grants the worker identity access to these two secrets. You do not need to add the Resend key as a GitHub secret.
7. **Create the Cloud Run Job in preview mode using section 6.** Use the successful image from step 5. Follow the console steps in section 6.1 to enter the settings directly, or use the Cloud Shell/YAML alternative in section 6.2. Start with `EMAIL_ENABLED=true` and `EMAIL_DELIVERY_MODE=preview`. Only the Cloud Shell alternative needs `email-worker.env.yaml`; it configures the job through `--env-vars-file` and does not need to be committed. Use the actual job name `tricity-email-notifications` in the same region as the pipeline. No schedule should be active yet.
8. **Run one preview and inspect it.** In the console, open the job and click **Execute**, or use the command in section 6.2. In **Cloud Run > Jobs > tricity-email-notifications > Executions**, open the execution and inspect its logs. Expect `mode: "preview"`, `sent: 0`, and a `previewed` count if eligible notifications exist. Preview mode still refreshes in-app reminders and creates queue rows in the configured database; it does not contact Resend. Preview files on Cloud Run are temporary; use section 5 locally to inspect HTML/text. A zero count can simply mean there are no eligible notifications since your rollout timestamp.
9. **Choose your launch timestamp and enable sending deliberately.** After previews and domain verification are ready, choose the actual activation time in UTC (Cloud Shell: `date -u +%Y-%m-%dT%H:%M:%S.000Z`). Update `EMAIL_NOTIFICATIONS_START_AT` to that timestamp and change `EMAIL_DELIVERY_MODE` from `preview` to `resend`; leave `EMAIL_ENABLED=true`. In the console, edit the job settings and click **Update** (section 6.1 C), or change `email-worker.env.yaml` and rerun the section 6.2 deploy command. Then execute once and inspect the job logs and Resend dashboard. This is a real production send run: it can email **every eligible opted-in account**, not just your own test account. If you want an isolated real-send test first, use a separate test database/job containing only test accounts you control. A recent timestamp is not a recipient allowlist.
10. **Enable the background schedule using section 7.** Create the five-minute Cloud Scheduler job only after the manual run succeeds. If you paused an existing schedule, resume it instead of creating a duplicate. Verify one scheduled execution works without anyone opening the app.
11. **Enable future pipeline image updates.** In GitHub repository **Settings > Secrets and variables > Actions > Variables**, add/update `EMAIL_WORKER_ENABLED` to the text `true`. The next normal release (or a manual run of the workflow from `main`) will update the already-created email job's image after migrations and app deployment. It preserves the job's environment variables, secrets and schedule. The deploy identity needs permission to update this job and act as its worker service account, as noted in section 8. Changing this GitHub variable by itself neither deploys nor executes anything.

**Timestamp rule:** notifications created before `EMAIL_NOTIFICATIONS_START_AT` are excluded. Moving the timestamp forward from a preview/test value to the actual launch time intentionally excludes those earlier notifications; old queued rows are skipped on eligibility recheck. After launch, keep it stable. Do not generate a new timestamp on every pipeline release, because that would skip queued messages. Do not move it backward to test, because that can enqueue historical notifications.

### 4.3 Later changes: which action to take

| What you changed | What to do |
| --- | --- |
| App/worker source code or database schema | Commit/merge through the existing pipeline. With `EMAIL_WORKER_ENABLED=true`, it migrates first, deploys the app, then updates the email job image. |
| Sender, mode, rollout time, origin or limits | Edit the **email job's** environment in GCP, or edit your Cloud Shell `email-worker.env.yaml` and rerun the section 6 deploy command. An image-only CI update preserves those settings. Keep your YAML copy consistent with console edits so a later manual deploy does not restore old values. |
| Resend API key | Add a new version to the `resend-api-key` secret and verify the job's secret reference. The section 6 example uses `latest`, so a new execution resolves the current version; pin a version instead if you need controlled rotation. Never put the key in GitHub. |
| How often emails are checked | Edit the **Cloud Scheduler** schedule. No app rebuild is needed. |
| Pause email | Pause Cloud Scheduler and set `EMAIL_ENABLED=false` on the email job. Leave in-app notifications running. `EMAIL_WORKER_ENABLED=false` only stops CI image updates. |

The public app service needs neither `RESEND_API_KEY` nor the `EMAIL_*` worker settings. It keeps its existing database/Firebase/site-origin configuration. Production email links use the job's real HTTPS `PUBLIC_SITE_ORIGIN`; private-game invite tokens are not embedded in emails.

## 5. Test locally before sending

In `apps/api/.env`, use your LOCAL database and EMAIL_DELIVERY_MODE=preview. Supply the rollout timestamp, EMAIL_ENABLED=true, EMAIL_FROM, PUBLIC_SITE_ORIGIN=http://localhost:4200 and EMAIL_PREVIEW_DIR pointing to a local folder. Do not put real API keys into a preview setup.

```powershell
npm run notifications:email --workspace @tri-city/api
```

Preview mode writes HTML and plain text for inspection and does not call Resend or mark email deliveries sent. Test fictional notifications with event titles containing punctuation/HTML, early/late cancellation guidance, a free event, a waitlist promotion, payment reminders, strikes, event cancellation and staff reminders. Test the Notifications button while signed out, sign in, and confirm it opens Notifications. Review How to links too.

Then use Resend delivery mode with a test account you control and a recent test-only rollout timestamp. Test successful delivery and failure handling without enabling a broad production rollout. Preview mode never calls the provider. Tests in the repository use mocked HTTP responses, not real email. Run these from the repository root (integration tests require your local API database and create their own disposable schema):

```powershell
npm test --workspace @tri-city/api
npm run test:integration --workspace @tri-city/api
npm run test:profile --workspace @tri-city/web
npm run build --workspace @tri-city/web
```

Delivery records are in the `NotificationEmail` table, linked to `Notification` by `notificationId`. Inspect `status`, `attempts`, `nextAttemptAt`, `providerMessageId` and `lastError` when diagnosing issues. Use the Resend dashboard for actual delivery/bounce status.

## 6. Create the Cloud Run email job

Choose **6.1 (GCP console)** or **6.2 (Cloud Shell)**. Both create the same job; do not follow both creation paths. Complete the successful code/migration deployment from section 4 first. Keep `EMAIL_WORKER_ENABLED` absent/false in GitHub until the job exists and is tested.

### 6.1 Create the job in the GCP console

#### A. Prepare identities and permissions

1. In the Google Cloud console, select the same project as your deployed app. Under **APIs & Services > Library**, enable **Cloud Run Admin API**, **Cloud SQL Admin API**, **Secret Manager API** and **Cloud Scheduler API** if not already enabled.
2. Open **IAM & Admin > Service Accounts > Create service account**. Use service account ID `tricity-email-worker`. In **Grant this service account access to project**, add **Cloud SQL Client** (`roles/cloudsql.client`). Finish creation; do not generate/download a service account key. If the account already exists, reuse it and verify its role under project IAM.
3. Create another service account with ID `tricity-email-scheduler`. Leave project-wide roles empty. Section 7 gives this account permission to execute only the email job; it does not need access to secrets or the database.
4. Open **Security > Secret Manager** (or search the console for Secret Manager). Confirm `resend-api-key` exists and has an enabled version, as created in section 4. Open that secret's **Permissions** panel, click **Grant access**, enter `tricity-email-worker@YOUR_PROJECT_ID.iam.gserviceaccount.com`, and assign **Secret Manager Secret Accessor**. Repeat on the existing `db_url-app` secret. Grant access on these individual secrets, not every secret in the project.
5. Record the enabled secret versions you will use. For `db_url-app`, prefer the same numeric version used by the app's existing `DATABASE_URL` secret reference. For `resend-api-key`, select the version you just created. A pinned version makes later key rotation explicit; `latest` is also supported if you intentionally want new executions to use the newest enabled version.

#### B. Configure the separate job

1. Open **Cloud Run > Jobs** and click **Deploy container** to open the **Create job** form. Depending on the console layout, the entry button may be labelled **Create job**. Create a **Job**, not a Service; keep your existing public app service unchanged.
2. Select the **app container image** from the successful GitHub release recorded in section 4. Its URL ends in `/app:FULL_COMMIT_SHA`. Do not choose `/migrations:...`. You can copy the image from the existing service's successful revision or choose it from Artifact Registry.
3. Enter job name **`tricity-email-notifications`** exactly, choose the same region as your GitHub `GCP_REGION` (normally **us-east1**), and set **Number of tasks** to **1**. If an option to execute immediately is shown, leave it unchecked.
4. Expand **Containers, Networking, Security** and edit the main container. Set **Container command** to `node`. Add exactly one **Container argument**: `apps/api/dist/email-worker.js`. Do not combine them into one command field and do not use `apps/api/dist/main.js`, which starts the web server. Keep a single container; no port, HTTP endpoint, sidecar or health check is needed for this worker.
5. Set the container resource limits to **1 CPU** and **512 MiB memory**. In the task settings, set **Task timeout** to **600 seconds / 10 minutes**, **Number of retries per failed task** to **0**, and maximum concurrent tasks / parallelism to **1**. The application queue manages retries.
6. Under **Security > Service account**, select `tricity-email-worker@YOUR_PROJECT_ID.iam.gserviceaccount.com`. This is the runtime identity; do not select the GitHub deploy identity or the scheduler identity.
7. In the container settings, find **Cloud SQL connections**, click **Add connection**, and select the app's existing SQL instance. Check its connection name against GitHub's `CLOUD_SQL_CONNECTION` value. This attachment is needed for the `/cloudsql/...` socket used by the existing database secret. If your deployment uses private-IP/VPC networking instead, match the existing app's working network setup as well; a secret alone does not supply network connectivity.
8. Under the container's **Variables & Secrets** tab, use **Add variable** for each non-secret entry in the following table. Enter raw values without YAML quotation marks:

| Name | Console value |
| --- | --- |
| `NODE_ENV` | `production` |
| `EMAIL_ENABLED` | `true` |
| `EMAIL_DELIVERY_MODE` | `preview` |
| `EMAIL_FROM` | `no_reply@contact.tricitiesdropin.com` |
| `EMAIL_NOTIFICATIONS_START_AT` | Your actual preparation timestamp in UTC, e.g. `2026-12-01T15:00:00.000Z`; replace this example |
| `EMAIL_BATCH_SIZE` | `50` |
| `EMAIL_DAILY_LIMIT` | `100` |
| `EMAIL_MONTHLY_LIMIT` | `3000` |
| `PUBLIC_SITE_ORIGIN` | Copy your app's actual HTTPS origin; no path or query |

9. In that same tab, use **Reference a secret** (rather than Add variable) twice. Map environment variable **`DATABASE_URL`** to secret **`db_url-app`**, and **`RESEND_API_KEY`** to **`resend-api-key`**. Select the enabled versions recorded above and expose them as **environment variables**, not mounted files. Do not paste either secret's value into a plain variable.
10. Click **Create** and wait for the configuration to save. Creating this job does not create a recurring schedule. Before executing, open **View and edit job configuration** and confirm the command, argument, preview mode, service account, SQL attachment, and both secret references.

These settings follow Google's [job creation guide](https://docs.cloud.google.com/run/docs/create-jobs), [container command settings](https://docs.cloud.google.com/run/docs/configuring/jobs/containers), and [secret configuration](https://docs.cloud.google.com/run/docs/configuring/jobs/secrets). Console labels may move between tabs; use the setting names above.

#### C. Preview, then launch from the console

1. On the job details page, click **Execute** and confirm without overrides. Under **Executions**, open the new execution and view its logs. Expect `mode: "preview"`, `sent: 0`, and possibly a nonzero `previewed` count. Zero previews can mean no notifications are eligible since your timestamp. Preview still refreshes in-app reminders/queues in the selected database, but does not call Resend.
2. If the execution fails, inspect logs before proceeding. An access-denied error commonly means a missing worker secret permission or Cloud SQL Client role. A connection error can indicate a missing SQL attachment/network setting. A missing module or web-server startup usually means the wrong image or command/argument.
3. After local email-content review and Resend domain verification, return to **View and edit job configuration > Variables & Secrets**. Set `EMAIL_NOTIFICATIONS_START_AT` to your actual launch time in UTC and `EMAIL_DELIVERY_MODE` to **`resend`**. Keep `EMAIL_ENABLED=true`, then click **Update**. Keep that timestamp stable on subsequent releases.
4. Click **Execute** only when ready for a real production send to all eligible opted-in users. Inspect execution logs and the Resend dashboard. There is no test-recipient filter on this job. For an isolated real-send test, use a separate test database/job first.
5. Continue to **section 7** to configure the schedule. The Cloud Shell commands there still need `PROJECT_ID`, `REGION` and `SCHEDULER_SA` set even if you created the job in the console. Their values are your project ID, the job region, and `tricity-email-scheduler@YOUR_PROJECT_ID.iam.gserviceaccount.com`.
6. Once the job is tested, set the GitHub variable `EMAIL_WORKER_ENABLED=true` as described in section 4. Future releases update this console-created job's image while retaining its settings.

With this console path, you do **not** need `email-worker.env.yaml`. Future configuration edits can also be made in the console; skip the Cloud Shell creation alternative below.

### 6.2 Alternative: create the job using Cloud Shell

Use **Bash in Google Cloud Shell**, matching the existing deployment guide. Fill in existing project/image/SQL/secret names. IMAGE should be the same commit-tagged application image that contains the new worker. The Resend API key is uploaded through Secret Manager's console or another secure input method; commands below only reference secret names.

```bash
export PROJECT_ID="YOUR_PROJECT"
export REGION="us-east1"
export IMAGE="YOUR_ARTIFACT_REGISTRY_APP_IMAGE:COMMIT_SHA"
export SQL_CONNECTION="YOUR_PROJECT:us-east1:YOUR_SQL_INSTANCE"
export WORKER_SA="tricity-email-worker@$PROJECT_ID.iam.gserviceaccount.com"
export SCHEDULER_SA="tricity-email-scheduler@$PROJECT_ID.iam.gserviceaccount.com"
gcloud config set project "$PROJECT_ID"
gcloud services enable run.googleapis.com cloudscheduler.googleapis.com secretmanager.googleapis.com

gcloud iam service-accounts create tricity-email-worker
gcloud iam service-accounts create tricity-email-scheduler
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$WORKER_SA" --role=roles/cloudsql.client
# Grant access only to the two secrets used by this job.
for SECRET in db_url-app resend-api-key; do
  gcloud secrets add-iam-policy-binding "$SECRET"   \
  --member="serviceAccount:$WORKER_SA" --role=roles/secretmanager.secretAccessor
done
```

Create an `email-worker.env.yaml` file locally in Cloud Shell. It contains only non-secret configuration. Replace every placeholder, especially the origin and rollout time.

```yaml
NODE_ENV: production
EMAIL_ENABLED: "true"
EMAIL_DELIVERY_MODE: preview
EMAIL_FROM: no_reply@contact.tricitiesdropin.com
EMAIL_NOTIFICATIONS_START_AT: "YOUR_ACTUAL_ROLLOUT_UTC_TIMESTAMP"
EMAIL_BATCH_SIZE: "50"
EMAIL_DAILY_LIMIT: "100"
EMAIL_MONTHLY_LIMIT: "3000"
PUBLIC_SITE_ORIGIN: "https://YOUR_APP_ORIGIN"
```

```bash
gcloud run jobs deploy tricity-email-notifications --region="$REGION" \
  --image="$IMAGE" --service-account="$WORKER_SA" \
  --set-cloudsql-instances="$SQL_CONNECTION" \
  --set-secrets="DATABASE_URL=db_url-app:latest,RESEND_API_KEY=resend-api-key:latest" \
  --env-vars-file=email-worker.env.yaml \
  --command=node --args=apps/api/dist/email-worker.js \
  --tasks=1 --parallelism=1 --max-retries=0 --task-timeout=10m \
  --cpu=1 --memory=512Mi

gcloud run jobs execute tricity-email-notifications --region="$REGION" --wait
```

Preview files inside Cloud Run are ephemeral; inspect the summary logs and test local previews first. Follow section 4.2 step 9 to set the actual launch timestamp, change EMAIL_DELIVERY_MODE to `resend` in the YAML and redeploy the job. Execute a live production run only when you intend to email all eligible accounts. Keep --max-retries=0: the database controls delivery retries. A timeout after Resend may be ambiguous, so do not blindly rerun uncertain sends.

## 7. Run it when nobody is using the app

Grant the scheduler identity permission to execute **this job** only, then create one five-minute schedule:

```bash
gcloud run jobs add-iam-policy-binding tricity-email-notifications --region="$REGION" \
  --member="serviceAccount:$SCHEDULER_SA" --role=roles/run.invoker

gcloud scheduler jobs create http tricity-email-notifications --location="$REGION" \
  --schedule="*/5 * * * *" --time-zone=Etc/UTC \
  --uri="https://run.googleapis.com/v2/projects/$PROJECT_ID/locations/$REGION/jobs/tricity-email-notifications:run" \
  --http-method=POST --headers="Content-Type=application/json" --message-body='{}' \
  --oauth-service-account-email="$SCHEDULER_SA" \
  --oauth-token-scope="https://www.googleapis.com/auth/cloud-platform"
```

This targets a **Google API**, so use OAuth, not OIDC. No public worker HTTP endpoint or shared scheduler password is introduced. The scheduler API call starts the job; it does not wait for completion. Check Cloud Run execution logs separately and alert on failures. The human configuring the job needs permission to act as the relevant service accounts; retain the Cloud Scheduler service agent's normal service-agent role.

Run `gcloud scheduler jobs run tricity-email-notifications --location="$REGION"` once and inspect the job execution. Confirm reminders are generated and delivered without opening a browser. [Google's scheduled-jobs guide](https://docs.cloud.google.com/run/docs/execute/jobs-on-schedule).

## 8. GitHub CI/CD and operation

The existing `.github/workflows/deploy.yml` includes an optional worker-image update after migrations/app deployment. After creating and testing the job above, set the GitHub repository variable **EMAIL_WORKER_ENABLED=true** to enable that step. It updates the existing `tricity-email-notifications` job to the same commit-tagged image, preserving its secrets/environment/schedule. Leave the variable unset until the job exists; otherwise deployment will fail. Deployment alone must not execute the email job. Keep credentials in Secret Manager, not GitHub runtime YAML. Grant the GitHub deploy identity permission to deploy this job and act as WORKER_SA; keep the Resend API key attached only to the worker. Update the job image on future releases too, so notification rules do not drift from the app.

If the optional CI image-update step fails with a permissions error, copy the existing GitHub `GCP_DEPLOY_SA` variable (the deploy service account email) and grant only the missing permissions. Run these in Cloud Shell with the section 6 variables still set; the account running these commands must be allowed to grant IAM roles:

```bash
export DEPLOY_SA="COPY_YOUR_EXISTING_GITHUB_GCP_DEPLOY_SA_VALUE"
gcloud run jobs add-iam-policy-binding tricity-email-notifications --region="$REGION" \
  --member="serviceAccount:$DEPLOY_SA" --role=roles/run.developer
gcloud iam service-accounts add-iam-policy-binding "$WORKER_SA" \
  --member="serviceAccount:$DEPLOY_SA" --role=roles/iam.serviceAccountUser
```

Your deploy identity may already have the first permission through an existing project-level role. The worker uses its own service account, so the deploy identity may still need permission to act as that new account. These grants do not give the deploy identity the Resend key. See Google's [job environment configuration permissions](https://docs.cloud.google.com/run/docs/configuring/jobs/environment-variables) and [job secret configuration](https://docs.cloud.google.com/run/docs/configuring/jobs/secrets).

Keep the rollout timestamp stable after activation; moving it backward can enqueue old notifications. Monitor delivery states, failed job executions, Resend acceptance/bounce/complaint rates, and suppression. Resend acceptance is not proof of inbox delivery. Hard delivery rejections stop or retry as recorded; ambiguous sends are held for manual investigation to avoid automatic duplicate emails. There is no promise of exactly-once external delivery.

To pause: pause the Cloud Scheduler job and set EMAIL_ENABLED=false on the job. In-app notifications continue working. Do not delete sent delivery history or reset it to pending as a routine retry procedure.

## 9. Free-plan limits and recovery

The worker reserves capacity in a short database transaction shared across overlapping executions: at most 100 daily and 3,000 monthly accepted/in-flight/uncertain emails for this app, using UTC boundaries. Limits cannot be configured higher than Free. Lower them if the Resend account also sends other mail. Provider limits remain authoritative because dashboard tests, other apps and received messages may consume the same quota. Keep this app's Resend account dedicated where possible.

When a local or provider quota is reached, affected emails remain pending until the next UTC day/month. Quota deferrals do not exhaust normal retry attempts. The worker checks whether each reminder is still relevant at send time; an expired kickoff reminder is skipped rather than sent after the game. Thus Free may delay or omit emails during busy days. Players should use the app as the source of truth.

Each request includes a stable delivery ID as its Resend idempotency key. Resend retains these for 24 hours. The database prevents ordinary duplicate claims; uncertain network failures and interrupted sends are held as UNKNOWN for manual investigation, not automatically resent beyond that window. Definitive throttling has bounded retries; hard rejections become FAILED. Fix credentials/configuration and inspect the provider dashboard before manually changing delivery states. Never reset SENT records as a routine retry.

Pause the schedule or lower limits while investigating a backlog. Queued emails recheck user preferences before sending. Monitor pending age, retrying/deferred counts and failures. Do not enable pay-as-you-go or upgrade without intentionally deciding to change this Free-only setup.

## 10. Launch checklist

- [ ] Resend Free selected; domain/DKIM/SPF verified and restricted Sending key stored securely.
- [ ] Sender exactly no_reply@contact.tricitiesdropin.com; optional Reply-To mailbox is monitored.
- [ ] Resend dashboard delivery/suppression monitoring assigned to an administrator.
- [ ] Daily/monthly caps and delayed-email behavior tested; other account usage accounted for.
- [ ] Migration deployed before the app/worker.
- [ ] HTTPS origin and rollout timestamp verified.
- [ ] Previewed all notification types, cutoff wording and How to links.
- [ ] Confirmed a cancelled game does not receive upcoming/late-payment instructions.
- [ ] Verified profile email preferences and sign-out/sign-in notification links.
- [ ] Verified overlapping job runs do not claim the same email twice.
- [ ] Scheduled execution works with no app users online.
- [ ] GitHub deploys the worker image as well as the app; failed executions are monitored.

Resend, Cloud Run, Cloud SQL and Scheduler usage are billed by their providers. Resend email sending is $0 while staying within Free limits. Cloud Run job startup/database work, Scheduler and secrets can still add usage charges; Free email does not make the GCP worker free. Check current provider pricing and actual usage after launch. The existing app/database bill is separate.
