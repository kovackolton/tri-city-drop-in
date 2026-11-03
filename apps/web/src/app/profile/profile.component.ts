import { Component, EventEmitter, Input, OnInit, Output, effect, inject, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AuthService, message } from '../../auth.service';
import { AvatarComponent } from '../avatar/avatar.component';
import { WaiverPanelComponent } from '../waiver-panel/waiver-panel.component';
import { StrikePanelComponent } from '../strike-panel/strike-panel.component';
import { avatarColors } from '../../avatar';
interface OrganizerRequest { id: string; status: 'PENDING' | 'GRANTED' | 'CLEARED'; }
@Component({ selector: 'app-profile', imports: [FormsModule, AvatarComponent, StrikePanelComponent, WaiverPanelComponent], templateUrl: './profile.component.html' })
export class ProfileComponent implements OnInit {
  @Input() sectionRequest: { section: 'strikes' | 'waiver'; id: number } | null = null;
  readonly auth = inject(AuthService);
  private readonly http = inject(HttpClient);
  @Output() completed = new EventEmitter<void>();
  readonly colors = avatarColors;
  readonly saving = signal(false);
  readonly notice = signal('');
  readonly error = signal('');
  readonly request = signal<OrganizerRequest | null>(null);
  readonly requesting = signal(false);
  readonly requestLoading = signal(false);
  readonly requestError = signal('');
  accountName = ''; nickname = ''; skillLevel: number | null = null; contactEmail = ''; phone = ''; avatarColor = 'emerald'; useGooglePhoto = true;
  constructor() {
    effect(() => {
      const profile = this.auth.profile();
      this.accountName = profile?.accountName ?? ''; this.nickname = profile?.nickname ?? ''; this.skillLevel = profile?.skillLevel ?? null;
      this.contactEmail = profile?.contactEmail ?? ''; this.phone = profile?.phone ?? ''; this.avatarColor = profile?.avatarColor ?? 'emerald'; this.useGooglePhoto = profile?.useGooglePhoto ?? true;
    });
  }
  playerName() { return this.nickname.trim() || this.accountName || 'Player'; }
  ngOnInit() { if (this.auth.profile()?.role === 'PLAYER') void this.loadRequest(); }
  async loadRequest() {
    this.requestLoading.set(true); this.requestError.set('');
    try { this.request.set(await firstValueFrom(this.http.get<OrganizerRequest | null>('/api/me/organizer-request'))); }
    catch (error) { this.requestError.set(message(error)); }
    finally { this.requestLoading.set(false); }
  }
  async requestOrganizer() {
    if (this.requesting() || this.requestLoading() || this.request()?.status === 'PENDING') return;
    this.requesting.set(true); this.requestError.set('');
    try { this.request.set(await firstValueFrom(this.http.post<OrganizerRequest>('/api/me/organizer-request', {}))); }
    catch (error) { this.requestError.set(message(error)); }
    finally { this.requesting.set(false); }
  }
  async save(form: NgForm) {
    if (this.saving()) return;
    if (form.invalid) { form.control.markAllAsTouched(); this.error.set('Review your profile fields.'); return; }
    const onboarding = !this.auth.profile()?.profileCompletedAt;
    this.saving.set(true); this.notice.set(''); this.error.set('');
    try {
      await this.auth.saveProfile({ nickname: this.nickname.trim() || null, skillLevel: this.skillLevel, ...(!this.auth.profile()?.accountNameSetAt ? { accountName: this.accountName } : {}), contactEmail: this.contactEmail.trim() || null, phone: this.phone.trim() || null, avatarColor: this.avatarColor, useGooglePhoto: this.useGooglePhoto });
      this.notice.set('Profile saved.'); if (onboarding) this.completed.emit();
    } catch (error) { this.error.set(message(error)); }
    finally { this.saving.set(false); }
  }
}
