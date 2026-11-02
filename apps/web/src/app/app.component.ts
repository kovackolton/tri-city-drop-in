import { Component, effect, inject, OnInit, OnDestroy, signal, untracked } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService, message } from '../auth.service';
import { OrganizerComponent } from './organizer/organizer.component';
import { eventTime } from '../models';
import { RegistrationsStore } from '../registrations.store';
import { SignupComponent } from './signup/signup.component';
import { SignInComponent } from './sign-in/sign-in.component';
import { MyGamesComponent } from './my-games/my-games.component';

import { NotificationsStore } from '../notifications.store';
import { EventsStore } from '../events.store';

@Component({
  selector: 'app-root', imports: [CurrencyPipe, FormsModule, OrganizerComponent, SignupComponent, MyGamesComponent, SignInComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit, OnDestroy {
  readonly notifications = inject(NotificationsStore);
  private poll?: ReturnType<typeof setInterval>;
  readonly store = inject(EventsStore);
  readonly auth = inject(AuthService);
  readonly registrations = inject(RegistrationsStore);
  readonly page = signal<'games' | 'mygames' | 'profile' | 'organizer' | 'notifications' | 'signin'>('games');
  readonly saving = signal(false);
  readonly profileMessage = signal('');
  readonly time = eventTime;
  displayName = '';
  constructor() {
    effect(() => {
      const id = this.auth.profile()?.id;
      untracked(() => {
        this.registrations.reset();
        this.notifications.reset();
        if (id) {
          void this.notifications.load(); void this.registrations.load();
          if (this.page() === 'signin') this.navigate('games');
        }
      });
    });
  }
  ngOnInit() { void this.store.load(); this.poll = setInterval(() => { void this.notifications.load(); }, 30000); }
  ngOnDestroy() { if (this.poll) clearInterval(this.poll); }
  navigate(page: 'games' | 'mygames' | 'profile' | 'organizer' | 'notifications' | 'signin') { this.page.set(page); if (page === 'notifications') void this.notifications.load(); this.profileMessage.set(''); this.displayName = this.auth.profile()?.displayName ?? ''; if (page === 'games') { void this.store.load(); if (this.auth.profile()) void this.registrations.load(); } if (page === 'mygames') void this.registrations.load(); }
  async logout() { await this.auth.logout(); this.page.set('games'); }
  async saveProfile() {
    if (this.saving()) return;
    this.saving.set(true); this.profileMessage.set('');
    try { await this.auth.saveName(this.displayName); this.profileMessage.set('Profile saved.'); }
    catch (error) { this.profileMessage.set(message(error)); }
    finally { this.saving.set(false); }
  }
}
