import '@angular/compiler';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Injector, runInInjectionContext } from '@angular/core';
import { googleEmbedUrl, googleDirectionsUrl } from '../src/location-media';
import { LocationMapComponent } from '../src/app/location-map/location-map.component';
import { DomSanitizer } from '@angular/platform-browser';
import { avatarInitial, avatarPalette, contactEmailLink, contactPhoneLink } from '../src/avatar';
import { AdminUsersComponent } from '../src/app/admin-users/admin-users.component';
import { StrikesStore } from '../src/strikes.store';
import { RosterComponent } from '../src/app/roster/roster.component';
import { OrganizerSeat } from '../src/app/organizer-seat/organizer-seat.component';
import { DialogComponent } from '../src/app/dialog/dialog.component';
import { PaymentReviewComponent } from '../src/app/payment-review/payment-review.component';
import { HttpClient } from '@angular/common/http';
import { Observable, Subject, of, throwError } from 'rxjs';
import { SignupComponent } from '../src/app/signup/signup.component';
import { Game } from '../src/models';
import { MyGamesComponent } from '../src/app/my-games/my-games.component';
import { AuthService } from '../src/auth.service';
import { EventsStore, defaultGameFilters } from '../src/events.store';
import { RegistrationsStore, Seat } from '../src/registrations.store';

test('initial avatars handle blank names and Unicode without splitting surrogate pairs', () => {
  assert.equal(avatarInitial('  alex  '), 'A');
  assert.equal(avatarInitial('\u00c9lodie'), '\u00c9');
  assert.equal(avatarInitial('\u{1F680} Player'), '\u{1F680}');
  assert.equal(avatarInitial(''), '?'); assert.equal(avatarInitial(null), '?');
});
test('avatar colors use the palette and reject arbitrary CSS colors', () => {
  assert.equal(avatarPalette('rose').label, 'Rose');
  assert.equal(avatarPalette('url(https://example.invalid/pixel)').id, 'emerald');
});
test('contact links preserve display formatting while encoding mail headers and cleaning telephone punctuation', () => {
  assert.equal(contactPhoneLink('+1 (555) 987-6543'), 'tel:+15559876543');
  assert.equal(contactEmailLink('a?subject=anything@example.invalid'), 'mailto:a%3Fsubject%3Danything%40example.invalid');
});
test('My Games date tiles use the pitch timezone rather than the device calendar date', () => {
  const injector = Injector.create({ providers: [{ provide: AuthService, useValue: {} }, { provide: RegistrationsStore, useValue: {} }] });
  const component = runInInjectionContext(injector, () => new MyGamesComponent());
  assert.equal(component.month('2027-01-01T01:00:00Z', 'America/Toronto'), 'Dec');
  assert.equal(component.day('2027-01-01T01:00:00Z', 'America/Toronto'), '31');
});


test('My Games keeps ongoing games visible and sorts collapsed history separately from upcoming games', () => {
  const now = Date.now();
  const booking = (id: string, start: number, end: number, guestNumber = 0) => ({ id, eventId: id, bookingId: id, guestNumber, event: { startsAt: new Date(now + start).toISOString(), endsAt: new Date(now + end).toISOString() } }) as Seat;
  const seats = [booking('future-later', 7200000, 10800000), booking('oldest', -14400000, -10800000), booking('ongoing', -3600000, 3600000), booking('recent', -7200000, -3600000), booking('guest', -7200000, -3600000, 1)];
  const injector = Injector.create({ providers: [{ provide: AuthService, useValue: {} }, { provide: RegistrationsStore, useValue: { seats: () => seats } }] });
  const component = runInInjectionContext(injector, () => new MyGamesComponent());
  assert.equal(component.showPast(), false);
  const [upcoming, past] = component.gameGroups();
  assert.deepEqual(upcoming.games.map(seat => seat.id), ['ongoing', 'future-later']);
  assert.deepEqual(past.games.map(seat => seat.id), ['recent', 'oldest']);
});


