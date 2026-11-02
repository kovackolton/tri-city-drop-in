import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { Database } from '../src/database';
import { SignupsService } from '../src/signups';
import { PaymentsService } from '../src/payments';
import { OrganizerService } from '../src/organizer';
import { LocationsService } from '../src/locations';
import { AdministrationService } from '../src/administration';

test('signup transactions against isolated PostgreSQL schema', { timeout: 120000 }, async t => {
  assert.ok(process.env.DATABASE_URL, 'Run with the API .env loaded.');
  const schema = `signup_test_${randomUUID().replaceAll('-', '')}`;
  const url = new URL(process.env.DATABASE_URL!);
  url.searchParams.set('schema', schema);
  url.searchParams.set('connection_limit', '12');
  const admin = new PrismaClient();
  const db = new Database({ datasourceUrl: url.toString() });
  const service = new SignupsService(db);
  const payments = new PaymentsService(db);
  const organizer = new OrganizerService(db);
  const locations = new LocationsService(db);
  const administration = new AdministrationService(db, service);
  try {
    // All tables and fixtures live in this new schema, never the application's public tables.
    execFileSync(process.execPath, [resolve('../../node_modules/prisma/build/index.js'), 'migrate', 'deploy'], {
      cwd: process.cwd(), env: { ...process.env, DATABASE_URL: url.toString() }, stdio: 'pipe'
    });
    const users = await Promise.all(Array.from({ length: 24 }, (_, i) => db.user.create({ data: { firebaseUid: `test-${i}`, email: `test${i}@example.invalid`, displayName: `Player ${i}`, role: i === 0 ? 'ORGANIZER' : 'PLAYER' } })));
    const location = await db.location.create({ data: { name: 'Test pitch', address: 'Test only', timezone: 'America/New_York' } });
    const event = (capacity: number, priceCents = 1000) => db.event.create({ data: { title: 'Test game', organizerId: users[0].id, locationId: location.id, capacity, priceCents, maxGuestsPerUser: Math.min(3, capacity - 1), status: 'PUBLISHED', startsAt: new Date(Date.now() + 86400000), endsAt: new Date(Date.now() + 90000000) } });
    const join = (user: number, eventId: string, guests: string[] = [], expectedPriceCents = 1000) => service.join(users[user].id, eventId, { guests, expectedPriceCents });

    await t.test('simultaneous players cannot oversubscribe the last seats', async () => {
      const e = await event(4);
      const result = await Promise.all(Array.from({ length: 10 }, (_, i) => join(i + 1, e.id)));
      assert.equal(result.filter(s => s[0].status === 'CONFIRMED').length, 4);
      assert.equal(await db.signup.count({ where: { eventId: e.id, status: 'CONFIRMED' } }), 4);
      assert.equal(await db.signup.count({ where: { eventId: e.id, status: 'WAITLISTED' } }), 6);
      assert.equal(await db.paymentObligation.count({ where: { signup: { eventId: e.id } } }), 4);
    });
    await t.test('duplicate simultaneous requests reuse one booking; changed parties conflict', async () => {
      const e = await event(5);
      const [a, b] = await Promise.all([join(1, e.id, ['Guest']), join(1, e.id, ['Guest'])]);
      assert.equal(a[0].bookingId, b[0].bookingId);
      assert.equal(await db.signup.count({ where: { eventId: e.id } }), 2);
      await assert.rejects(join(1, e.id, ['Someone else']), /already have a booking/);
    });
    await t.test('FIFO parties remain together, promotion honors accepted quote and queues one notification', async () => {
      const e = await event(3);
      const a = await join(1, e.id, ['Guest']);
      const b = await join(2, e.id, ['Waiting guest']);
      const c = await join(3, e.id);
      assert.equal(b[0].status, 'WAITLISTED'); assert.equal(c[0].status, 'WAITLISTED');
      assert.equal(await db.paymentObligation.count({ where: { signup: { bookingId: b[0].bookingId } } }), 0);
      await db.event.update({ where: { id: e.id }, data: { priceCents: 2000 } });
      await service.cancel(users[1].id, e.id, a[0].bookingId);
      const promoted = await db.signup.findMany({ where: { bookingId: b[0].bookingId }, include: { payment: true } });
      assert.ok(promoted.every(s => s.status === 'CONFIRMED' && s.payment?.amountCents === 1000));
      assert.equal((await db.signup.findUniqueOrThrow({ where: { id: c[0].id } })).status, 'CONFIRMED');
      assert.equal(await db.notification.count({ where: { dedupeKey: `promotion:${b[0].bookingId}` } }), 1);
      await service.cancel(users[1].id, e.id, a[0].bookingId);
      assert.equal(await db.notification.count({ where: { dedupeKey: `promotion:${b[0].bookingId}` } }), 1);
      assert.equal(await db.paymentObligation.count({ where: { signup: { bookingId: a[0].bookingId }, status: 'VOID' } }), 2);
    });
    await t.test('concurrent cancellations promote only available seats', async () => {
      const e = await event(2);
      const a = await join(1, e.id), b = await join(2, e.id);
      await join(3, e.id); await join(4, e.id); await join(5, e.id);
      await Promise.all([service.cancel(users[1].id, e.id, a[0].bookingId), service.cancel(users[2].id, e.id, b[0].bookingId)]);
      assert.equal(await db.signup.count({ where: { eventId: e.id, status: 'CONFIRMED' } }), 2);
      assert.equal(await db.signup.count({ where: { eventId: e.id, status: 'WAITLISTED' } }), 1);
    });
    await t.test('cancellation retains history; stale cancellation cannot remove a later rejoin', async () => {
      const e = await event(2);
      const a = await join(1, e.id);
      await assert.rejects(service.cancel(users[2].id, e.id, a[0].bookingId), /Booking not found/);
      await service.cancel(users[1].id, e.id, a[0].bookingId);
      const b = await join(1, e.id);
      assert.notEqual(a[0].bookingId, b[0].bookingId);
      await service.cancel(users[1].id, e.id, a[0].bookingId);
      assert.equal((await db.signup.findUniqueOrThrow({ where: { id: b[0].id } })).status, 'CONFIRMED');
      assert.equal(await db.signup.count({ where: { eventId: e.id, userId: users[1].id } }), 2);
    });
    await t.test('cancelling the head waitlist party allows the next fitting party to move up', async () => {
      const e = await event(3);
      await join(1, e.id, ['Guest']);
      const head = await join(2, e.id, ['Head guest']);
      const tail = await join(3, e.id);
      await service.cancel(users[2].id, e.id, head[0].bookingId);
      assert.equal((await db.signup.findUniqueOrThrow({ where: { id: tail[0].id } })).status, 'CONFIRMED');
    });
    await t.test('free seats have no debt, stale prices/guest overflow are rejected', async () => {
      const e = await event(2, 0);
      await assert.rejects(join(1, e.id), /price changed/);
      await assert.rejects(join(1, e.id, ['A', 'B'], 0), /exceeds/);
      const a = await join(1, e.id, [], 0);
      const payment = await db.paymentObligation.findUniqueOrThrow({ where: { signupId: a[0].id } });
      assert.equal(payment.amountCents, 0); assert.equal(payment.status, 'NOT_REQUIRED');
    });
    await t.test('booking history returns whole parties with payment details', async () => {
      const e = await event(3);
      const seats = await join(15, e.id, ['Guest']);
      const mine = (await service.mine(users[15].id)).filter(s => s.eventId === e.id);
      assert.equal(mine.length, 2);
      assert.ok(mine.every(s => s.bookingId === seats[0].bookingId && s.payment?.amountCents === 1000));
      assert.ok((await service.mine(users[16].id)).every(s => s.userId === users[16].id));
      const roster = await service.roster(users[0].id, e.id);
      assert.equal(roster.length, 2);
      assert.equal('email' in roster[0].user, false);
    });
    await t.test('joined players see confirmed/waitlisted players and guests without private details', async () => {
      const e = await event(2);
      const a = await join(21, e.id, ['Named guest']);
      await join(22, e.id);
      const players = await service.participants(users[21].id, e.id);
      assert.equal(players.length, 3);
      assert.ok(players.some(p => p.name === 'Named guest' && p.isGuest));
      assert.equal(players.filter(p => p.status === 'WAITLISTED').length, 1);
      assert.deepEqual(Object.keys(players[0]).sort(), ['id', 'isGuest', 'name', 'status']);
      assert.equal((await service.participants(users[22].id, e.id)).length, 3);
      await assert.rejects(service.participants(users[23].id, e.id), /Join this game/);
      const mine = await service.mine(users[21].id);
      assert.equal(mine.find(s => s.eventId === e.id)?.event.organizer.displayName, users[0].displayName);
      await service.cancel(users[21].id, e.id, a[0].bookingId);
      await assert.rejects(service.participants(users[21].id, e.id), /Join this game/);
      assert.equal((await service.participants(users[22].id, e.id)).length, 1);
      await db.event.update({ where: { id: e.id }, data: { status: 'COMPLETED' } });
      assert.equal((await service.participants(users[22].id, e.id)).length, 1);
    });
    await t.test('payment review is independent, post-event, authorized and auditable', async () => {
      const e = await event(3);
      const seats = await join(17, e.id, ['Guest']);
      await assert.rejects(payments.review(users[17].id, seats[0].id, 'player', { paid: true }), /after the event ends/);
      await db.event.update({ where: { id: e.id }, data: { startsAt: new Date(Date.now() - 7200000), endsAt: new Date(Date.now() - 3600000) } });
      await assert.rejects(payments.review(users[18].id, seats[0].id, 'player', { paid: true }), /not found/);
      await assert.rejects(payments.review(users[18].id, seats[0].id, 'organizer', { paid: true }), /not found/);
      await Promise.all([
        payments.review(users[17].id, seats[0].id, 'player', { paid: true }),
        payments.review(users[0].id, seats[0].id, 'organizer', { paid: false })
      ]);
      const disputed = await db.paymentObligation.findUniqueOrThrow({ where: { signupId: seats[0].id } });
      assert.equal(disputed.playerPaid, true); assert.equal(disputed.organizerPaid, false);
      assert.ok(disputed.playerReviewedAt); assert.ok(disputed.organizerReviewedAt);
      assert.equal(disputed.status, 'UNPAID');
      assert.equal(await db.strike.count(), 0);
      await payments.review(users[0].id, seats[0].id, 'organizer', { paid: true });
      const settled = await db.paymentObligation.findUniqueOrThrow({ where: { signupId: seats[0].id } });
      assert.equal(settled.status, 'PAID'); assert.equal(settled.playerPaid, true);
      assert.equal(settled.organizerReviewedById, users[0].id);
      const count = await db.auditLog.count({ where: { eventId: e.id } });
      const retry = await payments.review(users[0].id, seats[0].id, 'organizer', { paid: true });
      assert.equal(retry.organizerReviewedAt?.getTime(), settled.organizerReviewedAt?.getTime());
      assert.equal(await db.auditLog.count({ where: { eventId: e.id } }), count);
      const guest = await payments.review(users[17].id, seats[1].id, 'player', { paid: false });
      assert.equal(guest.playerPaid, false); assert.equal(guest.organizerPaid, null);
      const roster = await service.roster(users[0].id, e.id);
      assert.equal(roster.find(s => s.id === seats[0].id)?.payment?.organizerPaid, true);
    });
    await t.test('free and cancelled seats cannot be payment-reviewed', async () => {
      const freeEvent = await event(2, 0);
      const free = await join(19, freeEvent.id, [], 0);
      const cancelledEvent = await event(2);
      const cancelled = await join(20, cancelledEvent.id);
      await service.cancel(users[20].id, cancelledEvent.id, cancelled[0].bookingId);
      for (const e of [freeEvent, cancelledEvent]) await db.event.update({ where: { id: e.id }, data: { startsAt: new Date(Date.now() - 7200000), endsAt: new Date(Date.now() - 3600000) } });
      await assert.rejects(payments.review(users[19].id, free[0].id, 'player', { paid: true }), /does not require/);
      await assert.rejects(payments.review(users[20].id, cancelled[0].id, 'player', { paid: true }), /Only confirmed/);
    });
    await t.test('late cancellations are recorded without automatic strikes', async () => {
      const e = await event(2);
      await db.event.update({ where: { id: e.id }, data: { cancellationCutoffHours: 48 } });
      const a = await join(1, e.id);
      const result = await service.cancel(users[1].id, e.id, a[0].bookingId);
      assert.equal(result.lateCancellation, true);
      assert.equal(await db.strike.count(), 0);
    });
    await t.test('draft/past events and unauthorized roster reads are rejected', async () => {
      const e = await event(2);
      await assert.rejects(service.roster(users[1].id, e.id), /Event not found/);
      await db.event.update({ where: { id: e.id }, data: { status: 'DRAFT' } });
      await assert.rejects(join(1, e.id), /future published/);
      await db.event.update({ where: { id: e.id }, data: { status: 'PUBLISHED', startsAt: new Date(Date.now() - 1000) } });
      await assert.rejects(join(1, e.id), /future published/);
    });
    await t.test('organizer roster overrides preserve capacity, party integrity and audit history', async () => {
      const e = await event(3);
      const a = await join(1, e.id, ['A guest']);
      const b = await join(2, e.id, ['B guest']);
      const c = await join(3, e.id);
      await assert.rejects(service.overridePromotion(users[1].id, e.id, c[0].bookingId, 'Unauthorized'), /not found/);
      await assert.rejects(service.overridePromotion(users[0].id, e.id, b[0].bookingId, 'Does not fit'), /capacity/);
      await service.overridePromotion(users[0].id, e.id, c[0].bookingId, 'Approved small-party exception');
      await service.overridePromotion(users[0].id, e.id, c[0].bookingId, 'Retry');
      assert.equal(await db.signup.count({ where: { eventId: e.id, status: 'CONFIRMED' } }), 3);
      await assert.rejects(service.cancel(users[1].id, e.id, a[0].bookingId, 'Unauthorized removal'), /not found/);
      await service.cancel(users[0].id, e.id, a[0].bookingId, 'Organizer correction');
      const removed = await db.signup.findMany({ where: { bookingId: a[0].bookingId } });
      assert.ok(removed.every(s => s.status === 'CANCELLED' && !s.lateCancellation));
      assert.equal(await db.signup.count({ where: { bookingId: b[0].bookingId, status: 'CONFIRMED' } }), 2);
      assert.equal(await db.signup.count({ where: { eventId: e.id, status: 'CONFIRMED' } }), 3);
      const history = await organizer.audit(users[0].id, e.id);
      assert.equal(history.filter(h => h.action === 'ORGANIZER_PROMOTED_PARTY').length, 1);
      assert.ok(history.some(h => h.action === 'ORGANIZER_REMOVED_PARTY'));
      await assert.rejects(organizer.audit(users[1].id, e.id), /not found/);
    });
    await t.test('attendance and no-show strikes require ownership, event timing and audited revocation', async () => {
      const e = await event(2), seats = await join(4, e.id);
      const id = seats[0].id;
      await assert.rejects(organizer.attendance(users[0].id, id, { attendance: 'PRESENT' }), /opens at event start/);
      await assert.rejects(organizer.attendance(users[1].id, id, { attendance: 'PRESENT' }), /not found/);
      await db.event.update({ where: { id: e.id }, data: { startsAt: new Date(Date.now() - 7200000) } });
      await organizer.attendance(users[0].id, id, { attendance: 'PRESENT' });
      await assert.rejects(organizer.attendance(users[0].id, id, { attendance: 'ABSENT' }), /after the event ends/);
      await db.event.update({ where: { id: e.id }, data: { endsAt: new Date(Date.now() - 3600000) } });
      await assert.rejects(organizer.issue(users[0].id, id, { reason: 'NO_SHOW', note: 'Checked roster' }), /absent/);
      await organizer.attendance(users[0].id, id, { attendance: 'ABSENT' });
      const [a, b] = await Promise.all([organizer.issue(users[0].id, id, { reason: 'NO_SHOW', note: 'Checked roster' }), organizer.issue(users[0].id, id, { reason: 'NO_SHOW', note: 'Retry' })]);
      assert.equal(a.id, b.id);
      await assert.rejects(organizer.attendance(users[0].id, id, { attendance: 'EXCUSED' }), /Revoke/);
      await assert.rejects(organizer.revoke(users[1].id, id, a.id, { note: 'Unauthorized' }), /not found/);
      await organizer.revoke(users[0].id, id, a.id, { note: 'Player had an approved absence' });
      await organizer.attendance(users[0].id, id, { attendance: 'EXCUSED' });
      const mine = (await service.mine(users[4].id)).find(s => s.id === id)!;
      assert.equal(mine.attendance, 'EXCUSED'); assert.ok(mine.strikes[0].revokedAt);
    });
    await t.test('missed-payment strike requires matching unpaid reviews and is revoked by correction', async () => {
      const e = await event(2), seats = await join(5, e.id), id = seats[0].id;
      await db.event.update({ where: { id: e.id }, data: { startsAt: new Date(Date.now() - 7200000), endsAt: new Date(Date.now() - 3600000) } });
      const input = { reason: 'MISSED_PAYMENT', note: 'Both sides reviewed the balance' };
      await assert.rejects(organizer.issue(users[0].id, id, input), /Both payment reviews/);
      await payments.review(users[5].id, id, 'player', { paid: true });
      await payments.review(users[0].id, id, 'organizer', { paid: false });
      await assert.rejects(organizer.issue(users[0].id, id, input), /Both payment reviews/);
      await payments.review(users[5].id, id, 'player', { paid: false });
      const strike = await organizer.issue(users[0].id, id, input);
      assert.equal(strike.userId, users[5].id);
      await payments.review(users[0].id, id, 'organizer', { paid: true });
      assert.ok((await db.strike.findUniqueOrThrow({ where: { id: strike.id } })).revokedAt);
      assert.ok((await organizer.audit(users[0].id, e.id)).some(a => a.action === 'STRIKE_REVOKED'));
    });
    await t.test('late-cancellation review includes cancelled seats and never penalizes organizer removal', async () => {
      const e = await event(2);
      await db.event.update({ where: { id: e.id }, data: { cancellationCutoffHours: 48 } });
      const a = await join(6, e.id), b = await join(7, e.id);
      await service.cancel(users[6].id, e.id, a[0].bookingId);
      await service.cancel(users[0].id, e.id, b[0].bookingId, 'Organizer removed booking');
      await db.event.update({ where: { id: e.id }, data: { startsAt: new Date(Date.now() - 7200000), endsAt: new Date(Date.now() - 3600000) } });
      const strike = await organizer.issue(users[0].id, a[0].id, { reason: 'LATE_CANCELLATION', note: 'Reviewed cutoff' });
      assert.equal(strike.reason, 'LATE_CANCELLATION');
      await assert.rejects(organizer.issue(users[0].id, b[0].id, { reason: 'LATE_CANCELLATION', note: 'Not eligible' }), /not a late/);
      const roster = await service.roster(users[0].id, e.id);
      assert.equal(roster.length, 2); assert.ok(roster.some(s => s.strikes.some(x => x.id === strike.id)));
    });
    await t.test('duplicate locations are detected and database uniqueness wins concurrent saves', async () => {
      const input = { name: 'New   Pitch', address: '42 Main   Street', timezone: 'America/New_York' };
      const [a, b] = await Promise.allSettled([locations.save(input), locations.save(input)]);
      assert.equal([a, b].filter(r => r.status === 'fulfilled').length, 1);
      const check = await locations.check({ ...input, name: ' new pitch ', address: '42 MAIN STREET' });
      assert.ok(check.duplicate);
      await assert.rejects(locations.save({ ...input, name: 'NEW PITCH' }), /already exists/);
      await assert.rejects(locations.remove(location.id), /used by events/);
      const updated = await locations.save({ ...input, name: 'Renamed pitch' }, check.duplicate!.id);
      assert.equal(updated.name, 'Renamed pitch');
      await locations.remove(updated.id);
    });
    await t.test('administrator editing preserves quotes and capacity, promotes queue, deletion preserves history', async () => {
      const e = await event(2);
      const a = await join(1, e.id, ['Guest']);
      const b = await join(2, e.id);
      await assert.rejects(administration.edit(users[0].id, e.id, { capacity: 1, maxGuestsPerUser: 0 }), /confirmed seats/);
      await administration.edit(users[0].id, e.id, { title: 'Updated title', capacity: 3, priceCents: 2000 });
      assert.equal((await db.signup.findUniqueOrThrow({ where: { id: b[0].id } })).status, 'CONFIRMED');
      assert.equal((await db.paymentObligation.findUniqueOrThrow({ where: { signupId: b[0].id } })).amountCents, 1000);
      assert.equal((await service.roster(users[1].id, e.id, true)).length, 3);
      await administration.remove(users[0].id, e.id);
      await administration.remove(users[0].id, e.id);
      assert.ok((await db.event.findUniqueOrThrow({ where: { id: e.id } })).deletedAt);
      assert.equal(await db.signup.count({ where: { eventId: e.id, status: 'CANCELLED' } }), 3);
      assert.equal(await db.paymentObligation.count({ where: { signup: { eventId: e.id }, status: 'VOID' } }), 3);
      assert.equal(await db.auditLog.count({ where: { eventId: e.id, action: 'ADMIN_EVENT_DELETED' } }), 1);
      await assert.rejects(join(3, e.id), /future published/);
      assert.equal((await service.mine(users[1].id)).filter(s => s.bookingId === a[0].bookingId).length, 2);
    });
  } finally {
    await db.$disconnect();
    // schema is generated here with a strict prefix; never drop public or a caller-provided schema.
    assert.match(schema, /^signup_test_[a-f0-9]{32}$/);
    await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.$disconnect();
  }
});
