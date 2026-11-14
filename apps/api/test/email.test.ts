import { notificationRulesInput } from '../src/app-settings';
import { notificationCatalog, defaultNotificationRules } from '../src/notification-catalog';
import { appSettingsInput } from '../src/app-settings';
import { pickEmailTuning, readEmailTuning } from '../src/email-settings';
import { reminderDue, gameReminderLabel } from '../src/notification-timing';
import { urgentNotification, importantNotification, digestWindow } from '../src/email-policy';
import { renderNotificationEmailBatch } from '../src/notification-email';
import { emailDiagnostic } from '../src/email-diagnostics';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { profileInput } from '../src/profile-fields';
import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emailConfig, emailFailure, emailQuotaWindows, ResendEmailSender } from '../src/email-delivery';
import { renderNotificationEmail } from '../src/notification-email';
import { notificationDescriptions } from '../src/notifications';
const env = { EMAIL_ENABLED: 'true', EMAIL_NOTIFICATIONS_START_AT: '2026-11-11T00:00:00.000Z', PUBLIC_SITE_ORIGIN: 'https://soccer.example.test' };
const event = { title: 'Friday <Soccer>\r\nBcc: nobody', startsAt: new Date('2026-12-01T00:00:00Z'), endsAt: new Date('2026-12-01T02:00:00Z'), status: 'PUBLISHED', cancellationCutoffHours: 12, priceCents: 1200, description: '<script>bad()</script>', location: { name: 'Pitch & park', address: 'Test address', timezone: 'America/New_York' } };
test('email remains disabled by default; preview requires no API key; production requires explicit safe configuration', () => {
  assert.equal(emailConfig({}), null);
  assert.equal(emailConfig(env)!.mode, 'preview');
  assert.equal(emailConfig(env)!.from, 'no_reply@contact.tricitiesdropin.com');
  assert.equal(emailConfig({ ...env, EMAIL_FROM: 'no_reply@contact.tricitiesdropin.com' })!.from, 'no_reply@contact.tricitiesdropin.com');
  assert.throws(() => emailConfig({ ...env, EMAIL_FROM: 'no_reply@tricitiesdropin.com' }));
  assert.equal(emailConfig(env)!.dailyLimit, 100);
  assert.equal(emailConfig(env)!.monthlyLimit, 3000);
  for (const bad of [{ EMAIL_NOTIFICATIONS_START_AT: '' }, { EMAIL_DELIVERY_MODE: 'ses' }, { EMAIL_DAILY_LIMIT: '101' }, { EMAIL_MONTHLY_LIMIT: '3001' }, { EMAIL_BATCH_SIZE: '0' }, { EMAIL_REPLY_TO: 'bad\r\naddress' }, { EMAIL_DELIVERY_MODE: 'resend' }]) assert.throws(() => emailConfig({ ...env, ...bad }));
  assert.throws(() => emailConfig({ ...env, EMAIL_DELIVERY_MODE: 'resend', RESEND_API_KEY: 'fake', PUBLIC_SITE_ORIGIN: 'http://soccer.test' }));
  assert.equal(emailConfig({ ...env, EMAIL_DELIVERY_MODE: 'resend', RESEND_API_KEY: 'fake' })!.mode, 'resend');
});
test('Resend request sends both bodies with stable idempotency key and no client secrets in email', async () => {
  let captured: RequestInit | undefined;
  const request = (async (url: string | URL | Request, init?: RequestInit) => { assert.equal(url, 'https://api.resend.com/emails'); captured = init; return new Response(JSON.stringify({ id: 'provider-id' }), { status: 200 }); }) as typeof fetch;
  const config = emailConfig({ ...env, RESEND_API_KEY: 'test-secret', EMAIL_REPLY_TO: 'support@example.test' })!;
  const sender = new ResendEmailSender(config, request);
  const message = renderNotificationEmail({ id: 'id', kind: 'EVENT_REMINDER', payload: { title: 'Soon' } }, event, config.origin);
  assert.equal(await sender.send('player@example.test', message, 'delivery-id'), 'provider-id');
  assert.equal((captured!.headers as Record<string,string>)['Idempotency-Key'], 'notification/delivery-id');
  const body = JSON.parse(captured!.body as string);
  assert.equal(body.from, 'no_reply@contact.tricitiesdropin.com'); assert.equal(body.reply_to, 'support@example.test');
  assert.deepEqual(body.to, ['player@example.test']); assert.equal(body.text, message.text); assert.equal(body.html, message.html);
  assert.ok(!captured!.body!.toString().includes('test-secret'));
});
test('provider quota and transient errors are classified without exposing provider text', async () => {
  for (const [name, status, expected] of [['daily_quota_exceeded', 429, 'daily'], ['monthly_quota_exceeded', 429, 'monthly'], ['rate_limit_exceeded', 429, 'retry'], ['validation_error', 403, 'failed'], ['application_error', 500, 'unknown']] as const) {
    const request = (async () => new Response(JSON.stringify({ name, message: 'secret@example.test' }), { status })) as typeof fetch;
    try { await new ResendEmailSender(emailConfig(env)!, request).send('a@example.test', { subject: 'S', text: 'T', html: 'H' }, 'id'); assert.fail(); }
    catch (error) { assert.equal(emailFailure(error), expected); assert.ok(!String(error).includes('secret@example.test')); }
  }
  assert.equal(emailFailure(new Error('network timeout')), 'unknown');
});
test('UTC quota windows handle year boundaries', () => {
  const w = emailQuotaWindows(new Date('2026-12-31T23:59:59Z'));
  assert.equal(w.day.toISOString(), '2026-12-31T00:00:00.000Z'); assert.equal(w.month.toISOString(), '2026-12-01T00:00:00.000Z');
  assert.equal(w.nextDay.toISOString(), '2027-01-01T00:00:00.000Z'); assert.equal(w.nextMonth.toISOString(), '2027-01-01T00:00:00.000Z');
});
test('every known notification preserves inbox wording and supplies notification/how-to links', () => {
  for (const [kind, text] of Object.entries(notificationDescriptions)) {
    const rendered = renderNotificationEmail({ id: 'id', kind, payload: { title: 'Inbox title' } }, event, env.PUBLIC_SITE_ORIGIN);
    assert.ok(rendered.text.includes(text), kind); assert.ok(rendered.text.includes('https://soccer.example.test/#notifications'));
    assert.ok(rendered.text.includes('/#how-to/payment-strikes')); assert.ok(!/[\r\n]/.test(rendered.subject));
    assert.ok(!rendered.html.includes('<script>')); assert.ok(rendered.html.includes('&lt;Soccer&gt;'));
  }
});
test('templates explain actual cutoff/sub liability and distinguish reports from organizer receipts', () => {
  const render = (kind: string, game = event) => renderNotificationEmail({ id: 'id', kind, payload: {} }, game, env.PUBLIC_SITE_ORIGIN).text;
  assert.match(render('EVENT_REMINDER'), /more than 12 hours/); assert.match(render('EVENT_REMINDER'), /Finding a sub does not transfer liability/);
  assert.match(render('EVENT_REMINDER', { ...event, priceCents: 0 }), /Free seats never receive payment strikes/);
  assert.match(render('PAYMENT_REVIEW_REMINDER'), /Your I paid report does not confirm organizer receipt/);
  assert.match(render('PAYMENT_REVIEW_REMINDER'), /Unreviewed seats do not count/);
  assert.match(render('EVENT_CANCELLED'), /Released cancelled seats do not require payment/);
  assert.doesNotMatch(render('EVENT_CANCELLED'), /Cancel more than/);
  assert.match(render('ORGANIZER_REVIEW_REMINDER'), /administrator-only/);
});

