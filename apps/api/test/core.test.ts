import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ExecutionContext, ForbiddenException, UnauthorizedException, ServiceUnavailableException } from '@nestjs/common';
import { User } from '@prisma/client';
import { AdministratorGuard, AuthRequest, FirebaseGuard, OrganizerGuard, TokenVerifier, tokenFailure } from '../src/auth';
import { Database } from '../src/database';
import { eventFilters, matchesEventDate } from '../src/event-filters';
import { balanceTeams, combinedRating, reshuffleTeams } from '../src/teams';
import { eventOptionsInput, initialPlayersInput } from '../src/event-options';
import { eventGuidanceInput } from '../src/event-guidance';
import { eventInput, EventsController } from '../src/events';
import { ProfilesController } from '../src/profiles';
import { signupInput } from '../src/signups';
import { paymentReviewInput } from '../src/payments';
import { locationInput } from '../src/locations';
import { locationPhotoUrl, locationMapUrl } from '../src/location-media';
import { profileInput, googleAvatarUrl } from '../src/profile-fields';
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
  assert.deepEqual(signupInput({ guests: [' Guest '], expectedPriceCents: 0, guestPaymentAcknowledged: true }), { guests: ['Guest'], price: 0 });
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
  const tx = { eventInvitation: { findMany: async () => [] }, event: { findUniqueOrThrow: async () => ({ id: 'event', status: 'PUBLISHED' }), updateMany: async (input: unknown) => { query = input; return { count: 1 }; } }, auditLog: { create: async () => { audited = true; } } };
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


test('password sessions must verify email even for an existing profile', async () => {
  let lookedUp = false;
  const db = { user: { findUnique: async () => { lookedUp = true; return player; } } } as unknown as Database;
  const guard = new FirebaseGuard({ verify: async () => ({ uid: player.firebaseUid, email_verified: false, firebase: { sign_in_provider: 'password' } }) } as unknown as TokenVerifier, db);
  await assert.rejects(guard.canActivate(context({ headers: { authorization: 'Bearer token' } })), ForbiddenException);
  assert.equal(lookedUp, false);
});

test('verified password sessions resolve the existing role by UID', async () => {
  const db = { user: { findUnique: async () => organizer } } as unknown as Database;
  const guard = new FirebaseGuard({ verify: async () => ({ uid: player.firebaseUid, email_verified: true, firebase: { sign_in_provider: 'password' } }) } as unknown as TokenVerifier, db);
  const req = { headers: { authorization: 'Bearer token' } } as AuthRequest;
  assert.equal(await guard.canActivate(context(req)), true);
  assert.equal(req.user.role, 'ORGANIZER');
});