test('maps only trust a Google embed endpoint and safely encode directions', () => {
  assert.equal(googleEmbedUrl('https://www.google.com/maps/embed?pb=fixture'), 'https://www.google.com/maps/embed?pb=fixture');
  for (const url of ['https://evil.invalid/maps/embed?pb=fixture', 'javascript:alert(1)', 'https://www.google.com/maps/embed/v1/place?key=x', 'https://www.google.com/maps/embed', 'https://user:pass@www.google.com/maps/embed?pb=x', '<iframe src="https://evil.invalid"></iframe>']) assert.equal(googleEmbedUrl(url), null);
  assert.equal(googleDirectionsUrl('Pitch & Park', '123 Main St'), 'https://www.google.com/maps/dir/?api=1&destination=Pitch%20%26%20Park%2C%20123%20Main%20St');
});
test('the map component never bypasses Angular security for an unapproved URL and clears old embeds', () => {
  const trusted: string[] = [];
  const injector = Injector.create({ providers: [{ provide: DomSanitizer, useValue: { bypassSecurityTrustResourceUrl: (url: string) => { trusted.push(url); return { url }; } } }] });
  const component = runInInjectionContext(injector, () => new LocationMapComponent());
  component.embedUrl = 'https://evil.invalid/frame'; component.ngOnChanges();
  assert.equal(component.safeUrl, null); assert.deepEqual(trusted, []);
  component.embedUrl = 'https://www.google.com/maps/embed?pb=fixture'; component.ngOnChanges();
  assert.equal(trusted.length, 1); assert.ok(component.safeUrl);
  component.embedUrl = ''; component.ngOnChanges(); assert.equal(component.safeUrl, null);
});


test('guest signup cannot submit without acknowledgment and resets it when another guest is added', async () => {
  const calls: unknown[][] = [];
  const store = { join: async (...args: unknown[]) => { calls.push(args); return true; } };
  const injector = Injector.create({ providers: [{ provide: StrikesStore, useValue: { blocked: () => false } }, { provide: RegistrationsStore, useValue: store }] });
  const component = runInInjectionContext(injector, () => new SignupComponent());
  component.game = { id: 'game', priceCents: 1000, maxGuestsPerUser: 3, capacity: 6 } as Game;
  component.guests = [' Guest ']; await component.join();
  assert.equal(calls.length, 0); assert.match(component.acknowledgmentError(), /Accept guest payment/);
  component.guestPaymentAcknowledged = true; component.add();
  assert.equal(component.guestPaymentAcknowledged, false);
  component.remove(1); component.guestPaymentAcknowledged = true; await component.join();
  assert.deepEqual(calls[0], ['game', ['Guest'], 1000, true]);
  assert.deepEqual(component.guests, []); assert.equal(component.guestPaymentAcknowledged, false);
});


test('modal dialog uses the native overlay and prevents Escape dismissal while a mutation is pending', () => {
  const component = new DialogComponent();
  const native = { open: false, showModal() { this.open = true; }, close() { this.open = false; } };
  component.element = { nativeElement: native as HTMLDialogElement };
  component.closed.subscribe(() => { component.open = false; component.ngOnChanges(); });
  component.open = true; component.ngAfterViewInit(); assert.equal(native.open, true);
  let prevented = false; component.busy = true; component.cancel({ preventDefault: () => { prevented = true; } } as Event);
  assert.equal(prevented, true); assert.equal(native.open, true);
  component.busy = false; component.cancel({ preventDefault: () => {} } as Event); assert.equal(native.open, false);
  component.open = true; component.ngOnChanges(); component.ngOnDestroy(); assert.equal(native.open, false);
});
test('payment review stays in its modal on failure, prevents duplicate submissions and closes on success', async () => {
  let calls = 0; let body: unknown;
  const response = new Subject<unknown>();
  const http = { post: (_: string, value: unknown) => { calls++; body = value; return response; } };
  const injector = Injector.create({ providers: [{ provide: HttpClient, useValue: http }] });
  const component = runInInjectionContext(injector, () => new PaymentReviewComponent());
  component.signupId = 'seat'; component.side = 'organizer'; component.openReview();
  const pending = component.review(true); await component.review(false);
  assert.equal(calls, 1); assert.equal(component.showReview(), true); assert.deepEqual(body, { paid: true });
  response.next({}); response.complete(); await pending; assert.equal(component.showReview(), false);
  http.post = () => throwError(() => ({ code: 'local-failure' })) as any;
  component.openReview(); await component.review(false);
  assert.equal(component.showReview(), true); assert.ok(component.error()); assert.equal(component.busy(), false);
});


