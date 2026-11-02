import { LocationMapComponent } from './location-map/location-map.component';
import { LocationThumbnailComponent } from './location-thumbnail/location-thumbnail.component';
import { Component, effect, inject, OnInit, OnDestroy, signal, untracked } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { AuthService } from '../auth.service';
import { OrganizerComponent } from './organizer/organizer.component';
import { eventTime } from '../models';
import { RegistrationsStore } from '../registrations.store';
import { SignupComponent } from './signup/signup.component';
import { SignInComponent } from './sign-in/sign-in.component';
import { AdminUsersComponent } from './admin-users/admin-users.component';
import { ProfileComponent } from './profile/profile.component';
import { AvatarComponent } from './avatar/avatar.component';
import { MyGamesComponent } from './my-games/my-games.component';

import { NotificationsStore } from '../notifications.store';
import { EventsStore } from '../events.store';

@Component({
  selector: 'app-root', imports: [CurrencyPipe, ProfileComponent, AvatarComponent, OrganizerComponent, SignupComponent, MyGamesComponent, SignInComponent, LocationMapComponent, LocationThumbnailComponent, AdminUsersComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit, OnDestroy {
  readonly notifications = inject(NotificationsStore);
  private poll?: ReturnType<typeof setInterval>;
  readonly store = inject(EventsStore);
  readonly auth = inject(AuthService);
  readonly registrations = inject(RegistrationsStore);
  readonly page = signal<'games' | 'mygames' | 'profile' | 'organizer' | 'notifications' | 'signin' | 'users'>('games');
  readonly userRequestsOnly = signal(false);
  readonly time = eventTime;
  constructor() {
    effect(() => {
      const id = this.auth.profile()?.id;
      untracked(() => {
        this.registrations.reset();
        this.notifications.reset();
        if (id) {
          void this.notifications.load(); void this.registrations.load();
          if (this.auth.profile()?.profileCompletedAt === null) this.navigate('profile');
          else if (this.page() === 'signin') this.navigate('games');
        }
      });
    });
  }
  ngOnInit() { void this.store.load(); this.poll = setInterval(() => { void this.notifications.load(); }, 30000); }
  ngOnDestroy() { if (this.poll) clearInterval(this.poll); }
  navigate(page: 'games' | 'mygames' | 'profile' | 'organizer' | 'notifications' | 'signin' | 'users') { this.page.set(page); if (page === 'notifications') void this.notifications.load(); if (page === 'games') { void this.store.load(); if (this.auth.profile()) void this.registrations.load(); } if (page === 'mygames') void this.registrations.load(); }
  reviewOrganizerRequests() { this.userRequestsOnly.set(true); this.navigate('users'); }
  openUsers() { this.userRequestsOnly.set(false); this.navigate('users'); }
  async logout() { await this.auth.logout(); this.page.set('games'); }
}
