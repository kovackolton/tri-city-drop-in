import { defaultNotificationRules, NotificationRules } from './notification-catalog';
import { readEmailTuning } from './email-settings';
import { digestWindow, importantNotification, urgentNotification, EmailKind } from './email-policy';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { Database } from './database';
import { NotificationsService } from './notifications';
import { managesEvent } from './event-organizers';
import { eligibleForEvent } from './event-eligibility';
import { renderNotificationEmailBatch, RenderedEmail, EmailListItem } from './notification-email';
export interface EmailConfig {
  notificationRules?: NotificationRules;
  mode: 'preview' | 'resend'; from: string; startAt: Date; origin: string; batchSize: number;
  previewDir: string; intervalMs: number; dailyLimit: number; monthlyLimit: number; apiKey?: string; replyTo?: string; digestStartHour: number; digestDailyLimit: number; urgentReserve: number;
}
export function emailConfig(env: NodeJS.ProcessEnv = process.env): EmailConfig | null {
  if (env.EMAIL_ENABLED !== 'true') return null;
  const mode = env.EMAIL_DELIVERY_MODE ?? 'preview'; if (!['preview', 'resend'].includes(mode)) throw new Error('EMAIL_DELIVERY_MODE must be preview or resend.');
  const startAt = new Date(env.EMAIL_NOTIFICATIONS_START_AT ?? '');
  if (!Number.isFinite(startAt.getTime()) || !/Z$/.test(env.EMAIL_NOTIFICATIONS_START_AT ?? '')) throw new Error('Set EMAIL_NOTIFICATIONS_START_AT to an explicit UTC rollout timestamp ending in Z.');
  const origin = new URL(env.PUBLIC_SITE_ORIGIN ?? (mode === 'preview' ? env.WEB_ORIGIN ?? 'http://localhost:4200' : ''));
  if (origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/' || !['http:', 'https:'].includes(origin.protocol) || mode === 'resend' && origin.protocol !== 'https:') throw new Error('PUBLIC_SITE_ORIGIN must be an HTTPS origin for Resend.');
  const from = env.EMAIL_FROM ?? 'no_reply@contact.tricitiesdropin.com'; if (from !== 'no_reply@contact.tricitiesdropin.com') throw new Error('EMAIL_FROM must be no_reply@contact.tricitiesdropin.com.');
  const address = (name: string) => { const value = env[name]?.trim(); if (value && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value)) throw new Error(`Invalid ${name}.`); return value; };
  if (mode === 'resend' && !env.RESEND_API_KEY?.trim()) throw new Error('RESEND_API_KEY is required for Resend delivery.');
  return { mode: mode as EmailConfig['mode'], from, startAt, origin: origin.origin, ...readEmailTuning(env), previewDir: resolve(env.EMAIL_PREVIEW_DIR ?? (env.NODE_ENV === 'production' ? join(tmpdir(), 'tricity-email-previews') : 'email-previews')),  apiKey: env.RESEND_API_KEY?.trim(), replyTo: address('EMAIL_REPLY_TO') };
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
type Applicable = NonNullable<Awaited<ReturnType<NotificationEmailWorker['applicable']>>>;
interface EmailCandidate { userId: string; kind: EmailKind; entries: { id: string; item: Applicable; createdAt: Date }[]; batchId?: string; createdAt: Date; deadline: number; }
export class NotificationEmailWorker {
  constructor(private readonly db: Database, private readonly notifications: NotificationsService, private readonly config: EmailConfig, private readonly sender?: EmailSender,
    private readonly pause: (ms: number) => Promise<void> = ms => new Promise(resolve => setTimeout(resolve, ms)), private readonly now: () => Date = () => new Date()) {}
  async generate() {
    let cursor: string | undefined; let users = 0, failures = 0;
    for (;;) {
      const page = await this.db.user.findMany({ orderBy: { id: 'asc' }, take: 100, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), select: { id: true } });
      if (!page.length) break;
      for (const user of page) { try { await this.notifications.inbox(user.id, this.now()); users++; } catch { failures++; } }
      cursor = page[page.length - 1].id;
    }
    const candidates = await this.db.notification.findMany({ where: { createdAt: { gte: this.config.startAt }, availableAt: { lte: this.now() }, readAt: null,
      status: { in: ['PENDING', 'SENT'] }, emailDelivery: { is: null } }, select: { id: true, user: { select: { emailNotificationsEnabled: true, emailDigestEnabled: true, emailUrgentEnabled: true } } }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
    if (candidates.length) await this.db.notificationEmail.createMany({ data: candidates.map(n => ({ notificationId: n.id,
      status: n.user.emailNotificationsEnabled && (n.user.emailDigestEnabled || n.user.emailUrgentEnabled) ? 'PENDING' : 'SKIPPED' })), skipDuplicates: true });
    return { refreshedUsers: users, refreshFailures: failures, queued: candidates.length };
  }
  async applicable(notificationId: string) {
    const notification = await this.db.notification.findUnique({ where: { id: notificationId }, include: { user: true } });
    if (!notification || !notification.user.emailNotificationsEnabled || notification.readAt || notification.createdAt < this.config.startAt || !['PENDING', 'SENT'].includes(notification.status)) return null;
    if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(notification.user.email)) return null;
    const payload = (notification.payload && typeof notification.payload === 'object' ? notification.payload : {}) as { eventId?: string; bookingId?: string };
    const event = typeof payload.eventId === 'string' && /^[0-9a-f-]{36}$/i.test(payload.eventId) ? await this.db.event.findUnique({ where: { id: payload.eventId }, include: { location: true } }) : null;
    const now = this.now(); const active = event && !event.deletedAt && ['PUBLISHED', 'COMPLETED'].includes(event.status);
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
  private async candidates() {
    const rows = await this.db.notificationEmail.findMany({ where: { status: 'PENDING', nextAttemptAt: { lte: this.now() }, attempts: { lt: 5 } }, include: { batch: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
    const groups = new Map<string, EmailCandidate>();
    for (const row of rows) {
      if (row.batch && (row.batch.status !== 'PENDING' || row.batch.nextAttemptAt > this.now() || row.batch.attempts >= 5)) continue;
      const item = await this.applicable(row.notificationId);
      const tier = (this.config.notificationRules ?? defaultNotificationRules())[item?.notification.kind ?? ''];
      const user = tier === 'IN_APP' ? null : item?.notification.user;
      let kind: EmailKind = item && user && urgentNotification(item.notification, item.event, this.now(), this.config.notificationRules) && user!.emailUrgentEnabled ? 'URGENT' : 'DIGEST';
      // Reclassify pending, definitively rejected batches when an administrator changes their tier.
      let batchId = row.batchId;
      if (row.batch && row.batch.kind !== kind) {
        if (this.config.mode === 'resend') await this.db.notificationEmail.updateMany({ where: { id: row.id, status: 'PENDING' }, data: { batchId: null } });
        batchId = null;
      }
      const enabled = user && (kind === 'URGENT' ? user.emailUrgentEnabled : user.emailDigestEnabled);
      if (!item || !enabled) {
        if (this.config.mode === 'resend') await this.db.notificationEmail.updateMany({ where: { id: row.id, status: 'PENDING' }, data: { status: 'SKIPPED', lastError: 'Read, resolved, expired or email preference disabled.' } });
        continue;
      }
      const key = batchId ?? `${user!.id}:${kind}`;
      const group = groups.get(key) ?? { userId: user!.id, kind, entries: [], batchId: batchId ?? undefined, createdAt: row.createdAt, deadline: Number.MAX_SAFE_INTEGER };
      group.entries.push({ id: row.id, item, createdAt: row.createdAt });
      if (item.event && item.event.startsAt > this.now()) group.deadline = Math.min(group.deadline, item.event.startsAt.getTime());
      groups.set(key, group);
    }
    if (this.config.mode === 'resend') await this.db.notificationEmailBatch.updateMany({ where: { status: 'PENDING', entries: { none: { status: 'PENDING' } } }, data: { status: 'SKIPPED' } });
    const retryChannels = new Set([...groups.values()].filter(g => g.batchId).map(g => `${g.userId}:${g.kind}`));
    return [...groups.values()].filter(g => (g.batchId || !retryChannels.has(`${g.userId}:${g.kind}`)) &&
      (g.kind === 'URGENT' || g.entries.some(e => importantNotification(e.item.notification.kind, this.config.notificationRules))))
      .sort((a, b) => (a.kind === 'URGENT' ? 0 : 1) - (b.kind === 'URGENT' ? 0 : 1) ||
        (a.deadline <= this.now().getTime() + 86400000 ? 0 : 1) - (b.deadline <= this.now().getTime() + 86400000 ? 0 : 1) || a.createdAt.getTime() - b.createdAt.getTime() || a.userId.localeCompare(b.userId));
  }
  async deliver() {
    const live = this.config.mode === 'resend', now = this.now();
    if (live && !this.sender) throw new Error('Resend sender is required.');
    if (live) {
      await this.db.notificationEmailBatch.updateMany({ where: { status: 'SENDING', claimedAt: { lt: new Date(now.getTime() - 15 * 60000) } }, data: { status: 'UNKNOWN', lastError: 'Interrupted send; investigate Resend before retrying.' } });
      await this.db.notificationEmail.updateMany({ where: { status: 'SENDING', OR: [{ batch: { is: { status: 'UNKNOWN' } } }, { batchId: null, claimedAt: { lt: new Date(now.getTime() - 15 * 60000) } }] }, data: { status: 'UNKNOWN' } });
    }
    const result = { sent: 0, previewed: 0, skipped: 0, retrying: 0, deferred: 0, failed: 0, unknown: 0 };
    const providerPause = await this.db.notificationEmailBatch.findFirst({ where: { lastError: { in: ['Send daily.', 'Send monthly.'] }, nextAttemptAt: { gt: this.now() } }, select: { id: true } });
    if (providerPause) { result.deferred++; return result; }
    const candidates = await this.candidates();
    let processed = 0, previewSent = 0, previewDigests = 0;
    for (const candidate of candidates) {
      if (processed >= this.config.batchSize) break;
      if (candidate.kind === 'DIGEST' && !digestWindow(this.now(), this.config.digestStartHour)) continue;
      const claim = await this.db.$transaction(async tx => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(7411082026)::text`;
        const w = emailQuotaWindows(this.now()), counted = ['SENDING', 'SENT', 'UNKNOWN'];
        const count = async (since: Date) => await tx.notificationEmailBatch.count({ where: { status: { in: counted }, claimedAt: { gte: since } } }) +
          await tx.notificationEmail.count({ where: { batchId: null, status: { in: counted }, claimedAt: { gte: since } } });
        const daily = await count(w.day) + previewSent, monthly = await count(w.month) + previewSent;
        const digestCount = previewDigests + await tx.notificationEmailBatch.count({ where: { kind: 'DIGEST', status: { in: counted }, claimedAt: { gte: w.day } } });
        const alreadySent = candidate.kind === 'DIGEST' && await tx.notificationEmailBatch.count({ where: { userId: candidate.userId, kind: 'DIGEST', status: { in: counted }, claimedAt: { gte: w.day } } });
        if (alreadySent) return { deferred: true };
        const capped = monthly >= this.config.monthlyLimit || daily >= this.config.dailyLimit || candidate.kind === 'DIGEST' &&
          (digestCount >= this.config.digestDailyLimit || daily >= Math.max(0, this.config.dailyLimit - this.config.urgentReserve));
        if (capped) return { deferred: true };
        if (!live) return { preview: true };
        const batch = candidate.batchId ? await tx.notificationEmailBatch.findUnique({ where: { id: candidate.batchId } }) : null;
        if (batch && (batch.status !== 'PENDING' || batch.nextAttemptAt > this.now() || batch.attempts >= 5)) return {};
        const entries = await tx.notificationEmail.findMany({ where: { id: { in: candidate.entries.map(e => e.id) }, status: 'PENDING', batchId: candidate.batchId ?? null,
          notification: { readAt: null } }, select: { id: true } });
        if (!entries.length) return {};
        const ids = entries.map(e => e.id);
        const saved = batch ? await tx.notificationEmailBatch.update({ where: { id: batch.id }, data: { status: 'SENDING', attempts: { increment: 1 }, claimedAt: this.now() } }) :
          await tx.notificationEmailBatch.create({ data: { userId: candidate.userId, kind: candidate.kind, status: 'SENDING', attempts: 1, claimedAt: this.now() } });
        await tx.notificationEmail.updateMany({ where: { id: { in: ids } }, data: { batchId: saved.id, status: 'SENDING', attempts: saved.attempts, claimedAt: this.now() } });
        return { batch: saved, ids };
      });
      if ('deferred' in claim) { result.deferred++; continue; }
      if (!('preview' in claim) && !('batch' in claim)) continue;
      processed++;
      const current: EmailListItem[] = [], validIds: string[] = [];
      for (const entry of candidate.entries) {
        if ('ids' in claim && claim.ids && !claim.ids.includes(entry.id)) continue;
        const item = await this.applicable(entry.item.notification.id);
        if (item && (candidate.kind === 'URGENT' ? item.notification.user.emailUrgentEnabled : item.notification.user.emailDigestEnabled)) { current.push(item); validIds.push(entry.id); }
      }
      // If the important trigger was read during claiming, do not send routine-only digests.
      if (candidate.kind === 'DIGEST' && !current.some(i => importantNotification(i.notification.kind, this.config.notificationRules))) { current.length = 0; validIds.length = 0; }
      if ('batch' in claim && claim.batch) {
        await this.db.notificationEmail.updateMany({ where: { batchId: claim.batch.id, status: 'SENDING', id: { notIn: validIds } }, data: { status: 'SKIPPED' } });
        if (!current.length) { await this.db.notificationEmailBatch.update({ where: { id: claim.batch.id }, data: { status: 'SKIPPED' } }); result.skipped++; continue; }
      } else if (!current.length) continue;
      const message = renderNotificationEmailBatch(current, this.config.origin, candidate.kind, this.now());
      const id = 'batch' in claim && claim.batch ? claim.batch.id : `${candidate.kind.toLowerCase()}-${candidate.userId}`;
      if (!live) {
        await mkdir(this.config.previewDir, { recursive: true });
        await writeFile(join(this.config.previewDir, id + '.html'), message.html, 'utf8');
        await writeFile(join(this.config.previewDir, id + '.txt'), `From: ${this.config.from}\nSubject: ${message.subject}\n\n${message.text}`, 'utf8'); result.previewed++; previewSent++; if (candidate.kind === 'DIGEST') previewDigests++; continue;
      }
      if (!('batch' in claim) || !claim.batch) continue;
      const batch = claim.batch;
      const latest = await this.applicable(current[0].notification.id);
      const recipient = latest && (candidate.kind === 'URGENT' ? latest.notification.user.emailUrgentEnabled : latest.notification.user.emailDigestEnabled) ? latest.recipient : null;
      if (!recipient) { await this.db.$transaction([this.db.notificationEmailBatch.update({ where: { id }, data: { status: 'SKIPPED' } }), this.db.notificationEmail.updateMany({ where: { batchId: id, status: 'SENDING' }, data: { status: 'SKIPPED' } })]); result.skipped++; continue; }
      try {
        const messageId = await this.sender!.send(recipient, message, id);
        await this.db.$transaction([
          this.db.notificationEmailBatch.update({ where: { id }, data: { status: 'SENT', sentAt: this.now(), recipient, providerMessageId: messageId, lastError: null } }),
          this.db.notificationEmail.updateMany({ where: { batchId: id, status: 'SENDING' }, data: { status: 'SENT', sentAt: this.now(), recipient, providerMessageId: messageId, lastError: null } })
        ]); result.sent++;
      } catch (error) {
        const type = emailFailure(error), quota = type === 'daily' || type === 'monthly';
        const retry = type === 'retry' && batch.attempts < 5;
        const status = quota || retry ? 'PENDING' : type === 'unknown' ? 'UNKNOWN' : 'FAILED';
        const w = emailQuotaWindows(this.now());
        const data = { status, recipient, lastError: `Send ${type}.`, ...(quota ? { attempts: batch.attempts - 1, nextAttemptAt: type === 'monthly' ? w.nextMonth : w.nextDay } : retry ? { nextAttemptAt: new Date(this.now().getTime() + 300000 * 2 ** (batch.attempts - 1)) } : {}) };
        await this.db.$transaction([this.db.notificationEmailBatch.update({ where: { id }, data }), this.db.notificationEmail.updateMany({ where: { batchId: id, status: 'SENDING' }, data })]);
        if (quota) { result.deferred++; break; }
        if (retry) result.retrying++; else if (type === 'unknown') result.unknown++; else result.failed++;
      }
      await this.pause(this.config.intervalMs);
    }
    return result;
  }
  async run() { return { generation: await this.generate(), delivery: await this.deliver() }; }
}
