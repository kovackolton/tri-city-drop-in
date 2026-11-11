import '@angular/compiler';
import { PlayerPickerComponent } from '../src/app/player-picker/player-picker.component';
import { PaymentLinksComponent } from '../src/app/payment-links/payment-links.component';
import { matchesCalendar, venueDate } from '../src/calendar';
import { PlayersComponent } from '../src/app/players/players.component';
import { LocationsComponent } from '../src/app/locations/locations.component';
import { CalendarPickerComponent } from '../src/app/calendar-picker/calendar-picker.component';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Injector, runInInjectionContext, signal } from '@angular/core';
import { AppComponent } from '../src/app/app.component';
import { googleEmbedUrl, googleDirectionsUrl } from '../src/location-media';
import { LocationMapComponent } from '../src/app/location-map/location-map.component';
import { DomSanitizer } from '@angular/platform-browser';
import { avatarInitial, avatarPalette, contactEmailLink, contactPhoneLink } from '../src/avatar';
import { AdminUsersComponent } from '../src/app/admin-users/admin-users.component';
import { OrganizerComponent } from '../src/app/organizer/organizer.component';
import { WaiverPanelComponent } from '../src/app/waiver-panel/waiver-panel.component';
import { StrikePanelComponent } from '../src/app/strike-panel/strike-panel.component';
import { WaiverStore } from '../src/waiver.store';
import { StrikesStore } from '../src/strikes.store';
import { RosterComponent } from '../src/app/roster/roster.component';
import { OrganizerSeat } from '../src/app/organizer-seat/organizer-seat.component';
import { DialogComponent } from '../src/app/dialog/dialog.component';
import { PaymentReviewComponent } from '../src/app/payment-review/payment-review.component';
import { HttpClient } from '@angular/common/http';
import { Observable, Subject, of, throwError } from 'rxjs';
import { EventInvitationsComponent } from '../src/app/event-invitations/event-invitations.component';
import { SignupComponent } from '../src/app/signup/signup.component';
import { Game } from '../src/models';
import { MyGamesComponent } from '../src/app/my-games/my-games.component';
import { AuthService } from '../src/auth.service';
import { EventShareComponent } from '../src/app/event-share/event-share.component';
import { sharedEventId, privateGameTarget, shareMessage, SharedGame, emailShareLink, emailShareText, emailCardHtml } from '../src/event-sharing';
import { EventsStore, defaultGameFilters, activeGameFilterCount } from '../src/events.store';
import { RegistrationsStore, Seat } from '../src/registrations.store';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { howToGuides, visibleHowToGuides, searchHowToGuides, howToGuideFromHash, guideScreenshotPath } from '../src/app/how-to/how-to-content';
import { HowToComponent } from '../src/app/how-to/how-to.component';

test('organizer editing controls respect ownership and save draft transitions through the guarded endpoint', async () => {
  let profile: any = { id: 'owner', role: 'ORGANIZER' };
  const calls: { url: string; body: any }[] = [];
  const injector = Injector.create({ providers: [
    { provide: AuthService, useValue: { profile: () => profile } },
    { provide: HttpClient, useValue: { get: () => of([]), patch: (url: string, body: any) => { calls.push({ url, body }); return of({}); } } }
  ] });
  const component = runInInjectionContext(injector, () => new OrganizerComponent());
  const own = { id: 'game', organizerId: 'owner', status: 'PUBLISHED', startsAt: new Date(Date.now() + 86400000).toISOString() } as any;
  assert.equal(component.canEdit(own), true); assert.equal(component.canReturnToDraft(own), true);
  assert.equal(component.canEdit({ ...own, organizerId: 'other' }), false);
  profile = { id: 'admin', role: 'ADMINISTRATOR' }; assert.equal(component.canEdit(own), true);
  assert.equal(component.canEdit({ ...own, status: 'COMPLETED' }), false);
  assert.equal(component.canReturnToDraft({ ...own, startsAt: new Date(Date.now() - 1000).toISOString() }), false);
  profile = null; assert.equal(component.canEdit(own), false);
  profile = { id: 'owner', role: 'ORGANIZER' };
  for (const status of ['PUBLISHED', 'DRAFT']) {
    component.editingId.set(own.id);
    component.event = { ...component.event, title: 'Edited game', locationId: 'location', startsAt: own.startsAt, endsAt: new Date(Date.now() + 90000000).toISOString(), status };
    await component.createEvent();
    assert.equal(component.error(), '');
    assert.equal(calls.at(-1)?.url, '/api/organizer/events/game');
    assert.equal(calls.at(-1)?.body.status, status === 'DRAFT' ? 'DRAFT' : undefined);
  }
  injector.destroy();
});

test('event creation waits for a modal status choice, preserves input on cancel and prevents duplicate submissions', async () => {
  const calls: { body: any; response: Subject<any> }[] = [];
  const injector = Injector.create({ providers: [
    { provide: AuthService, useValue: { profile: () => ({ id: 'owner', role: 'ORGANIZER' }) } },
    { provide: HttpClient, useValue: { get: () => of([]), post: (_url: string, body: any) => { const response = new Subject<any>(); calls.push({ body, response }); return response; } } }
  ] });
  const component = runInInjectionContext(injector, () => new OrganizerComponent());
  const setup = () => { component.event = { ...component.event, title: 'Friday soccer', locationId: 'venue', price: '12.50', startsAt: new Date(Date.now() + 86400000).toISOString(), endsAt: new Date(Date.now() + 90000000).toISOString() }; };
  setup();
  await component.createEvent(); assert.equal(calls.length, 0); assert.equal(component.choosingStatus(), true);
  component.closeStatusDialog(); assert.equal(component.event.title, 'Friday soccer');
  await component.confirmCreation('PUBLISHED'); assert.equal(calls.length, 0);
  for (const status of ['DRAFT', 'PUBLISHED'] as const) {
    setup(); await component.createEvent();
    const pending = component.confirmCreation(status); const count = calls.length;
    assert.equal(component.busy(), true); assert.equal(calls.at(-1)?.body.status, status); assert.equal(calls.at(-1)?.body.priceCents, 1250);
    component.closeStatusDialog(); assert.equal(component.choosingStatus(), true);
    await component.confirmCreation(status); assert.equal(calls.length, count);
    calls.at(-1)!.response.next({}); calls.at(-1)!.response.complete(); await pending;
    assert.equal(component.choosingStatus(), false); assert.equal(component.busy(), false);
  }
  setup(); await component.createEvent(); const failing = component.confirmCreation('PUBLISHED');
  calls.at(-1)!.response.error(new Error('Offline')); await failing;
  assert.equal(component.choosingStatus(), true); assert.equal(component.event.title, 'Friday soccer'); assert.ok(component.error());
  injector.destroy();
});

