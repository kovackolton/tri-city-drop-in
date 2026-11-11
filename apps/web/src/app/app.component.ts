import { siteContent } from './site-content';
import { CalendarPickerComponent } from './calendar-picker/calendar-picker.component';
import { CalendarSelection } from '../calendar';
import { HowToComponent } from './how-to/how-to.component';
import { howToGuideFromHash } from './how-to/how-to-content';
import { sharedEventId, privateGameTarget } from '../event-sharing';
import { EventCardComponent } from './event-card/event-card.component';
import { WaiverStore } from '../waiver.store';
import { StrikesStore } from '../strikes.store';
import { ThemeService } from '../theme.service';
import { IconComponent } from './icon/icon.component';
import { Component, ElementRef, ViewChild, HostListener, effect, inject, AfterViewInit, OnInit, OnDestroy, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../auth.service';
import { OrganizerComponent } from './organizer/organizer.component';
import { eventTime } from '../models';
import { RegistrationsStore } from '../registrations.store';
import { SignInComponent } from './sign-in/sign-in.component';
import { AdminUsersComponent } from './admin-users/admin-users.component';
import { ProfileComponent } from './profile/profile.component';
import { AvatarComponent } from './avatar/avatar.component';
import { MyGamesComponent } from './my-games/my-games.component';

import { NotificationsStore } from '../notifications.store';
import { EventsStore, defaultGameFilters, activeGameFilterCount } from '../events.store';

@Component({
  selector: 'app-root', imports: [CalendarPickerComponent, HowToComponent, IconComponent, EventCardComponent, FormsModule, ProfileComponent, AvatarComponent, OrganizerComponent, MyGamesComponent, SignInComponent, AdminUsersComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit, AfterViewInit, OnDestroy {
  readonly siteContent = siteContent;
  readonly siteContacts = siteContent.contacts.map(contact => ({
    ...contact, name: contact.name?.trim() || '', email: contact.email?.trim(), phone: contact.phone?.trim(), phoneLink: contact.phoneLink?.trim(), address: contact.address?.trim(), hours: contact.hours?.trim(), responseTime: contact.responseTime?.trim(),
    socialLinks: [
      { name: 'Facebook', icon: 'facebook' as const, value: contact.facebookUrl },
      { name: 'Instagram', icon: 'instagram' as const, value: contact.instagramUrl },
    ].flatMap(({ name, icon, value }) => {
      try {
        if (!value?.trim()) return [];
        const url = new URL(value.trim());
        return url.protocol === 'https:' && !url.username && !url.password ? [{ name, icon, url: url.href }] : [];
      } catch { return []; }
    }),
  })).filter(contact => !!(contact.name || contact.email || contact.phone || contact.address || contact.hours || contact.responseTime || contact.socialLinks.length));
  readonly copyrightYear = new Date().getFullYear();
  private readonly hostElement = inject<ElementRef<HTMLElement>>(ElementRef);
  private navigationObserver?: ResizeObserver;
  @ViewChild('appSidebar') sidebarElement?: ElementRef<HTMLElement>;
  @ViewChild('appHeader') headerElement?: ElementRef<HTMLElement>;
  readonly waiver = inject(WaiverStore);
  readonly profileSectionRequest = signal<{ section: 'strikes' | 'waiver'; id: number } | null>(null);
  private profileRequestId = 0;
  readonly strikes = inject(StrikesStore);
  readonly paymentEventId = signal('');
  readonly myGamesView = signal<'all' | 'upcoming' | 'payments' | 'completed'>('all');
  readonly myGamesRequest = signal<{ view: 'all' | 'upcoming' | 'payments' | 'completed'; id: number } | null>(null);
  readonly myGamesMenuOpen = signal(false);
  private myGamesRequestId = 0;
  openMyGames(view: 'all' | 'upcoming' | 'payments' | 'completed' = 'all') {
    this.navigate('mygames'); this.myGamesView.set(view);
    this.myGamesRequest.set({ view, id: ++this.myGamesRequestId });
  }
  toggleMyGamesMenu() {
    const show = !this.myGamesMenuOpen();
    this.openMyGames(); this.myGamesMenuOpen.set(show);
  }
  @HostListener('document:click', ['$event']) closeMyGamesOnOutsideClick(event: MouseEvent) {
    if (this.myGamesMenuOpen() && !(event.target instanceof Element && event.target.closest('.my-games-menu, .my-games-trigger'))) this.myGamesMenuOpen.set(false);
  }
  @HostListener('window:keydown.escape') closeMyGamesMenu() {
    if (!this.myGamesMenuOpen()) return;
    this.myGamesMenuOpen.set(false);
    const trigger = Array.from(document.querySelectorAll<HTMLElement>('.my-games-trigger')).find(element => element.getClientRects().length > 0);
    trigger?.focus();
  }

  readonly theme = inject(ThemeService);
  readonly notifications = inject(NotificationsStore);
  private poll?: ReturnType<typeof setInterval>;
  readonly store = inject(EventsStore);
  readonly auth = inject(AuthService);
  readonly registrations = inject(RegistrationsStore);
  readonly page = signal<'games' | 'mygames' | 'profile' | 'organizer' | 'notifications' | 'signin' | 'users' | 'privategame' | 'howto'>('games');
  readonly howToGuideId = signal('start');
  @HostListener('window:hashchange') restoreHowToLocation() { const id = howToGuideFromHash(window.location.hash); if (id) { this.howToGuideId.set(id); this.page.set('howto'); this.closeMobileNavigation(); } }
  updateHowToLocation(id: string) { this.howToGuideId.set(id); const url = new URL(window.location.href); url.hash = 'how-to/' + id; window.history.replaceState(null, '', url.pathname + url.search + url.hash); }
  readonly mobileNavigationOpen = signal(false);
  readonly bottomNavigationHidden = signal(false);
  private lastScrollPosition = 0;
  private scrollTravel = 0;
  @HostListener('window:scroll') updateBottomNavigation() {
    const position = Math.max(0, window.scrollY);
    const delta = position - this.lastScrollPosition;
    this.lastScrollPosition = position;
    if (position < 32) { this.scrollTravel = 0; this.bottomNavigationHidden.set(false); return; }
    if (Math.sign(delta) !== Math.sign(this.scrollTravel)) this.scrollTravel = 0;
    this.scrollTravel += delta;
    if (Math.abs(this.scrollTravel) >= 12) { this.bottomNavigationHidden.set(this.scrollTravel > 0); this.scrollTravel = 0; }
  }

  @ViewChild('accountMenu') accountMenu?: ElementRef<HTMLDetailsElement>;
  pageLabel() {
    if (this.page() === 'organizer') return this.auth.profile()?.role === 'ADMINISTRATOR' ? 'Administrator workspace' : 'Organizer workspace';
    return { games: 'Upcoming games', mygames: 'My games', profile: 'My profile', notifications: 'Notifications', signin: 'Sign in', users: 'Users', organizer: 'Organizer workspace', privategame: 'Private game', howto: 'How to' }[this.page()];
  }
  toggleMobileNavigation() { this.mobileNavigationOpen.update(open => !open); }
  closeMobileNavigation(restoreFocus = false) {
    if (this.accountMenu) this.accountMenu.nativeElement.open = false;
    if (!this.mobileNavigationOpen()) return;
    this.mobileNavigationOpen.set(false);
    if (restoreFocus) document.getElementById('mobile-navigation-toggle')?.focus();
  }
  readonly userRequestsOnly = signal(false);
  readonly time = eventTime;
  filters = defaultGameFilters();
  readonly filtersOpen = signal(false);
  activeFilterCount() { return activeGameFilterCount(this.store.filters()); }
  cities() { return [...new Set(this.store.locations().map(location => location.city).filter((city): city is string => !!city))].sort((a, b) => a.localeCompare(b)); }
  calendarChanged(selection: CalendarSelection) { this.filters = { ...this.filters, ...selection }; this.applyFilters(); }
  applyFilters() { this.filtersOpen.set(false); void this.store.load(this.filters); }
  resetFilters() { this.filters = defaultGameFilters(); this.applyFilters(); }
  refreshGames() { void this.store.load(); void this.store.loadFilters(); if (this.store.selectedId()) void this.store.loadSelected(this.store.selectedId(), this.store.selectedInviteToken()); }
  refreshAfterJoin() { void this.store.load(); if (this.store.selectedId()) void this.store.loadSelected(this.store.selectedId(), this.store.selectedInviteToken()); }
  listedGames() { return this.store.events().filter(game => game.id !== this.store.selectedId()); }
  dismissSharedGame() {
    this.store.clearSelected(); const url = new URL(window.location.href); url.searchParams.delete('event'); url.searchParams.delete('privateGame'); url.searchParams.delete('invite'); window.history.replaceState(null, '', url.pathname + url.search + url.hash); this.page.set('games');
  }
  private restoreSharedGame() {
    const privateTarget = privateGameTarget(window.location.search, window.location.pathname);
    if (privateTarget && window.location.pathname.startsWith('/private-game/')) {
      const url = new URL(window.location.href); url.pathname = '/';
      url.searchParams.set('privateGame', privateTarget.id); url.searchParams.set('invite', privateTarget.invite);
      window.history.replaceState(null, '', url.pathname + url.search + url.hash);
    }
    const invite = this.store.selectedInviteToken() || privateTarget?.invite || '';
    const id = this.store.selectedId() || privateTarget?.id || sharedEventId(window.location.search);
    if (id) { if (invite) this.page.set('privategame'); void this.store.loadSelected(id, invite); }
  }
  returnToSharedOrGames() { this.navigate(this.store.selectedInviteToken() ? 'privategame' : 'games'); }
  quickDate(period: 'day' | 'week') { this.filters = { ...this.filters, period, date: defaultGameFilters().date }; this.applyFilters(); }
  constructor() {
    effect(() => {
      const id = this.auth.profile()?.id;
      untracked(() => {
        this.store.resetAudience(); void this.store.load(); void this.store.loadFilters();
        if (this.store.selectedId()) void this.store.loadSelected(this.store.selectedId(), this.store.selectedInviteToken());
        this.registrations.reset();
        this.notifications.reset(); this.strikes.reset(); this.waiver.reset();
        if (id) {
          void this.notifications.load(); void this.strikes.load(); void this.waiver.load(); void this.registrations.load();
          if (this.auth.profile()?.profileCompletedAt === null) this.navigate('profile');
          else if ((this.page() === 'users' && this.auth.profile()?.role !== 'ADMINISTRATOR') || (this.page() === 'organizer' && this.auth.profile()?.role === 'PLAYER')) this.navigate('games');
          else if (this.page() === 'signin') this.returnToSharedOrGames();
        }
      });
    });
  }
  ngOnInit() { this.restoreSharedGame(); this.restoreHowToLocation(); void this.store.load(); void this.store.loadFilters(); this.poll = setInterval(() => { void this.notifications.load(); void this.strikes.load(); }, 30000); }
  ngAfterViewInit() {
    const updateOffsets = () => {
      for (const [name, element] of [['--app-sidebar-height', this.sidebarElement], ['--app-header-height', this.headerElement]] as const) {
        if (element) this.hostElement.nativeElement.style.setProperty(name, `${Math.ceil(element.nativeElement.getBoundingClientRect().height)}px`);
      }
    };
    updateOffsets();
    if (typeof ResizeObserver !== 'undefined') {
      this.navigationObserver = new ResizeObserver(updateOffsets);
      if (this.sidebarElement) this.navigationObserver.observe(this.sidebarElement.nativeElement);
      if (this.headerElement) this.navigationObserver.observe(this.headerElement.nativeElement);
    }
  }
  ngOnDestroy() { this.navigationObserver?.disconnect(); if (this.poll) clearInterval(this.poll); }
  navigate(page: 'games' | 'mygames' | 'profile' | 'organizer' | 'notifications' | 'signin' | 'users' | 'privategame' | 'howto') { this.myGamesMenuOpen.set(false); if (page === 'mygames') { this.paymentEventId.set(''); this.myGamesView.set('all'); this.myGamesRequest.set({ view: 'all', id: ++this.myGamesRequestId }); } this.bottomNavigationHidden.set(false); const fromMobileMenu = this.mobileNavigationOpen(); this.closeMobileNavigation(); this.profileSectionRequest.set(null); this.page.set(page); if (typeof window !== 'undefined') { if (page === 'howto') this.updateHowToLocation(this.howToGuideId()); else if (window.location.hash.startsWith('#how-to')) { const url = new URL(window.location.href); url.hash = ''; window.history.replaceState(null, '', url.pathname + url.search); } } if (fromMobileMenu) requestAnimationFrame(() => document.getElementById('main-content')?.focus({ preventScroll: true })); if (page === 'games' && this.store.selectedInviteToken()) this.dismissSharedGame(); if (page === 'privategame' && this.store.selectedId()) void this.store.loadSelected(this.store.selectedId(), this.store.selectedInviteToken()); if (page === 'notifications') void this.notifications.load(); if (page === 'games') { this.restoreSharedGame(); requestAnimationFrame(() => document.getElementById('shared-game')?.scrollIntoView({ block: 'start' })); void this.store.load(); void this.store.loadFilters(); if (this.auth.profile()) void this.registrations.load(); } if (page === 'mygames') void this.registrations.load(); }
  openProfileSection(section: 'strikes' | 'waiver') {
    this.closeMobileNavigation();
    this.profileSectionRequest.set({ section, id: ++this.profileRequestId }); this.page.set('profile');
    requestAnimationFrame(() => { const target = document.getElementById(section + '-section'); target?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }); target?.focus({ preventScroll: true }); });
  }
  async reviewPayment(eventId: string | null | undefined) {
    this.closeMobileNavigation(); this.myGamesMenuOpen.set(false); this.myGamesView.set('payments'); this.myGamesRequest.set({ view: 'payments', id: ++this.myGamesRequestId }); this.paymentEventId.set(eventId ?? ''); this.page.set('mygames'); await this.registrations.load(eventId ?? undefined);
    requestAnimationFrame(() => { const card = document.getElementById('my-game-' + eventId); card?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }); card?.focus({ preventScroll: true }); });
  }
  reviewOrganizerRequests() { this.userRequestsOnly.set(true); this.navigate('users'); }
  openUsers() { this.userRequestsOnly.set(false); this.navigate('users'); }
  async logout() { this.closeMobileNavigation(); await this.auth.logout(); this.dismissSharedGame(); }
}
