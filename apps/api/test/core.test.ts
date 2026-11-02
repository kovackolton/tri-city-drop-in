import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ExecutionContext, ForbiddenException, UnauthorizedException, ServiceUnavailableException } from '@nestjs/common';
import { User } from '@prisma/client';
import { AdministratorGuard, AuthRequest, FirebaseGuard, OrganizerGuard, TokenVerifier, tokenFailure } from '../src/auth';
import { Database } from '../src/database';
import { eventInput, EventsController } from '../src/events';
import { ProfilesController } from '../src/profiles';
import { signupInput } from '../src/signups';
import { paymentReviewInput } from '../src/payments';
import { strikeInput } from '../src/organizer';

function context(req: Partial<AuthRequest>) { return { switchToHttp: () => ({ getRequest: () => req }) } as ExecutionContext; }
const player = { id: 'a', firebaseUid: 'firebase-a', role: 'PLAYER', displayName: 'Player', email: 'a@example.com' } as User;
const organizer = { ...player, role: 'ORGANIZER' } as User;
test('administrator inherits organizer access; ordinary roles cannot use administrator guard', () => {
  const administrator = { ...player, role: 'ADMINISTRATOR' } as User;
  assert.equal(new OrganizerGuard().canActivate(context({ user: administrator })), true);
  assert.equal(new AdministratorGuard().canActivate(context({ user: administrator })), true);
  for (const user of [player, organizer]) assert.throws(() => new AdministratorGuard().canActivate(context({ user })), ForbiddenException);
});
const valid = () => ({ title: 'Evening soccer', locationId: '12345678-1234-1234-1234-123456789012', startsAt: new Date(Date.now() + 86400000).toISOString(), endsAt: new Date(Date.now() + 90000000).toISOString(), capacity: 20, priceCents: 1250, status: 'DRAFT' });

test('strike review requires a supported reason and note without injected user identity', () => {
  assert.equal(strikeInput({ reason: 'NO_SHOW', note: ' Reviewed ' }).note, 'Reviewed');
  for (const value of [{ reason: 'OTHER', note: 'Review' }, { reason: 'NO_SHOW', note: '' }, { reason: 'NO_SHOW', note: 'Review', userId: 'other' }]) assert.throws(() => strikeInput(value));
});

test('payment reviews require an explicit boolean and cannot inject the other review', () => {
  assert.equal(paymentReviewInput({ paid: false }), false);
  assert.equal(paymentReviewInput({ paid: true }), true);
  for (const input of [{}, { paid: 'true' }, { paid: null }, { paid: true, organizerPaid: true }]) assert.throws(() => paymentReviewInput(input));
});

test('signup input accepts named guests, rejects ownership injection and invalid prices/names', () => {
  assert.deepEqual(signupInput({ guests: [' Guest '], expectedPriceCents: 0 }), { guests: ['Guest'], price: 0 });
  for (const value of [
    { guests: [''], expectedPriceCents: 100 },
    { guests: [], expectedPriceCents: -1 },
    { guests: [], expectedPriceCents: 1.5 },
    { guests: [], expectedPriceCents: 0, userId: 'someone-else' },
    { guests: Array(21).fill('Guest'), expectedPriceCents: 0 }
  ]) assert.throws(() => signupInput(value));
});

test('invalid sessions return 401 while infrastructure/config failures return 503', () => {
  assert.ok(tokenFailure({ code: 'auth/id-token-expired' }) instanceof UnauthorizedException);
  assert.ok(tokenFailure({ code: 'auth/id-token-revoked' }) instanceof UnauthorizedException);
  assert.ok(tokenFailure({ code: 'app/invalid-credential' }) instanceof ServiceUnavailableException);
  assert.ok(tokenFailure({ code: 'auth/insufficient-permission' }) instanceof ServiceUnavailableException);
});