test('My Games renders one card per event, prefers the active booking and keeps earlier attempts accessible', () => {
  const now = Date.now();
  const booking = (id: string, status: string, age: number) => ({ id, eventId: 'same-event', bookingId: id, guestNumber: 0, status, queuedAt: new Date(now + age).toISOString(), event: { startsAt: new Date(now + 3600000).toISOString(), endsAt: new Date(now + 7200000).toISOString() } }) as Seat;
  const seats = [booking('first', 'CANCELLED', -5000), booking('latest-cancel', 'CANCELLED', -1000), booking('active', 'CONFIRMED', -2000)];
  const injector = Injector.create({ providers: [{ provide: AuthService, useValue: {} }, { provide: RegistrationsStore, useValue: { seats: () => seats } }] });
  const component = runInInjectionContext(injector, () => new MyGamesComponent());
  assert.equal(component.gameGroups()[0].games.length, 1); assert.equal(component.gameGroups()[0].games[0].id, 'active');
  assert.deepEqual(component.previousBookings(seats[2]).map(seat => seat.id), ['latest-cancel', 'first']);
  seats[2].status = 'CANCELLED'; assert.equal(component.gameGroups()[0].games[0].id, 'latest-cancel');
});


test('upcoming filters persist across refresh and late results cannot replace newer filters', async () => {
  const requests: { url: string; params: Record<string, string>; response: Subject<any> }[] = [];
  const injector = Injector.create({ providers: [EventsStore, { provide: HttpClient, useValue: { get: (url: string, options: { params: Record<string, string> }) => { const response = new Subject<any>(); requests.push({ url, params: options.params, response }); return response; } } }] });
  const store = injector.get(EventsStore);
  const old = store.load({ ...defaultGameFilters(), period: 'day', date: '2027-01-03' });
  const current = store.load({ ...defaultGameFilters(), city: 'Midland', search: ' soccer ', freeOnly: true });
  assert.equal(requests[0].params.date, '2027-01-03'); assert.equal(requests[1].params.search, 'soccer'); assert.equal(requests[1].params.freeOnly, 'true');
  requests[1].response.next([{ id: 'current' }]); requests[1].response.complete(); await current;
  requests[0].response.next([{ id: 'old' }]); requests[0].response.complete(); await old;
  assert.equal(store.events()[0].id, 'current');
  const refresh = store.load(); assert.equal(requests[2].params.city, 'Midland');
  requests[2].response.next([]); requests[2].response.complete(); await refresh;
  injector.destroy();
});


test('merged Users saves independent ratings and keeps failed role changes open', async () => {
  const response = new Subject<{ adminSkillLevel: number | null }>();
  let calls = 0; let endpoint = ''; let payload: unknown;
  const http = { patch: (url: string, body: unknown): Observable<unknown> => { calls++; endpoint = url; payload = body; return response; }, post: (url: string) => { endpoint = url; return throwError(() => ({ code: 'test-failure' })); } };
  const injector = Injector.create({ providers: [{ provide: HttpClient, useValue: http }, { provide: AuthService, useValue: { profile: () => ({ id: 'admin', role: 'ADMINISTRATOR' }) } }] });
  const component = runInInjectionContext(injector, () => new AdminUsersComponent());
  const user = { id: 'player', accountName: 'Player', adminSkillLevel: null, skillLevel: 2 } as any;
  component.users.set([user]); component.ratingDrafts[user.id] = 4;
  const pending = component.saveRating(user); await component.saveRating(user);
  assert.equal(calls, 1); assert.equal(component.users()[0].adminSkillLevel, null);
  assert.equal(endpoint, '/api/admin/users/player/rating'); assert.deepEqual(payload, { adminSkillLevel: 4 });
  response.next({ adminSkillLevel: 4 }); response.complete(); await pending;
  assert.equal(component.users()[0].adminSkillLevel, 4); assert.equal(component.users()[0].skillLevel, 2);
  http.patch = (url: string, body: unknown) => { endpoint = url; payload = body; return throwError(() => ({ code: 'test-failure' })); };
  component.roleDrafts[user.id] = 'ADMINISTRATOR'; component.confirmRole({ ...user, role: 'PLAYER' }); await component.saveRole();
  assert.equal(endpoint, '/api/admin/users/player/role'); assert.deepEqual(payload, { role: 'ADMINISTRATOR' }); assert.ok(component.error()); assert.ok(component.roleConfirmation()); assert.equal(component.busy(), false);
  injector.destroy();
});