test('workspace defaults to My events, uses minimal organizer overview and retains full admin views without stale responses', async () => {
  let profile: any = { id: 'owner', role: 'ORGANIZER' };
  const requests: { url: string; options: any; response: Subject<any> }[] = [];
  const injector = Injector.create({ providers: [
    { provide: AuthService, useValue: { profile: () => profile } },
    { provide: HttpClient, useValue: { get: (url: string, options: any) => { if (url === '/api/locations') return of([]); const response = new Subject<any>(); requests.push({ url, options, response }); return response; } } }
  ] });
  const component = runInInjectionContext(injector, () => new OrganizerComponent());
  assert.equal(component.eventScope(), 'mine');
  const initial = component.load(); assert.equal(requests[0].url, '/api/organizer/events'); assert.equal(requests[0].options.params.scope, 'mine');
  component.rosterEvent.set('old'); const overview = component.selectEventScope('all');
  assert.equal(component.rosterEvent(), ''); assert.equal(component.minimalView(), true); assert.equal(requests[1].url, '/api/organizer/events/overview');
  requests[1].response.next([{ id: 'summary' }]); requests[1].response.complete(); await overview;
  requests[0].response.next([{ id: 'stale-private-event' }]); requests[0].response.complete(); await initial;
  assert.equal(component.events().length, 0); assert.equal(component.overview()[0].id, 'summary');
  profile = { id: 'admin', role: 'ADMINISTRATOR' };
  const all = component.load(); assert.equal(requests[2].url, '/api/organizer/events'); assert.equal(requests[2].options.params.scope, 'all');
  requests[2].response.next([{ id: 'managed' }]); requests[2].response.complete(); await all;
  assert.equal(component.minimalView(), false); assert.equal(component.events()[0].id, 'managed'); assert.equal(component.overview().length, 0);
  const mine = component.selectEventScope('mine'); assert.equal(requests[3].url, '/api/organizer/events');
  requests[3].response.next([]); requests[3].response.complete(); await mine; injector.destroy();
});

test('email sharing safely encodes the draft and creates an escaped static card with a website join link', () => {
  const data = { game: { title: 'Soccer <script>alert(1)</script>', location: 'Field', photoUrl: 'javascript:alert(1)' }, share: { url: 'https://soccer.example.test/games/id?x=1&y=2', title: 'Soccer & friends\r\nBcc: test', description: 'Friday at 7 PM / Field / USD 12.00 / 6 spots available', availability: '6 spots available', action: 'Join Game', open: true } } as SharedGame;
  const email = new URL(emailShareLink(data));
  assert.equal(email.protocol, 'mailto:'); assert.equal(email.searchParams.get('subject'), 'Soccer & friends Bcc: test');
  assert.equal(email.searchParams.has('bcc'), false); assert.equal(email.searchParams.get('body'), emailShareText(data));
  assert.ok(emailShareText(data).includes(data.share.url));
  const card = emailCardHtml(data);
  assert.ok(card.includes('Soccer &lt;script&gt;')); assert.ok(!card.includes('<script>')); assert.ok(!card.includes('javascript:'));
  assert.ok(card.includes('/share/soccer-ball.png')); assert.ok(card.includes('6 spots available')); assert.ok(card.includes('>Join Game</a>'));
  assert.ok(card.includes('href="https://soccer.example.test/games/id?x=1&amp;y=2"'));
  assert.throws(() => emailCardHtml({ ...data, share: { ...data.share, url: 'javascript:alert(1)' } }), /Invalid public/);
});

test('email card copying provides rich and plain representations and reports permission failures', async () => {
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const originalItem = Object.getOwnPropertyDescriptor(globalThis, 'ClipboardItem');
  let copied: any[] = [], reject = false;
  class Item { constructor(readonly data: Record<string, Blob>) {} }
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { clipboard: { write: async (items: any[]) => { if (reject) throw new Error('Denied'); copied = items; } } } });
  Object.defineProperty(globalThis, 'ClipboardItem', { configurable: true, value: Item });
  const injector = Injector.create({ providers: [{ provide: HttpClient, useValue: {} }] });
  try {
    const component = runInInjectionContext(injector, () => new EventShareComponent());
    component.data.set({ game: { title: 'Soccer', location: 'Pitch' }, share: { url: 'https://soccer.example.test/games/id', title: 'Soccer', description: 'Friday / USD 12.00', availability: '4 spots available', action: 'Join Game', open: true } } as SharedGame);
    await component.copyEmailCard(); assert.equal(copied.length, 1);
    assert.ok((await copied[0].data['text/html'].text()).includes('>Join Game</a>'));
    assert.ok((await copied[0].data['text/plain'].text()).includes('https://soccer.example.test/games/id'));
    assert.match(component.notice(), /Paste it/);
    reject = true; await component.copyEmailCard(); assert.match(component.error(), /Use Email game/);
  } finally {
    injector.destroy();
    if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator); else Reflect.deleteProperty(globalThis, 'navigator');
    if (originalItem) Object.defineProperty(globalThis, 'ClipboardItem', originalItem); else Reflect.deleteProperty(globalThis, 'ClipboardItem');
  }
});

test('mobile navigation closes on selection and Escape, restores focus and labels the current page', () => {
  const documentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const animationDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'requestAnimationFrame');
  const focused: string[] = [];
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { getElementById: (id: string) => ({ focus: () => focused.push(id) }) } });
  Object.defineProperty(globalThis, 'requestAnimationFrame', { configurable: true, value: (callback: () => void) => { callback(); return 1; } });
  try {
    const component: AppComponent = Object.assign(Object.create(AppComponent.prototype), {
      myGamesMenuOpen: signal(false), mobileNavigationOpen: signal(false), bottomNavigationHidden: signal(false), page: signal('games'), profileSectionRequest: signal(null), auth: { profile: () => ({ role: 'ADMINISTRATOR' }) }
    });
    assert.equal(component.pageLabel(), 'Upcoming games');
    component.toggleMobileNavigation(); assert.equal(component.mobileNavigationOpen(), true);
    component.navigate('profile'); assert.equal(component.mobileNavigationOpen(), false); assert.equal(component.pageLabel(), 'My profile');
    assert.equal(focused.at(-1), 'main-content');
    component.toggleMobileNavigation(); component.closeMobileNavigation(true);
    assert.equal(component.mobileNavigationOpen(), false); assert.equal(focused.at(-1), 'mobile-navigation-toggle');
    component.page.set('organizer'); assert.equal(component.pageLabel(), 'Administrator workspace');
    component.page.set('signin'); assert.equal(component.pageLabel(), 'Sign in');
  } finally {
    if (documentDescriptor) Object.defineProperty(globalThis, 'document', documentDescriptor); else Reflect.deleteProperty(globalThis, 'document');
    if (animationDescriptor) Object.defineProperty(globalThis, 'requestAnimationFrame', animationDescriptor); else Reflect.deleteProperty(globalThis, 'requestAnimationFrame');
  }
});

test('collapsed filters count applied criteria and ignore unused dates and blank searches', () => {
  assert.equal(activeGameFilterCount(defaultGameFilters()), 0);
  assert.equal(activeGameFilterCount({ ...defaultGameFilters(), date: '2027-01-01', search: '  ' }), 0);
  assert.equal(activeGameFilterCount({ ...defaultGameFilters(), period: 'week', locationId: 'venue', freeOnly: true, search: 'soccer' }), 4);
});

test('invalid fields reopen collapsed event sections and keep error messages beside the affected field', () => {
  const injector = Injector.create({ providers: [{ provide: AuthService, useValue: {} }, { provide: HttpClient, useValue: {} }] });
  const component = runInInjectionContext(injector, () => new OrganizerComponent());
  const outer = { open: false, parentElement: null };
  const inner = { open: false, parentElement: { closest: () => outer } };
  component.event.title = 'Keep my entered title';
  component.revealInvalidField({ target: { name: 'teamCount', validationMessage: 'Enter at least 2 teams.', closest: () => inner } } as unknown as Event);
  assert.equal(inner.open, true); assert.equal(outer.open, true); assert.equal(component.fieldErrors()['teamCount'], 'Enter at least 2 teams.');
  assert.equal(component.event.title, 'Keep my entered title');
  component.clearFieldError('teamCount'); assert.equal(component.fieldErrors()['teamCount'], undefined);
  injector.destroy();
});

