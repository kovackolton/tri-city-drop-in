# Architecture and database draft

Deployment now follows the [GCP and GitHub Actions deployment guide](gcp-deployment-guide.md). This document retains historical milestone proposals; current feature reviews supersede older strike/payment-policy descriptions below.

## Stack

Angular 21 with Tailwind 4 and NgRx Signal Store; RxJS for HTTP streams. NestJS 11 with Prisma 6 and PostgreSQL 16. Node 22 containers. Versions are a baseline, not a claim to use the newest major releases. The lockfile should be generated and committed after installation is verified.

Firebase Authentication will handle identity providers; the API will verify Firebase ID tokens with Firebase Admin and map their UID to a database user. Provider access tokens and passwords do not belong in PostgreSQL. Google and email/password are the supported sign-in methods. Firebase manages password credentials, verification emails and reset links; the API accepts only Firebase ID tokens and never receives passwords. Password sessions require a verified email before API access. Organizer privileges must be granted through a trusted administrative process, never from profile update input. Public event responses expose counts, not attendee personal details.

## Data model

The executable draft is `apps/api/prisma/schema.prisma`.

| Table | Responsibility |
| --- | --- |
| User | Firebase identity, profile, player/organizer role |
| Location | Reusable pitch address and IANA timezone |
| Event | Organizer, pitch, start/end, per-seat USD price, seat limit, guest allowance, cancellation cutoff, lifecycle |
| Signup | One player or guest seat, queue timestamp, attendance and cancellation state |
| Strike | Auditable incident attributed to the booking account, expiry and revocation |
| Notification | Durable outbox with deduplication and retry state |
| AuditLog | Organizer action history associated with an event |

Dates are PostgreSQL `timestamptz`; location timezone governs display and scheduled reminders. Historical signup rows are retained. An account holder has guestNumber 0; their guests have stable positive numbers within a booking UUID. The booking/guest-number constraint prevents duplicate seats, while a partial unique index permits only one active host booking per event/account. A guest has no login and the booking account receives notifications and is accountable for that seat. Guests cancel with their host.

## Signup rules implemented in milestone 3

Capacity is the number of CONFIRMED signup rows, including guests. All capacity-changing operations must lock the event row within a transaction before reading counts or editing signups. This includes organizer overrides, capacity changes, cancellation and queue promotion. A simple count followed by an insert without locking would oversubscribe under concurrency.

Default proposal: bookings with guests stay together. Admit a party only if all its seats fit; otherwise queue the whole party. Promote parties in `(queuedAt, id)` order using the host row as the party key. A larger party at the head blocks smaller parties behind it, preserving FIFO fairness. Rejoining after cancellation resets queue time. Organizer changes must obey capacity; to add above the current cap, explicitly increase capacity and audit the change. Reducing capacity below current confirmed occupancy should be rejected.

The pricing/constraints migration adds SQL CHECK constraints for positive capacity, end after start, nonnegative guest numbers and guest limits, nonnegative cutoff hours, and host/guest name consistency. These are not expressed by Prisma's schema syntax. Cross-row capacity and guest-host consistency are enforced by the locked signup transactions. The signup migration adds booking history and per-seat payment obligations. See [milestone review](signup-review.md).

## Cancellation and strikes

Proposed configurable starting policy: cancellations within 12 hours and unexcused absences can create a strike; event cancellation never penalizes players. No automatic suspension threshold is selected yet. Record the incident once, allow organizers to revoke it, and retain its history. Confirm rules and expiry before enabling enforcement. Attendance belongs to each seat so guests and hosts can be marked independently.

## Payment review and missed-payment strikes

Events declare `priceCents` (integer, default 0) and `currency` (USD-only enum). Zero displays as Free; 1250 displays as $12.50 USD per seat. The event API validates nonnegative integer cents, and the follow-up migration adds a `priceCents >= 0` SQL CHECK. The PostgreSQL integer storage ceiling is 2,147,483,647 cents; any lower business maximum remains configurable. Never use floating point for money.