test('profile contact edits validate and clear optional fields without changing identity or role', () => {
  assert.deepEqual(profileInput({ contactEmail: ' CONTACT@EXAMPLE.COM ', phone: '+1 (555) 123-4567', avatarColor: 'sky', useGooglePhoto: false }), { contactEmail: 'contact@example.com', phone: '+1 (555) 123-4567', avatarColor: 'sky', useGooglePhoto: false });
  assert.deepEqual(profileInput({ contactEmail: '', phone: null }), { contactEmail: null, phone: null });
  for (const value of [{ contactEmail: 'not-email' }, { contactEmail: 'a@b.com/path' }, { contactEmail: 'x@example.com\r\nBcc: other@example.com' }, { phone: 'call-me' }, { phone: '123' }, { phone: '+1234567890123456' }, { avatarColor: 'url(evil)' }, { useGooglePhoto: 'false' }, { avatarUrl: 'https://example.com/photo' }, { email: 'changed@example.com' }, { role: 'ADMINISTRATOR' }]) assert.throws(() => profileInput(value));
});
test('Google photo URLs require HTTPS and an approved Google image host', () => {
  assert.equal(googleAvatarUrl('https://lh3.googleusercontent.com/a/photo'), 'https://lh3.googleusercontent.com/a/photo');
  for (const value of [null, 'http://lh3.googleusercontent.com/a', 'https://lh3.googleusercontent.com.evil.invalid/a', 'https://user:pass@lh3.googleusercontent.com/a', 'https://lh3.googleusercontent.com:8443/a', 'data:image/png;base64,abc', 'javascript:alert(1)', 'https://example.invalid/a']) assert.equal(googleAvatarUrl(value), null);
});
test('Google sign-in imports the trusted picture URL while preserving initial-avatar preference', async () => {
  let data: any;
  const existing = { ...player, avatarUrl: null, useGooglePhoto: false, avatarColor: 'rose' };
  const db = { user: { findUnique: async () => existing, update: async (query: any) => { data = query.data; return { ...existing, ...query.data }; } } } as unknown as Database;
  const guard = new FirebaseGuard({ verify: async () => ({ uid: player.firebaseUid, picture: 'https://lh3.googleusercontent.com/a/photo', firebase: { sign_in_provider: 'google.com' } }) } as unknown as TokenVerifier, db);
  const req = { headers: { authorization: 'Bearer token' } } as AuthRequest;
  await guard.canActivate(context(req));
  assert.deepEqual(data, { avatarUrl: 'https://lh3.googleusercontent.com/a/photo' });
  assert.equal(req.user.useGooglePhoto, false); assert.equal(req.user.avatarColor, 'rose');
});
test('password tokens cannot inject a provider photo even with a signed picture claim', async () => {
  const db = { user: { findUnique: async () => player, update: async () => { throw new Error('must not update'); } } } as unknown as Database;
  const guard = new FirebaseGuard({ verify: async () => ({ uid: player.firebaseUid, email_verified: true, picture: 'https://lh3.googleusercontent.com/a/photo', firebase: { sign_in_provider: 'password' } }) } as unknown as TokenVerifier, db);
  await guard.canActivate(context({ headers: { authorization: 'Bearer token' } }));
});


test('location photos accept external HTTPS URLs and reject unsafe or internal destinations', () => {
  assert.equal(locationPhotoUrl(' https://images.example.invalid/building.jpg '), 'https://images.example.invalid/building.jpg');
  assert.equal(locationPhotoUrl(''), null); assert.equal(locationPhotoUrl(null), null);
  for (const value of ['http://images.example.invalid/a.jpg', 'javascript:alert(1)', 'data:image/png;base64,abc', 'https://localhost/photo', 'https://127.0.0.1/photo', 'https://[::1]/photo', 'https://venue.local/photo', 'https://user:pass@example.invalid/photo', 'https://example.invalid:8443/photo', 'x'.repeat(2049)]) assert.throws(() => locationPhotoUrl(value));
});
test('map settings extract only a canonical Google embed URL and never store iframe HTML', () => {
  const url = 'https://www.google.com/maps/embed?pb=fixture';
  assert.equal(locationMapUrl(url), url);
  assert.equal(locationMapUrl(`<iframe src="${url}" width="600" height="450" allowfullscreen></iframe>`), url);
  assert.equal(locationMapUrl(''), null);
  for (const value of ['https://www.google.com/maps?q=pitch', 'https://maps.app.goo.gl/abc', 'https://www.google.com.evil.invalid/maps/embed?pb=x', 'http://www.google.com/maps/embed?pb=x', 'https://www.google.com/url?pb=x', 'https://user:pass@www.google.com/maps/embed?pb=x', 'https://www.google.com/maps/embed', `<iframe src="${url}"><script>alert(1)</script></iframe>`]) assert.throws(() => locationMapUrl(value));
});
test('optional location media preserves omitted fields and can be explicitly cleared', () => {
  const base = { name: 'Test pitch', address: '123 Test St', timezone: 'America/Toronto' };
  assert.equal('photoUrl' in locationInput(base), false);
  assert.deepEqual(locationInput({ ...base, photoUrl: '', photoCredit: '', mapEmbedUrl: '' }), { ...base, photoUrl: null, photoCredit: null, mapEmbedUrl: null });
});