test('email preference accepts only explicit booleans and preserves omission', () => {
  assert.equal(profileInput({ emailNotificationsEnabled: false }).emailNotificationsEnabled, false);
  assert.equal(profileInput({ emailNotificationsEnabled: true }).emailNotificationsEnabled, true);
  assert.equal(profileInput({ nickname: 'Player' }).emailNotificationsEnabled, undefined);
  for (const value of ['false', 0, null]) assert.throws(() => profileInput({ emailNotificationsEnabled: value }));
});

test('production preview uses writable temporary storage while local previews keep the local folder', () => {
  assert.equal(emailConfig({ ...env, NODE_ENV: 'production' })!.previewDir, join(tmpdir(), 'tricity-email-previews'));
  assert.ok(emailConfig(env)!.previewDir.endsWith('email-previews'));
});
test('worker diagnostics identify permission, database and configuration failures without logging raw errors', () => {
  assert.match(emailDiagnostic('preview-rendering', { code: 'EACCES', message: 'secret-path' }).hint, /EMAIL_PREVIEW_DIR=/);
  assert.match(emailDiagnostic('database-connect', { errorCode: 'P1001', message: 'postgresql://password' }).hint, /unreachable/);
  assert.match(emailDiagnostic('notification-generation', { code: 'P2021' }).hint, /migration/);
  assert.equal(emailDiagnostic('configuration', new Error('EMAIL_FROM must be no_reply@contact.tricitiesdropin.com.')).hint, 'EMAIL_FROM must be no_reply@contact.tricitiesdropin.com.');
  for (const error of [{ code: 'private-code', message: 'password recipient@example.test', stack: 'secret' }, new Error('postgresql://password')]) {
    const result = JSON.stringify(emailDiagnostic('configuration', error));
    assert.ok(!result.includes('password')); assert.ok(!result.includes('recipient@example.test')); assert.ok(!result.includes('private-code'));
  }
});