test('private game context uses its invite endpoint and clears the key when leaving the shared game', async () => {
  const requests: string[] = [];
  const injector = Injector.create({ providers: [EventsStore, { provide: HttpClient, useValue: { get: (url: string) => { requests.push(url); return of({ game: { id: 'private', isPrivate: true } }); } } }] });
  const store = injector.get(EventsStore), token = 'a'.repeat(64);
  assert.deepEqual(privateGameTarget(`?privateGame=private&invite=${token}`), { id: 'private', invite: token });
  assert.equal(privateGameTarget('?privateGame=private'), null);
  const id = '11111111-1111-4111-8111-111111111111';
  assert.deepEqual(privateGameTarget('', `/private-game/${id}/${token}`), { id, invite: token });
  assert.deepEqual(privateGameTarget('', `/private-game/${id}/${token}/`), { id, invite: token });
  assert.equal(privateGameTarget('', `/private-game/${id}/wrong`), null);
  assert.deepEqual(privateGameTarget('?privateGame=other&invite=other', `/private-game/${id}/${token}`), { id, invite: token });
  await store.loadSelected('private', token);
  assert.equal(requests[0], `/api/private/games/private?invite=${token}`); assert.equal(store.selectedInviteToken(), token);
  store.clearSelected(); assert.equal(store.selectedInviteToken(), ''); injector.destroy();
});

test('private signup carries the invite key after separate paid cost confirmation', async () => {
  const calls: unknown[][] = [];
  const injector = Injector.create({ providers: [
    { provide: WaiverStore, useValue: { accepted: () => true } }, { provide: StrikesStore, useValue: { blocked: () => false } },
    { provide: RegistrationsStore, useValue: { join: async (...args: unknown[]) => { calls.push(args); return true; } } }
  ] });
  const component = runInInjectionContext(injector, () => new SignupComponent());
  component.game = { id: 'private', title: 'Private soccer', priceCents: 1200, isPrivate: true } as Game; component.inviteToken = 'a'.repeat(64);
  await component.join(); assert.equal(calls.length, 0); await component.confirmCost();
  assert.equal(calls.length, 1); assert.equal(calls[0][5], component.inviteToken); assert.equal(calls[0][4], true); injector.destroy();
});

test('private creation preserves per-player booking choices and sharing uses the organizer endpoint', async () => {
  const calls: { url: string; body?: any }[] = [];
  const injector = Injector.create({ providers: [
    { provide: AuthService, useValue: { profile: () => ({ id: 'owner', role: 'ORGANIZER' }) } },
    { provide: HttpClient, useValue: { get: (url: string) => { calls.push({ url }); return of([]); }, post: (url: string, body: any) => { calls.push({ url, body }); return of({}); } } }
  ] });
  const component = runInInjectionContext(injector, () => new OrganizerComponent());
  component.event = { ...component.event, isPrivate: true, title: 'Private soccer', locationId: 'pitch', startsAt: new Date(Date.now() + 86400000).toISOString(), endsAt: new Date(Date.now() + 90000000).toISOString() };
  component.selectedPlayers.set([{ id: 'player', accountName: 'Player', displayName: 'Player', mode: 'BOOK' }]);
  await component.createEvent(); await component.confirmCreation('PUBLISHED');
  const create = calls.find(call => call.url === '/api/events')!; assert.equal(create.body.isPrivate, true); assert.deepEqual(create.body.initialPlayers, [{ userId: 'player', mode: 'BOOK' }]);
  const share = runInInjectionContext(injector, () => new EventShareComponent()); share.eventId = 'private'; share.organizerContext = true;
  await share.prepare(); assert.ok(calls.some(call => call.url === '/api/organizer/events/private/share')); injector.destroy();
});

test('shared player picker stages per-player modes, saves once, and retains failed selections', async () => {
  const searches: Subject<any>[] = [], posts: { body: any; response: Subject<any> }[] = [];
  const injector = Injector.create({ providers: [{ provide: HttpClient, useValue: { get: () => { const response = new Subject<any>(); searches.push(response); return response; }, post: (_url: string, body: any) => { const response = new Subject<any>(); posts.push({ body, response }); return response; } } }] });
  const component = runInInjectionContext(injector, () => new PlayerPickerComponent()); component.eventId = 'event'; component.priceCents = 1200; component.search = 'Alex';
  const search = component.find(); searches[0].next([{ id: 'one', displayName: 'Alex', accountName: 'Alex' }, { id: 'two', displayName: 'Sam', accountName: 'Sam' }]); searches[0].complete(); await search;
  component.select(component.results()[0]); component.select(component.results()[0]); component.select(component.results()[1]); component.mode('two', 'BOOK'); assert.equal(component.players.length, 2); assert.equal(component.players[0].mode, 'INVITE');
  const save = component.save(); await component.save(); assert.equal(posts.length, 1); assert.deepEqual(posts[0].body, { players: [{ userId: 'one', mode: 'INVITE' }, { userId: 'two', mode: 'BOOK' }], expectedPriceCents: 1200 });
  posts[0].response.error(new Error('Booking rejected')); await save; assert.equal(component.players.length, 2); assert.ok(component.error());
  const retry = component.save(); posts[1].response.next({ items: [{ mode: 'INVITE' }, { mode: 'BOOK' }] }); posts[1].response.complete(); await retry; assert.equal(component.players.length, 0); injector.destroy();
});

test('shared picker ignores old-event searches and bulk requires a confirmed current preview', async () => {
  const searches: Subject<any>[] = [], posts: any[] = [];
  const injector = Injector.create({ providers: [{ provide: HttpClient, useValue: { get: () => { const response = new Subject<any>(); searches.push(response); return response; }, post: (url: string, body: any) => { posts.push({ url, body }); return of(url.endsWith('bulk-preview') ? { previewId: 'preview', minimumSkill: 4, count: 2, draft: false } : { count: 2, draft: false }); } } }] });
  const component = runInInjectionContext(injector, () => new PlayerPickerComponent()); component.eventId = 'old'; component.search = 'Alex'; const searching = component.find(); component.eventId = 'new'; component.ngOnChanges({ eventId: {} } as any); searches[0].next([{ id: 'old' }]); searches[0].complete(); await searching; assert.equal(component.results().length, 0);
  await component.sendBulk(); assert.equal(posts.length, 0); component.bulkSkill = 4; await component.previewBulk(); assert.equal(component.bulkPreview()?.count, 2); await component.sendBulk(); assert.deepEqual(posts[1].body, { previewId: 'preview', confirm: true }); assert.equal(component.bulkPreview(), null); injector.destroy();
});