test('profile names are immutable, nicknames and self-rated skills are validated', () => {
  assert.deepEqual(profileInput({ nickname: '  Striker ', skillLevel: 4 }), { nickname: 'Striker', skillLevel: 4 });
  assert.deepEqual(profileInput({ nickname: '', skillLevel: null }), { nickname: null, skillLevel: null });
  for (const value of [{ displayName: 'Changed' }, { role: 'ORGANIZER' }, { skillLevel: 0 }, { skillLevel: 6 }, { skillLevel: 2.5 }, { skillLevel: '3' }, { nickname: 'x'.repeat(81) }]) assert.throws(() => profileInput(value));
});
test('guest bookings require explicit payment responsibility even for free and waitlisted parties', () => {
  for (const guestPaymentAcknowledged of [undefined, false, 'true', 1]) assert.throws(() => signupInput({ guests: ['Guest'], expectedPriceCents: 0, guestPaymentAcknowledged }));
  assert.equal(signupInput({ guests: ['Guest'], expectedPriceCents: 0, guestPaymentAcknowledged: true }).guests.length, 1);
  assert.equal(signupInput({ guests: [], expectedPriceCents: 1000, costAcknowledged: true }).guests.length, 0);
});


test('event equipment and targets validate and remain advisory settings', () => {
  const base = valid();
  assert.deepEqual(eventGuidanceInput({}, 20), { bibsProvided: false, shirtColorCount: 2, minPlayers: null });
  const bibs = eventInput({ ...base, bibsProvided: true, shirtColorCount: 3, minPlayers: 10 });
  assert.equal(bibs.bibsProvided, true); assert.equal(bibs.shirtColorCount, null); assert.equal(bibs.minPlayers, 10);
  const shirts = eventInput({ ...base, bibsProvided: false, shirtColorCount: 3, minPlayers: 1 });
  assert.equal(shirts.shirtColorCount, 3);
  for (const input of [{ bibsProvided: 'true' }, { bibsProvided: null }, { shirtColorCount: 0 }, { shirtColorCount: 11 }, { shirtColorCount: 1.5 }, { bibsProvided: false, shirtColorCount: null }, { minPlayers: 0 }, { minPlayers: 21 }, { minPlayers: 2.5 }, { minPlayers: '10' }]) assert.throws(() => eventInput({ ...base, ...input }));
});
test('guidance edits preserve unknown legacy settings and reject impossible targets after capacity changes', () => {
  const legacy = { bibsProvided: null, shirtColorCount: null, minPlayers: null };
  assert.deepEqual(eventGuidanceInput({}, 20, legacy), legacy);
  assert.deepEqual(eventGuidanceInput({ bibsProvided: false }, 20, { bibsProvided: true, shirtColorCount: null, minPlayers: null }), { bibsProvided: false, shirtColorCount: 2, minPlayers: null });
  assert.throws(() => eventGuidanceInput({}, 5, { ...legacy, minPlayers: 10 }));
  assert.equal(eventGuidanceInput({ minPlayers: null }, 5, { ...legacy, minPlayers: 10 }).minPlayers, null);
});


