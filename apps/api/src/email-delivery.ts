import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { Database } from './database';
import { NotificationsService } from './notifications';
import { managesEvent } from './event-organizers';
import { eligibleForEvent } from './event-eligibility';
import { renderNotificationEmail, RenderedEmail } from './notification-email';
export interface EmailConfig {
  mode: 'preview' | 'resend'; from: string; startAt: Date; origin: string; batchSize: number;
  previewDir: string; intervalMs: number; dailyLimit: number; monthlyLimit: number; apiKey?: string; replyTo?: string;
}
export function emailConfig(env: NodeJS.ProcessEnv = process.env): EmailConfig | null {
  if (env.EMAIL_ENABLED !== 'true') return null;
  const mode = env.EMAIL_DELIVERY_MODE ?? 'preview'; if (!['preview', 'resend'].includes(mode)) throw new Error('EMAIL_DELIVERY_MODE must be preview or resend.');
  const startAt = new Date(env.EMAIL_NOTIFICATIONS_START_AT ?? '');
  if (!Number.isFinite(startAt.getTime()) || !/Z$/.test(env.EMAIL_NOTIFICATIONS_START_AT ?? '')) throw new Error('Set EMAIL_NOTIFICATIONS_START_AT to an explicit UTC rollout timestamp ending in Z.');
  const origin = new URL(env.PUBLIC_SITE_ORIGIN ?? (mode === 'preview' ? env.WEB_ORIGIN ?? 'http://localhost:4200' : ''));
  if (origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/' || !['http:', 'https:'].includes(origin.protocol) || mode === 'resend' && origin.protocol !== 'https:') throw new Error('PUBLIC_SITE_ORIGIN must be an HTTPS origin for Resend.');
  const from = env.EMAIL_FROM ?? 'no_reply@contact.tricitiesdropin.com'; if (from !== 'no_reply@contact.tricitiesdropin.com') throw new Error('EMAIL_FROM must be no_reply@contact.tricitiesdropin.com.');
  const number = (name: string, fallback: number, max: number) => { const value = Number(env[name] ?? fallback); if (!Number.isInteger(value) || value < 1 || value > max) throw new Error(`Invalid ${name}.`); return value; };
  const address = (name: string) => { const value = env[name]?.trim(); if (value && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value)) throw new Error(`Invalid ${name}.`); return value; };
  if (mode === 'resend' && !env.RESEND_API_KEY?.trim()) throw new Error('RESEND_API_KEY is required for Resend delivery.');
  return { mode: mode as EmailConfig['mode'], from, startAt, origin: origin.origin, batchSize: number('EMAIL_BATCH_SIZE', 50, 500), previewDir: resolve(env.EMAIL_PREVIEW_DIR ?? 'email-previews'), intervalMs: number('EMAIL_SEND_INTERVAL_MS', 1100, 60000), dailyLimit: number('EMAIL_DAILY_LIMIT', 100, 100), monthlyLimit: number('EMAIL_MONTHLY_LIMIT', 3000, 3000), apiKey: env.RESEND_API_KEY?.trim(), replyTo: address('EMAIL_REPLY_TO') };
}
export interface EmailSender { send(to: string, message: RenderedEmail, deliveryId: string): Promise<string>; }
export class ResendEmailSender implements EmailSender {
  constructor(private readonly config: EmailConfig, private readonly request: typeof fetch = fetch) {}
  async send(to: string, message: RenderedEmail, deliveryId: string) {
    const response = await this.request('https://api.resend.com/emails', {
      method: 'POST', signal: AbortSignal.timeout(30000),
      headers: { Authorization: `Bearer ${this.config.apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': `notification/${deliveryId}` },
      body: JSON.stringify({ from: this.config.from, to: [to], subject: message.subject, html: message.html, text: message.text,
        ...(this.config.replyTo ? { reply_to: this.config.replyTo } : {}), tags: [{ name: 'notification_delivery', value: deliveryId }] })
    });
    const result = await response.json() as { id?: string; name?: string };
    if (!response.ok) {
      // Deliberately omit provider messages: they can contain recipient data or credentials.
      const error = new Error('Resend rejected the send request.') as Error & { status: number };
      error.name = /^[a-z_]{1,80}$/.test(result.name ?? '') ? result.name! : 'resend_error';
      error.status = response.status; throw error;
    }
    if (!result.id) throw new Error('Resend acceptance could not be confirmed.');
    return result.id;
  }
}
export function emailFailure(error: unknown) {
  const value = error as { name?: string; status?: number };
  if (value?.name === 'daily_quota_exceeded') return 'daily';
  if (value?.name === 'monthly_quota_exceeded' || value?.name === 'email_above_quota') return 'monthly';
  if (value?.status === 429 || value?.name === 'concurrent_idempotent_requests') return 'retry';
  if (value?.status && value.status >= 400 && value.status < 500) return 'failed';
  // An uncertain response may follow acceptance; retain for manual investigation.
  return 'unknown';
}
export function emailQuotaWindows(now = new Date()) {
  return { day: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())),
    month: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
    nextDay: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)),
    nextMonth: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)) };
}
export class NotificationEmailWorker {
  constructor(private readonly db: Database, private readonly notifications: NotificationsService, private readonly config: EmailConfig, private readonly sender?: EmailSender, private readonly pause: (ms: number) => Promise<void> = ms => new Promise(resolve => setTimeout(resolve, ms))) {}
  async generate() {
    let cursor: string | undefined; let users = 0, failures = 0;
    for (;;) {
      const page = await this.db.user.findMany({ orderBy: { id: 'asc' }, take: 100, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), select: { id: true } });
      if (!page.length) break;
      for (const user of page) { try { await this.notifications.inbox(user.id); users++; } catch { failures++; } }
      cursor = page[page.length - 1].id;
    }
    const candidates = await this.db.notification.findMany({ where: { createdAt: { gte: this.config.startAt }, availableAt: { lte: new Date() }, status: { in: ['PENDING', 'SENT'] }, emailDelivery: { is: null } }, select: { id: true, user: { select: { emailNotificationsEnabled: true } } }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: 1000 });
    if (candidates.length) await this.db.notificationEmail.createMany({ data: candidates.map(notification => ({ notificationId: notification.id, status: notification.user.emailNotificationsEnabled ? 'PENDING' : 'SKIPPED', ...(notification.user.emailNotificationsEnabled ? {} : { lastError: 'Email preference disabled when queued.' }) })), skipDuplicates: true });
    return { refreshedUsers: users, refreshFailures: failures, queued: candidates.length };
  }
  private async applicable(notificationId: string) {
    const notification = await this.db.notification.findUnique({ where: { id: notificationId }, include: { user: true } });
    if (!notification || !notification.user.emailNotificationsEnabled || notification.createdAt < this.config.startAt || !['PENDING', 'SENT'].includes(notification.status)) return null;
    if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(notification.user.email)) return null;
    const payload = (notification.payload && typeof notification.payload === 'object' ? notification.payload : {}) as { eventId?: string; bookingId?: string };
    const event = typeof payload.eventId === 'string' && /^[0-9a-f-]{36}$/i.test(payload.eventId) ? await this.db.event.findUnique({ where: { id: payload.eventId }, include: { location: true } }) : null;
    const now = new Date(); const active = event && !event.deletedAt && ['PUBLISHED', 'COMPLETED'].includes(event.status);
    if (notification.kind === 'EVENT_REMINDER' || notification.kind === 'WAITLIST_PROMOTED') {
      if (!active || event.status !== 'PUBLISHED' || event.startsAt <= now) return null;
      if (!await this.db.signup.findFirst({ where: { userId: notification.userId, eventId: event.id, ...(payload.bookingId ? { bookingId: payload.bookingId } : {}), guestNumber: 0, status: 'CONFIRMED', subResponsibilityAcknowledgedAt: null } })) return null;
    }
    if (notification.kind === 'PAYMENT_REVIEW_REMINDER') {
      if (!active || event.endsAt.getTime() + 86400000 > now.getTime() || !await this.db.signup.findFirst({ where: { userId: notification.userId, eventId: event.id, ...(payload.bookingId ? { bookingId: payload.bookingId } : {}), status: 'CONFIRMED', payment: { amountCents: { gt: 0 }, status: { not: 'VOID' }, playerPaid: null } } })) return null;
    }
    if (['ORGANIZER_REVIEW_REMINDER', 'STALE_EVENT_REVIEW_REMINDER'].includes(notification.kind)) {
      if (!active || event.endsAt > now || !['ORGANIZER', 'ADMINISTRATOR'].includes(notification.user.role)) return null;
      const stale = now.getTime() - event.endsAt.getTime() >= 7 * 86400000;
      if (notification.kind === 'ORGANIZER_REVIEW_REMINDER' && stale || notification.kind === 'STALE_EVENT_REVIEW_REMINDER' && !stale) return null;
      if (!managesEvent(event, notification.userId) && !(notification.user.role === 'ADMINISTRATOR' && stale)) return null;
      if (await this.db.auditLog.findFirst({ where: { eventId: event.id, action: 'EVENT_REVIEW_COMPLETED' } })) return null;
    }
    if (notification.kind === 'EVENT_INVITATION') {
      if (!active || event.status !== 'PUBLISHED' || event.startsAt <= now || !eligibleForEvent(event, notification.user)) return null;
      if (!await this.db.eventInvitation.findFirst({ where: { eventId: event.id, userId: notification.userId, status: 'PENDING' } })) return null;
    }
    if (['EVENT_CHANGED', 'EVENT_PUBLISHED', 'EVENT_RETURNED_TO_DRAFT', 'ORGANIZER_BOOKED_PLAYER'].includes(notification.kind)) {
      if (!event || event.deletedAt || event.status === 'CANCELLED' || !await this.db.signup.findFirst({ where: { eventId: event.id, userId: notification.userId, guestNumber: 0, status: { in: ['CONFIRMED', 'WAITLISTED'] } } })) return null;
    }
    return { notification, event, recipient: notification.user.email };
  }
  async deliver() {
    if (this.config.mode === 'resend' && !this.sender) throw new Error('Resend sender is required.');
    if (this.config.mode === 'resend') await this.db.notificationEmail.updateMany({ where: { status: 'SENDING', claimedAt: { lt: new Date(Date.now() - 15 * 60000) } }, data: { status: 'UNKNOWN', lastError: 'Previous send was interrupted. Investigate Resend before any manual retry.' } });
    const rows = await this.db.notificationEmail.findMany({ where: { status: 'PENDING', nextAttemptAt: { lte: new Date() }, attempts: { lt: 5 } }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: this.config.batchSize });
    const result = { sent: 0, previewed: 0, skipped: 0, retrying: 0, deferred: 0, failed: 0, unknown: 0 };
    for (const row of rows) {
      const applicable = await this.applicable(row.notificationId);
      if (this.config.mode === 'preview') {
        if (!applicable) { result.skipped++; continue; }
        const message = renderNotificationEmail(applicable.notification, applicable.event, this.config.origin);
        await mkdir(this.config.previewDir, { recursive: true });
        await writeFile(join(this.config.previewDir, row.id + '.html'), message.html, 'utf8');
        await writeFile(join(this.config.previewDir, row.id + '.txt'), `From: ${this.config.from}\nSubject: ${message.subject}\n\n${message.text}`, 'utf8'); result.previewed++; continue;
      }
      if (!applicable) { await this.db.notificationEmail.updateMany({ where: { id: row.id, status: 'PENDING' }, data: { status: 'SKIPPED', lastError: 'Disabled, invalid recipient or notification no longer applicable.' } }); result.skipped++; continue; }
      const claim = await this.db.$transaction(async tx => {
        // Serialize quota reservations across job executions; the lock ends with this transaction.
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(7411082026)::text`;
        const window = emailQuotaWindows();
        const counted = { status: { in: ['SENDING', 'SENT', 'UNKNOWN'] } };
        const monthly = await tx.notificationEmail.count({ where: { ...counted, claimedAt: { gte: window.month } } });
        const daily = await tx.notificationEmail.count({ where: { ...counted, claimedAt: { gte: window.day } } });
        const resumeAt = monthly >= this.config.monthlyLimit ? window.nextMonth : daily >= this.config.dailyLimit ? window.nextDay : null;
        if (resumeAt) {
          const deferred = await tx.notificationEmail.updateMany({ where: { id: row.id, status: 'PENDING' }, data: { nextAttemptAt: resumeAt, lastError: 'Free-plan capacity reached; deferred without sending.' } });
          return { count: 0, deferred: deferred.count };
        }
        return tx.notificationEmail.updateMany({ where: { id: row.id, status: 'PENDING', attempts: row.attempts }, data: { status: 'SENDING', attempts: { increment: 1 }, claimedAt: new Date() } });
      });
      if ('deferred' in claim) result.deferred += claim.deferred ?? 0;
      if (!claim.count) continue;
      // Recheck after claiming, so another run or a preference change cannot reuse this send.
      const current = await this.applicable(row.notificationId);
      if (!current) { await this.db.notificationEmail.update({ where: { id: row.id }, data: { status: 'SKIPPED', lastError: 'Disabled, invalid recipient or notification no longer applicable.' } }); result.skipped++; continue; }
      const message = renderNotificationEmail(current.notification, current.event, this.config.origin);
      try {
        const messageId = await this.sender!.send(current.recipient, message, row.id);
        await this.db.notificationEmail.update({ where: { id: row.id }, data: { status: 'SENT', sentAt: new Date(), recipient: current.recipient, providerMessageId: messageId, lastError: null } }); result.sent++;
      } catch (error) {
        const type = emailFailure(error), quota = type === 'daily' || type === 'monthly';
        const retry = type === 'retry' && row.attempts + 1 < 5;
        const status = quota || retry ? 'PENDING' : type === 'unknown' ? 'UNKNOWN' : 'FAILED';
        const window = emailQuotaWindows();
        await this.db.notificationEmail.update({ where: { id: row.id }, data: { status, recipient: current.recipient,
          lastError: `Send ${type}; provider code: ${(error as { name?: string })?.name ?? 'unknown'}`.slice(0, 240),
          ...(quota ? { attempts: row.attempts, nextAttemptAt: type === 'monthly' ? window.nextMonth : window.nextDay } :
            retry ? { nextAttemptAt: new Date(Date.now() + 300000 * 2 ** row.attempts) } : {}) } });
        if (quota) {
          result.deferred++;
          // All remaining messages share this account quota; stop calling the provider this run.
          await this.db.notificationEmail.updateMany({ where: { status: 'PENDING', nextAttemptAt: { lte: new Date() } }, data: { nextAttemptAt: type === 'monthly' ? window.nextMonth : window.nextDay } });
          break;
        }
        if (retry) result.retrying++; else if (type === 'unknown') result.unknown++; else result.failed++;

      }
      await this.pause(this.config.intervalMs);
    }
    return result;
  }
  async run() { return { generation: await this.generate(), delivery: await this.deliver() }; }
}