test('handbook visibility and search respect roles and direct restricted-guide selection falls back safely', () => {
  const player = visibleHowToGuides('PLAYER'), organizer = visibleHowToGuides('ORGANIZER'), admin = visibleHowToGuides('ADMINISTRATOR');
  assert.ok(player.some(guide => guide.id === 'payment-strikes')); assert.ok(!player.some(guide => guide.id === 'create-event'));
  assert.ok(organizer.some(guide => guide.id === 'create-event')); assert.ok(!organizer.some(guide => guide.id === 'admin-users'));
  assert.ok(admin.some(guide => guide.id === 'admin-users')); assert.equal(visibleHowToGuides(null).length, player.length);
  assert.ok(searchHowToGuides('PLAYER', 'organizer workspace').every(guide => guide.audience === 'everyone'));
  assert.ok(searchHowToGuides('PLAYER', '24 hours').some(guide => guide.id === 'payment-strikes'));
  const profile = signal<any>({ role: 'ADMINISTRATOR' });
  const injector = Injector.create({ providers: [{ provide: AuthService, useValue: { profile } }] });
  const component = runInInjectionContext(injector, () => new HowToComponent()); component.guideId = 'admin-users'; assert.equal(component.guide().id, 'admin-users');
  profile.set({ role: 'PLAYER' }); assert.equal(component.guide().id, 'start'); assert.equal(component.unavailable(), true);
  component.openGuide('create-event'); assert.equal(component.guide().id, 'start');
  component.openGuide('join-game'); assert.equal(component.guide().id, 'join-game'); assert.equal(component.unavailable(), false); injector.destroy();
});

test('handbook links resolve and every screenshot placeholder has a checklist entry', () => {
  const checklist = readFileSync(resolve('../../docs/how-to-screenshot-checklist.md'), 'utf8');
  const ids = new Set(howToGuides.map(guide => guide.id)); assert.equal(ids.size, howToGuides.length);
  const images = new Set<string>();
  for (const guide of howToGuides) {
    for (const id of guide.related) assert.ok(ids.has(id), `Missing related guide ${id}`);
    assert.equal(new Set(guide.sections.map(section => section.id)).size, guide.sections.length);
    for (const section of guide.sections) {
      if (!section.image) continue;
      assert.ok(!images.has(section.image.id)); images.add(section.image.id);
      assert.equal(guideScreenshotPath(section.image), `/images/how-to/${section.image.id}.png`);
      assert.ok(checklist.includes(`**${section.image.id}.png**`), `Missing screenshot checklist item ${section.image.id}`);
    }
  }
  assert.equal(howToGuideFromHash('#how-to/payment-strikes'), 'payment-strikes');
  assert.equal(howToGuideFromHash('#how-to'), 'start'); assert.equal(howToGuideFromHash('#how-to/'), 'start');
  assert.equal(howToGuideFromHash('#some-other-section'), null);
});

test('equipment creation keeps bib quantities alongside named shirts and defaults dark/light', async () => {
  const requests: any[] = [];
  const injector = Injector.create({ providers: [
    { provide: AuthService, useValue: { profile: () => ({ id: 'owner', role: 'ORGANIZER' }) } },
    { provide: HttpClient, useValue: { get: () => of([]), post: (_url: string, body: unknown) => { requests.push(body); return of({}); } } }
  ] });
  const component = runInInjectionContext(injector, () => new OrganizerComponent());
  assert.deepEqual(component.event.shirtColors, ['dark', 'light']);
  component.updateShirtColors(3); assert.deepEqual(component.event.shirtColors, ['dark', 'light', '']);
  component.event.shirtColors[2] = 'red';
  component.event = { ...component.event, title: 'Equipment game', locationId: 'pitch', bibsProvided: true, bibCount: 12, startsAt: new Date(Date.now() + 86400000).toISOString(), endsAt: new Date(Date.now() + 90000000).toISOString() };
  await component.createEvent(); await component.confirmCreation('PUBLISHED');
  assert.equal(requests[0].bibCount, 12); assert.equal(requests[0].shirtColorCount, 3); assert.deepEqual(requests[0].shirtColors, ['dark', 'light', 'red']);
  assert.deepEqual(component.event.shirtColors, ['dark', 'light']); injector.destroy();
});

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
  const booking = (id: string, start: number, end: number, guestNumber = 0) => ({ id, eventId: id, bookingId: id, guestNumber, status: 'CONFIRMED', event: { startsAt: new Date(now + start).toISOString(), endsAt: new Date(now + end).toISOString() } }) as Seat;
  const seats = [booking('future-later', 7200000, 10800000), booking('oldest', -14400000, -10800000), booking('ongoing', -3600000, 3600000), booking('recent', -7200000, -3600000), booking('guest', -7200000, -3600000, 1)];
  const injector = Injector.create({ providers: [{ provide: AuthService, useValue: {} }, { provide: RegistrationsStore, useValue: { seats: () => seats } }] });
  const component = runInInjectionContext(injector, () => new MyGamesComponent());
  assert.equal(component.view(), 'all');
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
  const injector = Injector.create({ providers: [{ provide: WaiverStore, useValue: { accepted: () => true } }, { provide: StrikesStore, useValue: { blocked: () => false } }, { provide: RegistrationsStore, useValue: store }] });
  const component = runInInjectionContext(injector, () => new SignupComponent());
  component.game = { id: 'game', priceCents: 1000, maxGuestsPerUser: 3, capacity: 6 } as Game;
  component.guests = [' Guest ']; await component.join();
  assert.equal(calls.length, 0); assert.match(component.acknowledgmentError(), /Accept guest payment/);
  component.guestPaymentAcknowledged = true; component.add();
  assert.equal(component.guestPaymentAcknowledged, false);
  component.remove(1); component.guestPaymentAcknowledged = true; await component.join();
  assert.equal(calls.length, 0); await component.confirmCost();
  assert.deepEqual(calls[0], ['game', ['Guest'], 1000, true, true]);
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
  seats[2].status = 'CANCELLED'; assert.equal(component.gameGroups()[0].games.length, 0); component.bookingStatus = ''; assert.equal(component.gameGroups()[0].games[0].id, 'latest-cancel');
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
  const injector = Injector.create({ providers: [{ provide: WaiverStore, useValue: { accepted: () => true } }, { provide: StrikesStore, useValue: { blocked: () => true, count: () => 3 } }, { provide: RegistrationsStore, useValue: store }] });
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


test('waiver signing requires an explicit server-confirmed agreement and ignores late responses after reset', async () => {
  const document = { version: 'v1', title: 'Rules', clauses: ['Review these rules'], contentHash: 'hash', acceptance: null };
  const calls: unknown[] = []; const responses: Subject<any>[] = [];
  const injector = Injector.create({ providers: [{ provide: AuthService, useValue: { profile: () => ({ id: 'player' }) } }, { provide: HttpClient, useValue: { get: () => of(document), post: (_: string, body: unknown) => { calls.push(body); const response = new Subject<any>(); responses.push(response); return response; } } }] });
  const store = runInInjectionContext(injector, () => new WaiverStore()); await store.load(); assert.equal(store.accepted(), false);
  const agreement = store.agree(); await store.agree(); assert.equal(calls.length, 1); assert.deepEqual(calls[0], { version: 'v1', agree: true }); assert.equal(store.accepted(), false);
  responses[0].next({ ...document, acceptance: { id: 'signed', version: 'v1', signedName: 'Player', signedEmail: 'test@example.invalid', acceptedAt: new Date().toISOString() } }); responses[0].complete(); await agreement; assert.equal(store.accepted(), true);
  store.reset(); await store.load(); const stale = store.agree(); store.reset(); responses[1].next({ ...document, acceptance: { version: 'v1' } }); responses[1].complete(); await stale;
  assert.equal(store.status(), null); assert.equal(store.accepted(), false); injector.destroy();
});