test('tomorrow spans the full local calendar day, including DST, and delayed text changes to today', () => {
  const zone = 'America/New_York', now = new Date('2027-03-13T05:00:00Z'), starts = new Date('2027-03-15T03:00:00Z');
  assert.ok(starts.getTime() - now.getTime() > 24 * 3600000);
  assert.equal(reminderDue(starts, zone, now), true);
  assert.equal(gameReminderLabel(starts, zone, now), 'You have a game tomorrow');
  assert.equal(gameReminderLabel(starts, zone, new Date('2027-03-14T22:00:00Z')), 'Your game is today');
  assert.equal(reminderDue(starts, zone, starts), false);
  assert.equal(reminderDue(new Date('2027-03-15T04:00:00Z'), zone, now), false);
  assert.match(gameReminderLabel(starts, zone, new Date('2027-03-11T12:00:00Z')), /upcoming game is on Sunday/);
  // The fall-back day is 25 hours long; its late evening is still part of tomorrow.
  assert.equal(reminderDue(new Date('2027-11-08T04:30:00Z'), zone, new Date('2027-11-06T04:00:00Z')), true);
});
test('email lists precede the action, which precedes payment/cancellation guidance; queued reminders render at send time', () => {
  const game = { ...event, title: 'Evening soccer', startsAt: new Date('2027-03-15T03:00:00Z'), endsAt: new Date('2027-03-15T04:00:00Z') };
  const item = { notification: { id: 'reminder', kind: 'EVENT_REMINDER', payload: {} }, event: game };
  const tomorrow = renderNotificationEmailBatch([item], env.PUBLIC_SITE_ORIGIN, 'DIGEST', new Date('2027-03-13T12:00:00Z'));
  const today = renderNotificationEmailBatch([item], env.PUBLIC_SITE_ORIGIN, 'DIGEST', new Date('2027-03-14T12:00:00Z'));
  assert.match(tomorrow.subject, /tomorrow/); assert.match(today.subject, /today/); assert.doesNotMatch(today.text, /tomorrow|within 24 hours/);
  assert.ok(today.html.indexOf('</ul>') < today.html.indexOf('>Open Notifications</a>'));
  assert.ok(today.html.indexOf('>Open Notifications</a>') < today.html.indexOf('Cancellation cutoff and subs'));
  assert.match(today.text, /Sunday, March 14, 2027/); assert.match(today.text, /America\/New_York/);
  const combined = renderNotificationEmailBatch([item, { ...item, notification: { id: 'second', kind: 'EVENT_CHANGED', payload: {} } }], env.PUBLIC_SITE_ORIGIN, 'DIGEST');
  assert.equal((combined.html.match(/<li /g) ?? []).length, 2);
  assert.equal((combined.text.match(/Cancellation cutoff and subs/g) ?? []).length, 1);
});
test('urgent policy covers promotions, cancellations and only last-minute time/location changes', () => {
  const now = new Date('2026-11-14T12:00:00Z'), game = { ...event, startsAt: new Date('2026-11-15T10:00:00Z') };
  const n = (kind: string, payload = {}) => ({ id: 'id', kind, payload });
  assert.equal(urgentNotification(n('WAITLIST_PROMOTED'), game, now), true);
  assert.equal(urgentNotification(n('EVENT_CANCELLED'), null, now), true);
  assert.equal(urgentNotification(n('EVENT_CHANGED', { timeOrLocationChanged: true }), game, now), true);
  assert.equal(urgentNotification(n('EVENT_CHANGED'), game, now), false);
  assert.equal(urgentNotification(n('EVENT_CHANGED', { timeOrLocationChanged: true }), event, now), false);
  assert.equal(urgentNotification(n('EVENT_CHANGED', { timeOrLocationChanged: true, previousStartsAt: '2026-11-14T18:00:00Z' }), event, now), true);
  assert.equal(importantNotification('STRIKE_CLEARED'), false); assert.equal(importantNotification('PAYMENT_REVIEW_REMINDER'), true);
  assert.equal(digestWindow(new Date('2026-11-14T22:59:59Z'), 23), false); assert.equal(digestWindow(new Date('2026-11-14T23:00:00Z'), 23), true);
});
test('digest thresholds are configurable, bounded and accept zero where appropriate', () => {
  const c = emailConfig(env)!;
  assert.equal(c.digestStartHour, 23); assert.equal(c.digestDailyLimit, 80); assert.equal(c.urgentReserve, 5);
  const zero = emailConfig({ ...env, EMAIL_DIGEST_START_HOUR_UTC: '0', EMAIL_DIGEST_DAILY_LIMIT: '0', EMAIL_URGENT_RESERVE: '0' })!;
  assert.equal(zero.digestDailyLimit, 0);
  for (const bad of [{ EMAIL_DIGEST_START_HOUR_UTC: '24' }, { EMAIL_DIGEST_DAILY_LIMIT: '101' }, { EMAIL_URGENT_RESERVE: '-1' }]) assert.throws(() => emailConfig({ ...env, ...bad }));
});
test('independent email preferences validate booleans and legacy preferences map to both options', () => {
  assert.equal(profileInput({ emailDigestEnabled: true, emailUrgentEnabled: false }).emailUrgentEnabled, false);
  assert.equal(profileInput({ emailNotificationsEnabled: false }).emailDigestEnabled, false);
  for (const field of ['emailDigestEnabled', 'emailUrgentEnabled']) assert.throws(() => profileInput({ [field]: 'false' }));
});

