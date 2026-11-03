import '@angular/compiler';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Injector, runInInjectionContext } from '@angular/core';
import { googleEmbedUrl, googleDirectionsUrl } from '../src/location-media';
import { LocationMapComponent } from '../src/app/location-map/location-map.component';
import { DomSanitizer } from '@angular/platform-browser';
import { avatarInitial, avatarPalette, contactEmailLink, contactPhoneLink } from '../src/avatar';
import { DialogComponent } from '../src/app/dialog/dialog.component';
import { PaymentReviewComponent } from '../src/app/payment-review/payment-review.component';
import { HttpClient } from '@angular/common/http';
import { Subject, throwError } from 'rxjs';
import { SignupComponent } from '../src/app/signup/signup.component';
import { Game } from '../src/models';
import { MyGamesComponent } from '../src/app/my-games/my-games.component';
import { AuthService } from '../src/auth.service';
import { EventsStore, defaultGameFilters } from '../src/events.store';
import { RegistrationsStore, Seat } from '../src/registrations.store';

test('initial avatars handle blank names and Unicode without splitting surrogate pairs', () => {
  assert.equal(avatarInitial('  alex  '), 'A');
  assert.equal(avatarInitial('Élodie'), 'É');
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
  const injector = Injector.create({ providers: [{ provide: RegistrationsStore, useValue: store }] });
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