test('self role changes refresh current access and prevent duplicate submissions', async () => {
  const response = new Subject<unknown>(); let calls = 0; let refreshed = 0;
  let profile = { id: 'admin', role: 'ADMINISTRATOR' };
  const injector = Injector.create({ providers: [
    { provide: HttpClient, useValue: { patch: () => { calls++; return response; } } },
    { provide: AuthService, useValue: { profile: () => profile, refreshProfile: async () => { refreshed++; profile = { ...profile, role: 'PLAYER' }; } } }
  ] });
  const component = runInInjectionContext(injector, () => new AdminUsersComponent());
  const user = { id: 'admin', accountName: 'Admin', role: 'ADMINISTRATOR' } as any;
  component.roleDrafts[user.id] = 'PLAYER'; component.confirmRole(user);
  const pending = component.saveRole(); await component.saveRole(); assert.equal(calls, 1); assert.equal(refreshed, 0);
  response.next({}); response.complete(); await pending;
  assert.equal(refreshed, 1); assert.equal(component.roleConfirmation(), null); assert.equal(component.busy(), false);
  injector.destroy();
});


test('roster defaults to active seats, searches guests by booking account and keeps cancelled history available', () => {
  const injector = Injector.create({ providers: [{ provide: HttpClient, useValue: {} }] });
  const roster = runInInjectionContext(injector, () => new RosterComponent());
  const seat = (id: string, status: string, guestNumber = 0) => ({ id, status, guestNumber, guestName: guestNumber ? 'Guest Alex' : null, user: { displayName: 'Captain', accountName: 'Morgan Smith' }, strikes: [] }) as unknown as OrganizerSeat;
  roster.seats.set([seat('host', 'CONFIRMED'), seat('guest', 'CONFIRMED', 1), seat('waiting', 'WAITLISTED'), seat('old', 'CANCELLED')]);
  assert.deepEqual(roster.counts(), { confirmed: 2, waitlisted: 1, cancelled: 1 });
  assert.deepEqual(roster.filteredSeats().map(seat => seat.id), ['host', 'guest', 'waiting']);
  roster.search = '  morgan '; assert.equal(roster.filteredSeats().length, 3);
  roster.search = 'alex'; assert.deepEqual(roster.filteredSeats().map(seat => seat.id), ['guest']);
  roster.search = ''; roster.statusFilter.set('CANCELLED'); assert.deepEqual(roster.filteredSeats().map(seat => seat.id), ['old']);
  roster.statusFilter.set('all'); assert.equal(roster.filteredSeats().length, 4);
  roster.togglePlayer('host'); roster.togglePlayer('guest'); assert.equal(roster.expandedSeat(), 'guest'); roster.togglePlayer('guest'); assert.equal(roster.expandedSeat(), '');
  injector.destroy();
});

test('compact payment summaries distinguish unpaid, incomplete, conflicting, free and voided reviews', () => {
  const injector = Injector.create({ providers: [{ provide: HttpClient, useValue: {} }] });
  const roster = runInInjectionContext(injector, () => new RosterComponent());
  const payment = { amountCents: 1000, status: 'UNPAID', playerPaid: null, organizerPaid: null };
  const summary = (override: object) => roster.paymentSummary({ payment: { ...payment, ...override } } as OrganizerSeat);
  assert.equal(summary({}), 'Payment review pending');
  assert.equal(summary({ playerPaid: false, organizerPaid: false }), 'Unpaid');
  assert.equal(summary({ playerPaid: true, organizerPaid: false }), 'Payment reports differ');
  assert.equal(summary({ status: 'PAID', playerPaid: true, organizerPaid: true }), 'Payment received');
  assert.equal(summary({ amountCents: 0, status: 'NOT_REQUIRED' }), 'Free');
  assert.equal(summary({ status: 'VOID' }), 'Payment voided');
  injector.destroy();
});

test('roster loads history on demand and ignores old event responses after changing events', async () => {
  const requests: { url: string; response: Subject<any> }[] = [];
  const injector = Injector.create({ providers: [{ provide: HttpClient, useValue: { get: (url: string) => { const response = new Subject<any>(); requests.push({ url, response }); return response; } } }] });
  const roster = runInInjectionContext(injector, () => new RosterComponent());
  roster.eventId = 'first'; roster.ngOnChanges(); assert.equal(requests.length, 1); assert.ok(requests[0].url.endsWith('/roster'));
  roster.eventId = 'second'; roster.ngOnChanges();
  requests[1].response.next([]); requests[1].response.complete();
  requests[0].response.next([{ id: 'old-player' }]); requests[0].response.complete();
  await new Promise(resolve => setTimeout(resolve, 0)); assert.equal(roster.seats().length, 0); assert.equal(roster.view(), 'players');
  const history = roster.openView('history'); assert.ok(requests[2].url.includes('/second/audit'));
  requests[2].response.next([{ id: 'history' }]); requests[2].response.complete(); await history;
  assert.equal(roster.audit()[0].id, 'history'); assert.equal(roster.auditLoading(), false);
  injector.destroy();
});