test('profile sections start collapsed and a repeated navigation request reopens a manually closed section', () => {
  const injector = Injector.create({ providers: [{ provide: WaiverStore, useValue: {} }, { provide: StrikesStore, useValue: {} }] });
  const waiver = runInInjectionContext(injector, () => new WaiverPanelComponent());
  const strikes = runInInjectionContext(injector, () => new StrikePanelComponent());
  for (const panel of [waiver, strikes]) {
    assert.equal(panel.open(), false); panel.openRequest = 1; panel.ngOnChanges(); assert.equal(panel.open(), true);
    panel.open.set(false); panel.openRequest = 2; panel.ngOnChanges(); assert.equal(panel.open(), true);
  }
  injector.destroy();
});

test('unsigned users cannot submit new joins but retain existing booking and cancellation access', async () => {
  let joins = 0, cancels = 0;
  const store = { seats: () => [{ eventId: 'game', bookingId: 'legacy', guestNumber: 0, status: 'CONFIRMED' }], join: async () => { joins++; return true; }, cancel: async () => { cancels++; return true; } };
  const injector = Injector.create({ providers: [{ provide: WaiverStore, useValue: { accepted: () => false } }, { provide: StrikesStore, useValue: { blocked: () => false } }, { provide: RegistrationsStore, useValue: store }] });
  const component = runInInjectionContext(injector, () => new SignupComponent()); component.game = { id: 'game' } as Game;
  await component.join(); assert.equal(joins, 0); assert.equal(component.booking()?.bookingId, 'legacy');
  await component.cancel('legacy'); assert.equal(cancels, 1); injector.destroy();
});


test('paid joins wait for a second press, reject stale cost details and submit only once; free joins remain direct', async () => {
  const calls: unknown[][] = []; let finish!: (value: boolean) => void;
  const store = { join: (...args: unknown[]) => { calls.push(args); return new Promise<boolean>(resolve => { finish = resolve; }); } };
  const injector = Injector.create({ providers: [{ provide: WaiverStore, useValue: { accepted: () => true } }, { provide: StrikesStore, useValue: { blocked: () => false } }, { provide: RegistrationsStore, useValue: store }] });
  const component = runInInjectionContext(injector, () => new SignupComponent()); component.game = { id: 'game', title: 'Paid game', priceCents: 1200 } as Game;
  await component.join(); assert.equal(calls.length, 0); assert.equal(component.costConfirmation()?.priceCents, 1200);
  component.game = { ...component.game, priceCents: 1500 }; await component.confirmCost(); assert.equal(calls.length, 0); assert.equal(component.costConfirmation(), null); assert.match(component.acknowledgmentError(), /changed/);
  await component.join(); const confirmation = component.confirmCost(); await component.confirmCost(); assert.equal(calls.length, 1); assert.deepEqual(calls[0], ['game', [], 1500, false, true]);
  finish(true); await confirmation; assert.equal(component.costConfirmation(), null);
  component.game = { ...component.game, priceCents: 0 }; const free = component.join(); assert.equal(calls.length, 2); assert.equal(calls[1][4], false); finish(true); await free;
  injector.destroy();
});

test('paid invitations require a separate confirmation and reject a price changed while the dialog is open', async () => {
  const calls: { url: string; body: any }[] = [];
  const http = { get: () => of([]), post: (url: string, body: any) => { calls.push({ url, body }); return of({}); } };
  const injector = Injector.create({ providers: [{ provide: WaiverStore, useValue: { accepted: () => true } }, { provide: StrikesStore, useValue: { blocked: () => false } }, { provide: HttpClient, useValue: http }] });
  const component = runInInjectionContext(injector, () => new EventInvitationsComponent());
  const invite = { id: 'invite', event: { id: 'game', title: 'Invited game', priceCents: 1000 } } as any; component.invitations.set([invite]);
  await component.respond(invite, 'accept'); assert.equal(calls.length, 0); assert.ok(component.costConfirmation());
  invite.event.priceCents = 1500; await component.confirmCost(); assert.equal(calls.length, 0); assert.match(component.error(), /changed/);
  await component.respond(invite, 'accept'); await component.confirmCost(); assert.equal(calls.length, 1); assert.deepEqual(calls[0].body, { expectedPriceCents: 1500, costAcknowledged: true }); assert.equal(component.costConfirmation(), null);
  injector.destroy();
});


test('shared games load independently of list filters and cannot be restored by an old response after dismissal', async () => {
  const requests: { url: string; response: Subject<any> }[] = [];
  const injector = Injector.create({ providers: [EventsStore, { provide: HttpClient, useValue: { get: (url: string) => { const response = new Subject<any>(); requests.push({ url, response }); return response; } } }] });
  const store = injector.get(EventsStore);
  const first = store.loadSelected('first'); const second = store.loadSelected('second');
  requests[1].response.next({ game: { id: 'second' } }); requests[1].response.complete(); await second;
  requests[0].response.next({ game: { id: 'first' } }); requests[0].response.complete(); await first;
  assert.equal(store.selectedGame()?.id, 'second'); assert.equal(store.events().length, 0);
  const stale = store.loadSelected('third'); store.clearSelected(); requests[2].response.next({ game: { id: 'third' } }); requests[2].response.complete(); await stale;
  assert.equal(store.selectedGame(), null); assert.equal(store.selectedId(), '');
  const unavailable = store.loadSelected('ended'); requests[3].response.error(new Error('404')); await unavailable; assert.equal(store.selectedGame(), null); assert.match(store.selectedError(), /unavailable/);
  assert.equal(sharedEventId('?event=some-id&other=x'), 'some-id'); assert.equal(sharedEventId(''), ''); injector.destroy();
});

test('event sharing fetches fresh public metadata and ignores results for a previous card', async () => {
  const responses: Subject<SharedGame>[] = [];
  const injector = Injector.create({ providers: [{ provide: HttpClient, useValue: { get: () => { const response = new Subject<SharedGame>(); responses.push(response); return response; } } }] });
  const component = runInInjectionContext(injector, () => new EventShareComponent());
  component.eventId = 'first'; const stale = component.prepare(); component.eventId = 'second'; component.ngOnChanges();
  const data = { game: { id: 'second', title: 'Friday soccer' }, share: { url: 'https://soccer.example.test/games/second', title: 'Friday soccer / Join Game', description: 'Friday at 7 PM / USD 12.00 per player / 6 spots available', availability: '6 spots available', action: 'Join Game', open: true } } as SharedGame;
  responses[0].next(data); responses[0].complete(); await stale; assert.equal(component.data(), null);
  const fresh = component.prepare(); responses[1].next(data); responses[1].complete(); await fresh;
  assert.equal(component.data()?.share.availability, '6 spots available'); assert.ok(shareMessage(data.share).includes('USD 12.00')); assert.ok(shareMessage(data.share).includes('6 spots available'));
  await component.prepare(); assert.equal(component.open(), false); injector.destroy();
});


