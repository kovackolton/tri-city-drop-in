import '@angular/compiler';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Injector, runInInjectionContext } from '@angular/core';
import { googleEmbedUrl, googleDirectionsUrl } from '../src/location-media';
import { LocationMapComponent } from '../src/app/location-map/location-map.component';
import { DomSanitizer } from '@angular/platform-browser';
import { avatarInitial, avatarPalette, contactEmailLink, contactPhoneLink } from '../src/avatar';
import { SignupComponent } from '../src/app/signup/signup.component';
import { Game } from '../src/models';
import { MyGamesComponent } from '../src/app/my-games/my-games.component';
import { AuthService } from '../src/auth.service';
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
  const booking = (id: string, start: number, end: number, guestNumber = 0) => ({ id, guestNumber, event: { startsAt: new Date(now + start).toISOString(), endsAt: new Date(now + end).toISOString() } }) as Seat;
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
