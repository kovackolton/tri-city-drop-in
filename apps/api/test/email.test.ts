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