test('prices accept free/paid cents, reject negatives, fractions, overflow and role injection', () => {
  assert.equal(eventInput({ ...valid(), priceCents: 0 }).priceCents, 0);
  assert.equal(eventInput(valid()).priceCents, 1250);
  for (const priceCents of [-1, 1.5, 2147483648, '12.50', null]) assert.throws(() => eventInput({ ...valid(), priceCents }));
  assert.throws(() => eventInput({ ...valid(), organizerId: 'another-user' }));
});
test('event validation rejects bad time ranges, missing timezone and guest overflow', () => {
  assert.throws(() => eventInput({ ...valid(), endsAt: new Date().toISOString() }));
  assert.throws(() => eventInput({ ...valid(), startsAt: '2027-01-01T12:00' }));
  assert.throws(() => eventInput({ ...valid(), capacity: 1, maxGuestsPerUser: 1 }));
});
test('organizer role is required server-side', () => {
  const guard = new OrganizerGuard();
  assert.throws(() => guard.canActivate(context({ user: player })), ForbiddenException);
  assert.equal(guard.canActivate(context({ user: organizer })), true);
});
test('missing bearer token is rejected before verification', async () => {
  const guard = new FirebaseGuard({ verify: async () => { throw new Error('must not be called'); } } as unknown as TokenVerifier, {} as Database);
  await assert.rejects(guard.canActivate(context({ headers: {} })), UnauthorizedException);
});
test('invalid tokens cannot reach the database', async () => {
  const guard = new FirebaseGuard({ verify: async () => { throw new UnauthorizedException(); } } as unknown as TokenVerifier, {} as Database);
  await assert.rejects(guard.canActivate(context({ headers: { authorization: 'Bearer invalid' } })), UnauthorizedException);
});
test('verified Firebase UID resolves an existing database role', async () => {
  let lookup: unknown;
  const db = { user: { findUnique: async (query: unknown) => { lookup = query; return organizer; } } } as unknown as Database;
  const guard = new FirebaseGuard({ verify: async () => ({ uid: player.firebaseUid }) } as unknown as TokenVerifier, db);
  const req = { headers: { authorization: 'Bearer verified' } } as AuthRequest;
  await guard.canActivate(context(req));
  assert.deepEqual(lookup, { where: { firebaseUid: player.firebaseUid } });
  assert.equal(req.user.role, 'ORGANIZER');
});
test('new unverified accounts cannot create a profile', async () => {
  const guard = new FirebaseGuard({ verify: async () => ({ uid: 'new', email: 'a@example.com', email_verified: false }) } as unknown as TokenVerifier,
    { user: { findUnique: async () => null } } as unknown as Database);
  await assert.rejects(guard.canActivate(context({ headers: { authorization: 'Bearer token' } })), ForbiddenException);
});
test('new verified profiles are created without client-controlled roles', async () => {
  let input: any;
  const guard = new FirebaseGuard({ verify: async () => ({ uid: 'new', email: 'A@example.com', email_verified: true }) } as unknown as TokenVerifier,
    { user: { findUnique: async () => null, upsert: async (value: unknown) => { input = value; return player; } } } as unknown as Database);
  await guard.canActivate(context({ headers: { authorization: 'Bearer token' } }));
  assert.equal(input.create.email, 'a@example.com');
  assert.equal(input.create.role, undefined);
});
test('profile updates cannot escalate role', async () => {
  const controller = new ProfilesController({} as Database);
  await assert.rejects(controller.update({ user: player } as AuthRequest, { displayName: 'New', role: 'ORGANIZER' }));
});
test('publishing is scoped to owned future drafts and writes an audit entry', async () => {
  let query: any, audited = false;
  const tx = { event: { updateMany: async (input: unknown) => { query = input; return { count: 1 }; } }, auditLog: { create: async () => { audited = true; } } };
  const controller = new EventsController({ $transaction: async (work: (tx: unknown) => unknown) => work(tx) } as unknown as Database);
  await controller.publish({ user: organizer } as AuthRequest, valid().locationId);
  assert.equal(query.where.organizerId, organizer.id);
  assert.equal(query.where.status, 'DRAFT');
  assert.equal(audited, true);
});
test('publishing cannot affect another organizer event or a published event', async () => {
  const tx = { event: { updateMany: async () => ({ count: 0 }) }, auditLog: { create: async () => { throw new Error('must not audit'); } } };
  const controller = new EventsController({ $transaction: async (work: (tx: unknown) => unknown) => work(tx) } as unknown as Database);
  await assert.rejects(controller.publish({ user: organizer } as AuthRequest, valid().locationId), /Only your future draft/);
});