At queue entry, snapshot the accepted event price per seat. On confirmation, copy that quote into its payment obligation. Waitlisted seats do not owe payment until confirmed, and promotion honors their accepted quote. Event price edits must not change existing quotes or obligations. Free seats carry no payment requirement and cannot receive missed-payment strikes. Guests have the same per-seat event price; waiver tools are a future organizer feature.

Players pay physically at the event; no prepayment or online submission is required to join or keep a confirmed spot. An obligation records the agreed amount, not a demand to pay in advance. Payment is due by event end, and reviews open after the event ends. The booking account reviews each guest seat separately.

Each paid seat shows two ticks: player reviewed and organizer reviewed. Each side independently reports paid or unpaid, with timestamps. A tick means the review happened, including a review that says unpaid. Player reports never change the organizer's receipt confirmation; only the event organizer can set PAID/UNPAID settlement status. Disagreement is visible and must be resolved before any missed-payment enforcement. Corrections retain their audit history. Free and cancelled seats do not need reviews. Waivers, dispute-resolution tools and strikes remain future work.

Organizer strike endpoints accept only MISSED_PAYMENT, LATE_CANCELLATION and NO_SHOW. Manual review opens after event end; missed-payment strikes require both paid flags explicitly false, a positive unpaid obligation and a confirmed seat. Missing/disagreeing reviews and cancelled/Free obligations cannot qualify. No automatic grace-period enforcement, suspension threshold or expiry policy has been selected. Incidents deduplicate per signup/reason, retain history and support revocation with notes. A corrected payment review automatically revokes any missed-payment strike whose unpaid agreement no longer holds. All mutations check event ownership and lock the event row.

Payment obligations, independent post-event reviews and manual organizer strikes/revocation are implemented. Review UI appears on each My games event card and the organizer's event player list; other players cannot see private payment details or strikes. Attendance starts at event start, with Absent marking only after event end. Roster removal and manual promotion operate on whole parties and preserve capacity/price invariants. See [organizer review](organizer-review.md). Online collection, card processing, partial payments and refunds require a separate design.

## Notifications and GCP plan

Create notification outbox rows in the same transaction as a promotion or event change. A worker will claim committed rows, send, and retry with backoff. Delivery needs idempotency and must handle provider acceptance followed by a worker crash. Notification types: promotion, event cancellation/change and reminder. Reminder scheduling must use dedupe keys and recheck the event and signup before sending.

Current deployment plan: one public Cloud Run service containing the API, Angular assets and server-rendered event previews; Cloud SQL PostgreSQL; Artifact Registry; Secret Manager; dedicated runtime/migration/deployment identities; and GitHub Actions using Workload Identity Federation. Firebase remains the authentication service. Use Cloud SQL socket integration and managed secrets; run migrations as a separate job with a schema-owning database identity. See the [step-by-step deployment guide](gcp-deployment-guide.md) for provisioning, CI/CD, bootstrap, verification and rollback.

The supplied nginx configuration uses Compose service DNS (`api`) and remains for local Docker only. `Dockerfile.cloudrun` provides same-origin routing directly, so the initial deployment needs neither that nginx configuration nor a load balancer. The combined image has been tested locally; account provisioning and the guide's GitHub workflow remain deployment steps. Current in-app notifications/reminders are refresh-driven. Cloud Tasks/Scheduler and external delivery workers are future options if background delivery is added, not prerequisites for the current app.

## Optional notification email delivery

The Resend email extension is disabled by default. See [Resend email notifications](resend-email-notifications.md) for setup, sender verification, rollout cutoff, local previews and the scheduled Cloud Run Job. NotificationEmail tracks delivery separately from in-app read status. Cloud Scheduler starts the job even when no browser is open; it refreshes existing reminder rules, queues notifications, and sends through Resend. Ambiguous external sends are held for investigation rather than automatically retried. No SMS is included.