test('balancing uses self-ratings and neutral estimates while keeping team sizes within one', () => {
  const players = [{ id: 'a', rating: 5 }, { id: 'b', rating: 4 }, { id: 'c', rating: 3 }, { id: 'd', rating: 2 }];
  const teams = balanceTeams(players, 2);
  assert.deepEqual(teams.map(team => team.total), [7, 7]);
  const odd = balanceTeams([...players, { id: 'e', rating: null }], 3);
  assert.equal(new Set(odd.flatMap(team => team.ids)).size, 5);
  assert.ok(Math.max(...odd.map(team => team.ids.length)) - Math.min(...odd.map(team => team.ids.length)) <= 1);
  assert.equal(odd.reduce((total, team) => total + team.total, 0), 17);
});
test('team and event-contact settings reject invalid or ambiguous availability', () => {
  assert.equal(eventOptionsInput({ teamCount: 4, teamBalancingEnabled: true, organizerContactPhone: '+1 555 123 4567', contactTextAllowed: true }).contactTextAllowed, true);
  for (const input of [{ teamCount: 1 }, { teamCount: 17 }, { teamCount: 2.5 }, { teamBalancingEnabled: 'true' }, { contactCallAllowed: true }, { organizerContactPhone: '+1 555 123 4567' }, { organizerContactEmail: 'not email' }]) assert.throws(() => eventOptionsInput(input));
  assert.equal(eventOptionsInput({}).organizerContactPhone, null);
});
test('initial player lists validate identity, mode, uniqueness and bounds', () => {
  const id = valid().locationId;
  assert.deepEqual(initialPlayersInput({ initialPlayerIds: [id], initialPlayerMode: 'BOOK' }), { ids: [id], mode: 'BOOK' });
  for (const input of [{ initialPlayerIds: [id, id] }, { initialPlayerIds: ['not an id'] }, { initialPlayerIds: Array(101).fill(id) }, { initialPlayerMode: 'OTHER' }]) assert.throws(() => initialPlayersInput(input));
});


test('event date filters follow venue calendars and Monday-to-Sunday weeks across UTC boundaries', () => {
  const day = eventFilters({ period: 'day', date: '2027-01-03' });
  assert.equal(matchesEventDate(new Date('2027-01-04T01:00:00Z'), 'America/Toronto', day), true);
  assert.equal(matchesEventDate(new Date('2027-01-04T01:00:00Z'), 'UTC', day), false);
  const week = eventFilters({ period: 'week', date: '2027-01-03' });
  assert.equal(matchesEventDate(new Date('2026-12-28T17:00:00Z'), 'America/Toronto', week), true);
  assert.equal(matchesEventDate(new Date('2027-01-04T05:00:00Z'), 'America/Toronto', week), false);
  for (const value of [{ period: 'day' }, { period: 'month' }, { date: '2027-02-30' }, { freeOnly: 'yes' }, { organizerId: 'not-a-uuid' }, { city: ['Midland'] }]) assert.throws(() => eventFilters(value));
});
test('reshuffling seeks new teammates while retaining rating-aware balance and even team sizes', () => {
  let seed = 12345; const draw = (upper: number) => { seed = (seed * 1664525 + 1013904223) >>> 0; return Math.floor(seed / 4294967296 * upper); };
  const players = Array.from({ length: 8 }, (_, i) => ({ id: String(i), rating: [5, 4, 3, 2, 5, 4, 3, 2][i], teamNumber: i < 4 ? 1 : 2 }));
  const result = reshuffleTeams(players, 2, draw);
  assert.equal(new Set(result.flatMap(team => team.ids)).size, 8); assert.ok(result.every(team => team.ids.length === 4));
  assert.ok(result.every(team => team.ids.some(id => Number(id) < 4) && team.ids.some(id => Number(id) >= 4)));
  const averages = result.map(team => team.total / team.ids.length); assert.ok(Math.abs(averages[0] - averages[1]) <= 1);
  assert.equal(players[0].teamNumber, 1);
});


test('balancing score averages available self and administrator ratings without rounding', () => {
  assert.equal(combinedRating(1, 5), 3); assert.equal(combinedRating(2, 5), 3.5);
  assert.equal(combinedRating(4, null), 4); assert.equal(combinedRating(null, 2), 2);
  assert.equal(combinedRating(null, null), 3);
});


test('paid signup requires explicit cost acknowledgment while free signup does not', () => {
  for (const costAcknowledged of [undefined, false, 'true', 1]) assert.throws(() => signupInput({ guests: [], expectedPriceCents: 1200, costAcknowledged }), /cost|Cost/);
  assert.equal(signupInput({ guests: [], expectedPriceCents: 1200, costAcknowledged: true }).price, 1200);
  assert.equal(signupInput({ guests: [], expectedPriceCents: 0 }).price, 0);
});
