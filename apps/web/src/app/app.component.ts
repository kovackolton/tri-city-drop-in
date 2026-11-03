import { sharedEventId } from '../event-sharing';
import { EventCardComponent } from './event-card/event-card.component';
import { WaiverStore } from '../waiver.store';
import { StrikesStore } from '../strikes.store';
import { ThemeService } from '../theme.service';
import { IconComponent } from './icon/icon.component';
import { Component, effect, inject, OnInit, OnDestroy, signal, untracked } from '@angular/core';
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
import { EventsStore, defaultGameFilters } from '../events.store';

@Component({
  selector: 'app-root', imports: [IconComponent, EventCardComponent, FormsModule, ProfileComponent, AvatarComponent, OrganizerComponent, MyGamesComponent, SignInComponent, AdminUsersComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit, OnDestroy {
  readonly waiver = inject(WaiverStore);
  readonly profileSectionRequest = signal<{ section: 'strikes' | 'waiver'; id: number } | null>(null);
  private profileRequestId = 0;
  readonly strikes = inject(StrikesStore);
  readonly paymentEventId = signal('');
  readonly theme = inject(ThemeService);
  readonly notifications = inject(NotificationsStore);
  private poll?: ReturnType<typeof setInterval>;
  readonly store = inject(EventsStore);
  readonly auth = inject(AuthService);
  readonly registrations = inject(RegistrationsStore);
  readonly page = signal<'games' | 'mygames' | 'profile' | 'organizer' | 'notifications' | 'signin' | 'users'>('games');
  readonly userRequestsOnly = signal(false);
  readonly time = eventTime;
  filters = defaultGameFilters();
  cities() { return [...new Set(this.store.locations().map(location => location.city).filter((city): city is string => !!city))].sort((a, b) => a.localeCompare(b)); }
  applyFilters() { void this.store.load(this.filters); }
  resetFilters() { this.filters = defaultGameFilters(); this.applyFilters(); }
  refreshGames() { void this.store.load(); void this.store.loadFilters(); if (this.store.selectedId()) void this.store.loadSelected(this.store.selectedId()); }
  refreshAfterJoin() { void this.store.load(); if (this.store.selectedId()) void this.store.loadSelected(this.store.selectedId()); }
  listedGames() { return this.store.events().filter(game => game.id !== this.store.selectedId()); }
  dismissSharedGame() {
    this.store.clearSelected(); const url = new URL(window.location.href); url.searchParams.delete('event'); window.history.replaceState(null, '', url.pathname + url.search + url.hash);
  }
  private restoreSharedGame() {
    const id = this.store.selectedId() || sharedEventId(window.location.search); if (id) void this.store.loadSelected(id);
  }
  quickDate(period: 'day' | 'week') { this.filters = { ...this.filters, period, date: defaultGameFilters().date }; this.applyFilters(); }
  constructor() {
    effect(() => {
      const id = this.auth.profile()?.id;
      untracked(() => {
        this.registrations.reset();
        this.notifications.reset(); this.strikes.reset(); this.waiver.reset();
        if (id) {
          void this.notifications.load(); void this.strikes.load(); void this.waiver.load(); void this.registrations.load();
          if (this.auth.profile()?.profileCompletedAt === null) this.navigate('profile');
          else if ((this.page() === 'users' && this.auth.profile()?.role !== 'ADMINISTRATOR') || (this.page() === 'organizer' && this.auth.profile()?.role === 'PLAYER')) this.navigate('games');
          else if (this.page() === 'signin') this.navigate('games');
        }
      });
    });
  }
  ngOnInit() { this.restoreSharedGame(); void this.store.load(); void this.store.loadFilters(); this.poll = setInterval(() => { void this.notifications.load(); void this.strikes.load(); }, 30000); }
  ngOnDestroy() { if (this.poll) clearInterval(this.poll); }
  navigate(page: 'games' | 'mygames' | 'profile' | 'organizer' | 'notifications' | 'signin' | 'users') { this.profileSectionRequest.set(null); this.page.set(page); if (page === 'notifications') void this.notifications.load(); if (page === 'games') { this.restoreSharedGame(); requestAnimationFrame(() => document.getElementById('shared-game')?.scrollIntoView({ block: 'start' })); void this.store.load(); void this.store.loadFilters(); if (this.auth.profile()) void this.registrations.load(); } if (page === 'mygames') void this.registrations.load(); }
  openProfileSection(section: 'strikes' | 'waiver') {
    this.profileSectionRequest.set({ section, id: ++this.profileRequestId }); this.page.set('profile');
    requestAnimationFrame(() => { const target = document.getElementById(section + '-section'); target?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }); target?.focus({ preventScroll: true }); });
  }
  async reviewPayment(eventId: string | null | undefined) {
    this.paymentEventId.set(eventId ?? ''); this.page.set('mygames'); await this.registrations.load(eventId ?? undefined);
    requestAnimationFrame(() => { const card = document.getElementById('my-game-' + eventId); card?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }); card?.focus({ preventScroll: true }); });
  }
  reviewOrganizerRequests() { this.userRequestsOnly.set(true); this.navigate('users'); }
  openUsers() { this.userRequestsOnly.set(false); this.navigate('users'); }
  async logout() { await this.auth.logout(); this.page.set('games'); }
}
