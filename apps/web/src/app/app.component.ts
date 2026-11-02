import { Component, effect, inject, OnInit, signal } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService, message } from '../auth.service';
import { OrganizerComponent } from './organizer/organizer.component';
import { eventTime } from '../models';
import { RegistrationsStore } from '../registrations.store';
import { SignupComponent } from './signup/signup.component';
import { MyGamesComponent } from './my-games/my-games.component';

import { EventsStore } from '../events.store';

@Component({
  selector: 'app-root', imports: [CurrencyPipe, FormsModule, OrganizerComponent, SignupComponent, MyGamesComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit {
  readonly store = inject(EventsStore);
  readonly auth = inject(AuthService);
  readonly registrations = inject(RegistrationsStore);
  readonly page = signal<'games' | 'mygames' | 'profile' | 'organizer'>('games');
  readonly showLogin = signal(false);
  readonly saving = signal(false);
  readonly profileMessage = signal('');
  readonly time = eventTime;
  displayName = '';
  constructor() {
    effect(() => {
      const id = this.auth.profile()?.id;
      this.registrations.reset();
      if (id) void this.registrations.load();
    });
  }
  ngOnInit() { void this.store.load(); }
  navigate(page: 'games' | 'mygames' | 'profile' | 'organizer') { this.page.set(page); this.profileMessage.set(''); this.displayName = this.auth.profile()?.displayName ?? ''; if (page === 'games') { void this.store.load(); if (this.auth.profile()) void this.registrations.load(); } if (page === 'mygames') void this.registrations.load(); }
  async logout() { await this.auth.logout(); this.page.set('games'); this.showLogin.set(false); }
  async saveProfile() {
    if (this.saving()) return;
    this.saving.set(true); this.profileMessage.set('');
    try { await this.auth.saveName(this.displayName); this.profileMessage.set('Profile saved.'); }
    catch (error) { this.profileMessage.set(message(error)); }
    finally { this.saving.set(false); }
  }
}