test('app settings enforce integer ranges, complete values, concurrency revision and reject infrastructure/secrets', () => {
  const values = readEmailTuning({}); assert.equal(appSettingsInput({ revision: 0, values }).values.digestStartHour, 23);
  for (const bad of [{ revision: -1, values }, { revision: 1.5, values }, { revision: 0, values: {} },
    { revision: 0, values: { ...values, dailyLimit: 101 } }, { revision: 0, values: { ...values, digestStartHour: 24 } },
    { revision: 0, values: { ...values, intervalMs: 1.5 } }, { revision: 0, values: { ...values, urgentReserve: '5' } },
    { revision: 0, values, RESEND_API_KEY: 'bad' }, { revision: 0, values: { ...values, enabled: true } }]) assert.throws(() => appSettingsInput(bad));
  assert.deepEqual(pickEmailTuning({ ...values, apiKey: 'secret' } as any), values);
});

test('notification catalog covers every inbox kind and rule overrides control urgent/important tiers', () => {
  assert.deepEqual(notificationCatalog.map(n => n.kind).sort(), Object.keys(notificationDescriptions).sort());
  assert.ok(notificationCatalog.every(n => n.message && n.trigger && n.audience));
  const rules = defaultNotificationRules();
  assert.equal(notificationRulesInput({ revision: 0, rules }).rules.EVENT_CHANGED, 'TIME_SENSITIVE');
  const custom = { ...rules, STRIKE_CLEARED: 'URGENT', EVENT_CANCELLED: 'ROUTINE' } as any;
  assert.equal(urgentNotification({ id: 'n', kind: 'STRIKE_CLEARED', payload: {} }, null, new Date(), custom), true);
  assert.equal(importantNotification('EVENT_CANCELLED', custom), false);
  for (const invalid of [{ ...rules, STRIKE_CLEARED: 'TIME_SENSITIVE' }, { ...rules, EVENT_REMINDER: 'BAD' }, { ...rules, UNKNOWN: 'URGENT' }, {}]) assert.throws(() => notificationRulesInput({ revision: 0, rules: invalid }));
});