test('calendar uses venue dates and Monday weeks across DST and year boundaries', () => {
  assert.equal(venueDate('2027-01-01T01:00:00Z', 'America/New_York'), '2026-12-31');
  assert.equal(matchesCalendar('2027-01-01T01:00:00Z', 'America/New_York', { period: 'day', date: '2026-12-31' }), true);
  assert.equal(matchesCalendar('2026-11-02T04:30:00Z', 'America/New_York', { period: 'week', date: '2026-11-01' }), true);
  assert.equal(matchesCalendar('2026-11-02T05:00:00Z', 'America/New_York', { period: 'week', date: '2026-11-01' }), false);
  const calendar = new CalendarPickerComponent(); calendar.selection = { period: 'day', date: '2028-02-29' }; calendar.ngOnChanges();
  assert.equal(calendar.days().length, 42); assert.ok(calendar.days().some(day => day.key === '2028-02-29' && !day.outside));
  calendar.move(1); assert.match(calendar.title(), /March 2028/);
  let emitted: any; calendar.selectionChange.subscribe(value => emitted = value);
  calendar.selection = { period: 'week', date: '2028-02-29' }; calendar.choose('2028-03-07');
  assert.deepEqual(emitted, { period: 'week', date: '2028-03-07' });
});

test('My games payment queue includes unreported guest seats and excludes free, cancelled and reviewed seats', () => {
  const event = { title: 'Payment queue', startsAt: '2026-01-01T20:00:00Z', endsAt: '2026-01-01T21:00:00Z', status: 'COMPLETED', location: { name: 'Pitch', timezone: 'UTC' }, organizer: { displayName: 'Alex' } };
  const payment = { amountCents: 1200, status: 'PAID', playerPaid: true, organizerPaid: true };
  const host: any = { id: 'host', eventId: 'game', bookingId: 'party', guestNumber: 0, status: 'CONFIRMED', event, payment };
  const guest: any = { ...host, id: 'guest', guestNumber: 1, payment: { ...payment, playerPaid: null } };
  const seats: any[] = [host, guest];
  const injector = Injector.create({ providers: [{ provide: AuthService, useValue: {} }, { provide: RegistrationsStore, useValue: { seats: () => seats } }] });
  const component = runInInjectionContext(injector, () => new MyGamesComponent()); component.paymentFilter = 'needs';
  assert.equal(component.gameGroups()[1].games.length, 1);
  guest.payment.playerPaid = false; assert.equal(component.gameGroups()[1].games.length, 0);
  guest.payment.playerPaid = null; guest.payment.amountCents = 0; assert.equal(component.needsPayment(host), false);
  guest.payment.amountCents = 1200; guest.status = 'CANCELLED'; assert.equal(component.needsPayment(host), false);
  guest.status = 'CONFIRMED'; component.clearFilters(); component.calendar = { period: 'day', date: '2026-01-02' }; assert.equal(component.gameGroups()[1].games.length, 0);
});


test('workspace cards collapse, administrator review requires acknowledgement, and archived history stays protected', async () => {
  let profile: any = { id: 'admin', role: 'ADMINISTRATOR' }; const posts: any[] = [];
  const injector = Injector.create({ providers: [{ provide: AuthService, useValue: { profile: () => profile } }, { provide: HttpClient, useValue: { get: () => of([]), post: (url: string, body: unknown) => { posts.push({ url, body }); return of({}); } } }] });
  const component = runInInjectionContext(injector, () => new OrganizerComponent()); component.ngOnInit();
  assert.equal(component.eventScope(), 'mine'); assert.equal(component.expandedEvent(), ''); component.toggleEvent('event'); assert.equal(component.expandedEvent(), 'event'); component.toggleEvent('event'); assert.equal(component.expandedEvent(), '');
  const game: any = { id: 'event', organizerId: 'admin', status: 'PUBLISHED', startsAt: new Date(Date.now() + 86400000).toISOString(), deletedAt: new Date().toISOString(), reviewStatus: 'NEEDS_REVIEW' };
  assert.equal(component.canEdit(game), false); assert.equal(component.canShare(game), false); assert.equal(component.canCancel(game), false);
  component.startReviewCompletion(game); await component.completeReview(); assert.equal(posts.length, 0);
  component.playersHadOpportunity = true; await component.completeReview(); assert.deepEqual(posts[0], { url: '/api/organizer/events/event/review/complete', body: { playersHadOpportunity: true } });
  profile = { id: 'organizer', role: 'ORGANIZER' }; assert.equal(component.canComplete(game), false); component.startReviewCompletion(game); component.playersHadOpportunity = true; await component.completeReview(); assert.equal(posts.length, 1);
  injector.destroy();
});

test('location filters search names, addresses and city, filter media, and reset', () => {
  const injector = Injector.create({ providers: [{ provide: AuthService, useValue: {} }, { provide: HttpClient, useValue: {} }] });
  const component = runInInjectionContext(injector, () => new LocationsComponent());
  component.locations.set([{ id: 'a', name: 'West pitch', address: 'Main Street', city: 'Midland', timezone: 'UTC', photoUrl: 'https://example.invalid/a.jpg' }, { id: 'b', name: 'Arena', address: 'First Street', city: 'Bay City', timezone: 'UTC', mapEmbedUrl: 'https://www.google.com/maps/embed?pb=x' }]);
  component.search = 'main'; assert.equal(component.filteredLocations()[0].id, 'a'); component.search = ''; component.city = 'Bay City'; component.media = 'map'; assert.equal(component.filteredLocations()[0].id, 'b'); component.media = 'photo'; assert.equal(component.filteredLocations().length, 0); component.clearFilters(); assert.equal(component.filteredLocations().length, 2);
  assert.equal(readFileSync(resolve('src/app/my-games/my-games.component.html'), 'utf8').includes('class="panel game-filters" open'), false);
  injector.destroy();
});


test('co-organizer form preserves assignments while editing and includes them in event saves', async () => {
  const calls: any[] = []; const profile = { id: 'co', role: 'ORGANIZER' };
  const injector = Injector.create({ providers: [{ provide: AuthService, useValue: { profile: () => profile } }, { provide: HttpClient, useValue: { get: () => of([]), patch: (url: string, body: any) => { calls.push({ url, body }); return of({}); } } }] });
  const component = runInInjectionContext(injector, () => new OrganizerComponent());
  const game: any = { id: 'event', organizerId: 'owner', coOrganizerIds: ['co'], coOrganizers: [{ id: 'co', displayName: 'Co organizer', accountName: 'Co account' }], title: 'Shared game', status: 'DRAFT', location: { id: 'pitch' }, startsAt: '2030-01-01T20:00:00Z', endsAt: '2030-01-01T21:00:00Z', capacity: 12, priceCents: 0, maxGuestsPerUser: 1, cancellationCutoffHours: 12 };
  assert.equal(component.canEdit(game), true);
  const oldWindow = (globalThis as any).window; (globalThis as any).window = { scrollTo() {} };
  try { component.edit(game); assert.deepEqual(component.event.coOrganizerIds, ['co']); assert.equal(component.selectedOrganizers()[0].id, 'co'); component.selectOrganizer({ id: 'second', displayName: 'Second', accountName: 'Second' }); component.selectOrganizer({ id: 'second', displayName: 'Second', accountName: 'Second' }); assert.deepEqual(component.event.coOrganizerIds, ['co', 'second']); component.selectOrganizer({ id: 'owner', displayName: 'Owner', accountName: 'Owner' }); assert.equal(component.event.coOrganizerIds.length, 2); await component.createEvent(); assert.deepEqual(calls[0].body.coOrganizerIds, ['co', 'second']); assert.deepEqual(component.event.coOrganizerIds, []); }
  finally { (globalThis as any).window = oldWindow; injector.destroy(); }
});

