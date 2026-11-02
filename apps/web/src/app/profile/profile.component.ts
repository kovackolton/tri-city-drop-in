import { Component, effect, inject, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { AuthService, message } from '../../auth.service';
import { AvatarComponent } from '../avatar/avatar.component';
import { avatarColors } from '../../avatar';
@Component({ selector: 'app-profile', imports: [FormsModule, AvatarComponent], templateUrl: './profile.component.html' })
export class ProfileComponent {
  readonly auth = inject(AuthService);
  readonly colors = avatarColors;
  readonly saving = signal(false);
  readonly notice = signal('');
  readonly error = signal('');
  displayName = ''; contactEmail = ''; phone = ''; avatarColor = 'emerald'; useGooglePhoto = true;
  constructor() {
    effect(() => {
      const profile = this.auth.profile();
      this.displayName = profile?.displayName ?? ''; this.contactEmail = profile?.contactEmail ?? '';
      this.phone = profile?.phone ?? ''; this.avatarColor = profile?.avatarColor ?? 'emerald'; this.useGooglePhoto = profile?.useGooglePhoto ?? true;
    });
  }
  async save(form: NgForm) {
    if (this.saving()) return;
    if (form.invalid) { form.control.markAllAsTouched(); this.error.set('Review your name, email and phone number.'); return; }
    this.saving.set(true); this.notice.set(''); this.error.set('');
    try {
      await this.auth.saveProfile({ displayName: this.displayName, contactEmail: this.contactEmail.trim() || null, phone: this.phone.trim() || null, avatarColor: this.avatarColor, useGooglePhoto: this.useGooglePhoto });
      this.notice.set('Profile saved.');
    } catch (error) { this.error.set(message(error)); }
    finally { this.saving.set(false); }
  }
}