test('three-strike signup guard prevents new requests but keeps an existing booking and cancellation available', async () => {
  let joins = 0, cancels = 0;
  const seat = { eventId: 'game', bookingId: 'kept', guestNumber: 0, status: 'CONFIRMED' };
  const store = { seats: () => [seat], join: async () => { joins++; return true; }, cancel: async () => { cancels++; return true; } };
  const injector = Injector.create({ providers: [{ provide: StrikesStore, useValue: { blocked: () => true, count: () => 3 } }, { provide: RegistrationsStore, useValue: store }] });
  const component = runInInjectionContext(injector, () => new SignupComponent()); component.game = { id: 'game' } as Game;
  await component.join(); assert.equal(joins, 0); assert.equal(component.booking()?.bookingId, 'kept');
  await component.cancel('kept'); assert.equal(cancels, 1); injector.destroy();
});

test('strike state refreshes the joining limit and ignores responses after account reset', async () => {
  const responses: Subject<any>[] = [];
  const injector = Injector.create({ providers: [{ provide: AuthService, useValue: { profile: () => ({ id: 'player' }) } }, { provide: HttpClient, useValue: { get: () => { const response = new Subject<any>(); responses.push(response); return response; } } }] });
  const store = runInInjectionContext(injector, () => new StrikesStore());
  const load = store.load(); responses[0].next({ count: 3, limit: 3, blocked: true, items: [] }); responses[0].complete(); await load;
  assert.equal(store.count(), 3); assert.equal(store.blocked(), true);
  const stale = store.load(); store.reset(); responses[1].next({ count: 4, blocked: true, items: [] }); responses[1].complete(); await stale;
  assert.equal(store.report(), null); assert.equal(store.blocked(), false);
  const clear = store.load(); responses[2].next({ count: 2, limit: 3, blocked: false, items: [] }); responses[2].complete(); await clear;
  assert.equal(store.count(), 2); assert.equal(store.blocked(), false); injector.destroy();
});

test('admin permanent-strike retries retain an idempotency key and clear the reason only after success', async () => {
  let report = { count: 0, limit: 3, blocked: false, items: [] };
  const calls: { url: string; body: any }[] = []; let fail = true;
  const http = { get: () => of(report), post: (url: string, body: unknown) => { calls.push({ url, body }); return fail ? throwError(() => ({ code: 'local-failure' })) : of({}); } };
  const injector = Injector.create({ providers: [{ provide: HttpClient, useValue: http }, { provide: AuthService, useValue: { profile: () => ({ id: 'admin', role: 'ADMINISTRATOR' }) } }] });
  const component = runInInjectionContext(injector, () => new AdminUsersComponent());
  const user = { id: 'player', accountName: 'Player', strikeCount: 0 } as any; component.users.set([user]); await component.openStrikes(user);
  component.strikeNote = 'Reviewed administrative incident'; await component.issuePermanent(); assert.ok(component.error()); assert.equal(component.strikeNote, 'Reviewed administrative incident');
  await component.issuePermanent(); assert.equal(calls[0].body.requestId, calls[1].body.requestId);
  fail = false; report = { ...report, count: 1 }; await component.issuePermanent();
  assert.equal(calls[2].body.requestId, calls[0].body.requestId); assert.equal(component.strikeNote, ''); assert.equal(component.users()[0].strikeCount, 1);
  injector.destroy();
});


test('reminder-targeted registration refreshes include older events and ignore a late untargeted response', async () => {
  const requests: { options: any; response: Subject<any> }[] = [];
  const injector = Injector.create({ providers: [RegistrationsStore, { provide: HttpClient, useValue: { get: (_: string, options: any) => { const response = new Subject<any>(); requests.push({ options, response }); return response; } } }] });
  const store = injector.get(RegistrationsStore);
  const old = store.load(); const targeted = store.load('older-event');
  assert.equal(requests[1].options.params.includeEventId, 'older-event');
  requests[1].response.next([{ id: 'target' }]); requests[1].response.complete(); await targeted;
  requests[0].response.next([]); requests[0].response.complete(); await old; assert.equal(store.seats()[0].id, 'target');
  const refresh = store.load(); assert.equal(requests[2].options.params.includeEventId, 'older-event'); requests[2].response.next([]); requests[2].response.complete(); await refresh;
  store.reset(); const reset = store.load(); assert.equal(requests[3].options.params, undefined); requests[3].response.next([]); requests[3].response.complete(); await reset;
  injector.destroy();
});