test('team columns keep confirmed teams, unassigned players and waitlist separate and do not invent missing colors', () => {
  const injector = Injector.create({ providers: [{ provide: HttpClient, useValue: {} }] });
  const component = runInInjectionContext(injector, () => new PlayersComponent()); component.teamCount = 3; component.shirtColors = ['dark', 'light'];
  component.players.set([{ id: 'a', status: 'CONFIRMED', teamNumber: 1 }, { id: 'b', status: 'CONFIRMED', teamNumber: 2, isGuest: true }, { id: 'c', status: 'CONFIRMED', teamNumber: null }, { id: 'd', status: 'WAITLISTED', teamNumber: null }] as any);
  assert.deepEqual(component.teamNumbers(), [1, 2, 3]); assert.equal(component.startingColor(1), 'dark'); assert.equal(component.startingColor(2), 'light'); assert.equal(component.startingColor(3), null);
  assert.deepEqual(component.teamPlayers(2).map(player => player.id), ['b']); assert.deepEqual(component.teamPlayers(null).map(player => player.id), ['c']); assert.deepEqual(component.groupPlayers().map(player => player.id), ['d']); injector.destroy();
});


test('payment buttons render only validated profile links and hide cleared or unsafe methods', () => {
  const component = new PaymentLinksComponent(); component.venmoUrl = 'https://venmo.com/u/host'; component.cashAppUrl = 'https://cash.app/$host'; component.paypalUrl = 'https://www.paypal.com/paypalme/host';
  assert.deepEqual(component.methods().map(method => method.url), ['https://venmo.com/u/host', 'https://cash.app/$host', 'https://paypal.me/host']);
  component.cashAppUrl = 'https://cash.app.evil.invalid/$host'; component.venmoUrl = ''; assert.deepEqual(component.methods().map(method => method.key), ['paypal']); component.paypalUrl = null; assert.equal(component.methods().length, 0);
});


test('payment username fields build full profile URLs, avoid duplicate Cashtag prefixes, and clear optional methods', () => {
  const injector = Injector.create({ providers: [{ provide: AuthService, useValue: {} }, { provide: HttpClient, useValue: {} }] });
  const component = runInInjectionContext(injector, () => new OrganizerComponent());
  component.setPaymentUsername('venmo', '@SoccerHost'); component.setPaymentUsername('cashapp', '$SoccerHost'); component.setPaymentUsername('paypal', 'SoccerHost');
  assert.equal(component.event.organizerVenmoUrl, 'https://venmo.com/u/SoccerHost'); assert.equal(component.event.organizerCashAppUrl, 'https://cash.app/$SoccerHost'); assert.equal(component.event.organizerPaypalUrl, 'https://paypal.me/SoccerHost');
  component.event.organizerPaypalUrl = 'https://www.paypal.com/paypalme/ExistingHost'; assert.equal(component.paymentUsername('paypal'), 'ExistingHost');
  component.setPaymentUsername('cashapp', ''); assert.equal(component.event.organizerCashAppUrl, ''); assert.equal(component.paymentUsername('cashapp'), ''); injector.destroy();
});


test('event eligibility choices remain organizer-only and are included in creation payloads', async () => {
  const bodies: any[] = []; const injector = Injector.create({ providers: [{ provide: AuthService, useValue: { profile: () => ({ id: 'owner', role: 'ORGANIZER' }) } }, { provide: HttpClient, useValue: { get: () => of([]), post: (_url: string, body: any) => { bodies.push(body); return of({}); } } }] });
  const component = runInInjectionContext(injector, () => new OrganizerComponent()); component.event = { ...component.event, title: 'Game', locationId: 'pitch', startsAt: '2030-01-01T20:00:00Z', endsAt: '2030-01-01T21:00:00Z' }; component.skillRestricted = true; component.skillThreshold = 3; component.skillDirection = 'below'; await component.createEvent('PUBLISHED'); assert.equal(bodies[0].maximumSkillLevel, 3); assert.equal(bodies[0].minimumSkillLevel, null);
  component.skillRestricted = true; component.skillThreshold = 6; await component.createEvent('PUBLISHED'); assert.equal(bodies.length, 1);
  assert.ok(!JSON.stringify(howToGuides).includes('minimumSkillLevel')); injector.destroy();
});

test('audience reset drops restricted results and ignores stale list, facet and selected responses', async () => {
  const requests: Subject<any>[] = []; const injector = Injector.create({ providers: [{ provide: HttpClient, useValue: { get: () => { const response = new Subject<any>(); requests.push(response); return response; } } }, EventsStore] }); const store = injector.get(EventsStore);
  const list = store.load(), facets = store.loadFilters(), selected = store.loadSelected('game'); store.resetAudience();
  requests[0].next([{ id: 'old' }]); requests[0].complete(); requests[1].next({ locations: [{ id: 'old' }], organizers: [] }); requests[1].complete(); requests[2].next({ game: { id: 'old' } }); requests[2].complete(); await Promise.all([list, facets, selected]); assert.deepEqual(store.events(), []); assert.deepEqual(store.locations(), []); assert.equal(store.selectedGame(), null); injector.destroy();
});

test('mobile quick navigation ignores scroll jitter, hides downward, and returns upward or at the top', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const viewport = { scrollY: 0 };
  Object.defineProperty(globalThis, 'window', { configurable: true, value: viewport });
  try {
    const component: AppComponent = Object.assign(Object.create(AppComponent.prototype), {
      bottomNavigationHidden: signal(false), lastScrollPosition: 0, scrollTravel: 0
    });
    viewport.scrollY = 100; component.updateBottomNavigation(); assert.equal(component.bottomNavigationHidden(), true);
    viewport.scrollY = 97; component.updateBottomNavigation(); assert.equal(component.bottomNavigationHidden(), true);
    viewport.scrollY = 84; component.updateBottomNavigation(); assert.equal(component.bottomNavigationHidden(), false);
    viewport.scrollY = 110; component.updateBottomNavigation(); assert.equal(component.bottomNavigationHidden(), true);
    viewport.scrollY = 0; component.updateBottomNavigation(); assert.equal(component.bottomNavigationHidden(), false);
    viewport.scrollY = -10; component.updateBottomNavigation(); assert.equal(component.bottomNavigationHidden(), false);
  } finally {
    if (original) Object.defineProperty(globalThis, 'window', original); else Reflect.deleteProperty(globalThis, 'window');
  }
});

import { zelleRecipient } from '../src/payment-links';

test('Zelle details normalize recipients and copy only the recipient, with a clipboard fallback', async () => {
  assert.equal(zelleRecipient(' HOST@example.com '), 'host@example.com');
  assert.equal(zelleRecipient('(989) 555-0123'), '+19895550123');
  assert.equal(zelleRecipient('https://evil.invalid'), null);
  const component = new PaymentLinksComponent();
  assert.equal(component.recipient(), null);
  component.zelleContact = 'host@example.com'; assert.equal(component.recipient(), 'host@example.com');
  assert.deepEqual(component.methods(), []);
  const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const copied: string[] = [];
  try {
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { clipboard: { writeText: async (text: string) => { copied.push(text); } } } });
    await component.copyRecipient(); assert.deepEqual(copied, ['host@example.com']); assert.match(component.copyNotice(), /copied/);
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} });
    await component.copyRecipient(); assert.match(component.copyNotice(), /Select and copy/);
    component.zelleContact = ''; await component.copyRecipient(); assert.equal(component.recipient(), null);
  } finally {
    if (original) Object.defineProperty(globalThis, 'navigator', original); else Reflect.deleteProperty(globalThis, 'navigator');
  }
});

test('workspace starts upcoming and tab changes reset conflicting filters while clear preserves the tab', () => {
  const injector = Injector.create({ providers: [
    { provide: AuthService, useValue: { profile: () => ({ id: 'owner', role: 'ORGANIZER' }) } },
    { provide: HttpClient, useValue: { get: () => of([]) } }
  ] });
  try {
    const component = runInInjectionContext(injector, () => new OrganizerComponent());
    component.load = async () => {};
    assert.equal(component.eventHistory, 'upcoming'); assert.equal(component.eventScope(), 'mine');
    component.eventStatus = 'CANCELLED'; component.calendar = { period: 'day', date: '2026-01-01' };
    component.selectEventHistory('past'); assert.equal(component.eventReview, 'open'); assert.equal(component.eventStatus, ''); assert.equal(component.calendar.period, 'all');
    component.eventReview = 'completed'; component.clearEventFilters(); assert.equal(component.eventHistory, 'past'); assert.equal(component.eventReview, 'open');
    component.selectEventHistory('all'); assert.equal(component.eventReview, ''); component.clearEventFilters(); assert.equal(component.eventHistory, 'all');
    component.selectEventHistory('upcoming'); assert.equal(component.eventReview, '');
  } finally { injector.destroy(); }
});

test('cancelled booking labels distinguish player, organizer and event cancellation', () => {
  const component = Object.create(MyGamesComponent.prototype) as MyGamesComponent;
  assert.equal(component.bookingLabel({ status: 'CANCELLED', cancellationSource: 'PLAYER' } as any), 'You Cancelled');
  assert.equal(component.bookingLabel({ status: 'CANCELLED', cancellationSource: 'ORGANIZER' } as any), 'Removed by organizer');
  assert.equal(component.bookingLabel({ status: 'CANCELLED', cancellationSource: 'EVENT' } as any), 'Booking cancelled with event');
  assert.equal(component.bookingLabel({ status: 'CANCELLED' } as any), 'Booking cancelled');
  assert.equal(component.bookingLabel({ status: 'CONFIRMED' } as any), 'confirmed');
});

test('My games views separate future bookings, outstanding party reports and past paid participation', () => {
  const now = Date.now();
  const make = (id: string, start: number, end: number, status = 'CONFIRMED', paid: boolean | null = null, amount = 1000) => ({ id, eventId: id, bookingId: id, guestNumber: 0, status, payment: { amountCents: amount, status: 'UNPAID', playerPaid: paid }, event: { status: 'PUBLISHED', title: id, startsAt: new Date(now + start).toISOString(), endsAt: new Date(now + end).toISOString(), location: { name: 'Pitch', timezone: 'UTC' }, organizer: { displayName: 'Organizer' } } }) as Seat;
  const future = make('future', 3600000, 7200000), waiting = make('waiting', 3600000, 7200000, 'WAITLISTED');
  const ongoing = make('ongoing', -3600000, 3600000), needs = make('needs', -7200000, -3600000);
  const paid = make('paid', -7200000, -3600000, 'CONFIRMED', true), unpaid = make('unpaid', -7200000, -3600000, 'CONFIRMED', false);
  const cancelled = make('cancelled', -7200000, -3600000, 'CANCELLED', true), free = make('free', -7200000, -3600000, 'CONFIRMED', null, 0);
  const guest = { ...needs, id: 'guest', eventId: paid.eventId, bookingId: paid.bookingId, guestNumber: 1 };
  const seats = [future, waiting, ongoing, needs, paid, unpaid, cancelled, free, guest];
  const injector = Injector.create({ providers: [{ provide: AuthService, useValue: {} }, { provide: RegistrationsStore, useValue: { seats: () => seats } }] });
  try {
    const component = runInInjectionContext(injector, () => new MyGamesComponent());
    const ids = () => component.gameGroups().filter(group => component.groupVisible(group.id)).flatMap(group => group.games.map(game => game.id)).sort();
    assert.equal(component.bookingStatus, 'active'); assert.ok(!ids().includes('cancelled')); assert.ok(ids().includes('waiting'));
    component.bookingStatus = ''; assert.ok(ids().includes('cancelled'));
    component.bookingStatus = 'CANCELLED'; assert.deepEqual(ids(), ['cancelled']);
    component.clearFilters(); assert.equal(component.bookingStatus, 'active');
    component.selectView('upcoming'); assert.deepEqual(ids(), ['future', 'waiting']);
    component.selectView('payments'); assert.deepEqual(ids(), ['needs', 'paid']);
    guest.payment = { ...guest.payment!, playerPaid: false }; assert.deepEqual(ids(), ['needs']);
    component.selectView('completed'); assert.deepEqual(ids(), ['paid']);
    paid.event.status = 'CANCELLED'; assert.deepEqual(ids(), []); paid.event.status = 'PUBLISHED';
    component.revealHistory = true; component.ngOnChanges(); assert.equal(component.view(), 'payments');
    component.clearFilters(); assert.equal(component.view(), 'payments'); assert.equal(component.bookingStatus, 'active');
  } finally { injector.destroy(); }
});

test('My games navigation opens the complete resource and shortcuts target views on an already mounted page', () => {
  const visits: string[] = [];
  const component = Object.assign(Object.create(AppComponent.prototype), {
    myGamesView: signal('completed'), myGamesRequest: signal(null), myGamesMenuOpen: signal(false), myGamesRequestId: 0,
    navigate: (page: string) => { visits.push(page); component.myGamesMenuOpen.set(false); }
  }) as AppComponent;
  component.openMyGames(); assert.equal(component.myGamesView(), 'all'); assert.equal(component.myGamesRequest()!.view, 'all');
  component.openMyGames('payments'); assert.equal(component.myGamesRequest()!.view, 'payments');
  const first = component.myGamesRequest()!.id; component.openMyGames('payments'); assert.ok(component.myGamesRequest()!.id > first);
  component.toggleMyGamesMenu(); assert.equal(component.myGamesMenuOpen(), true); assert.equal(component.myGamesView(), 'all');
  component.openMyGames('upcoming'); assert.equal(component.myGamesMenuOpen(), false); assert.equal(component.myGamesView(), 'upcoming');
  assert.ok(visits.every(page => page === 'mygames'));
});

test('My games accepts navigation requests and synchronizes selected tabs with the nav', () => {
  const injector = Injector.create({ providers: [{ provide: AuthService, useValue: {} }, { provide: RegistrationsStore, useValue: {} }] });
  try {
    const component = runInInjectionContext(injector, () => new MyGamesComponent());
    const changes: string[] = []; const subscription = component.viewChanged.subscribe(view => changes.push(view));
    component.viewRequest = { view: 'upcoming', id: 1 }; component.ngOnChanges(); assert.equal(component.view(), 'upcoming');
    component.selectView('completed'); assert.equal(changes.at(-1), 'completed');
    component.viewRequest = { view: 'all', id: 2 }; component.ngOnChanges(); assert.equal(component.view(), 'all');
    subscription.unsubscribe();
  } finally { injector.destroy(); }
});
