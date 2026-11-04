import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AuthService, message } from './auth.service';
export interface WaiverStatus {
  version: string; title: string; clauses: string[]; contentHash: string;
  acceptance: null | { id: string; version: string; signedName: string; signedEmail: string; acceptedAt: string };
}
@Injectable({ providedIn: 'root' })
export class WaiverStore {
  private readonly http = inject(HttpClient); private readonly auth = inject(AuthService);
  readonly status = signal<WaiverStatus | null>(null);
  readonly accepted = computed(() => !!this.status()?.acceptance && this.status()?.acceptance?.version === this.status()?.version);
  readonly loading = signal(false); readonly signing = signal(false); readonly error = signal('');
  private revision = 0;
  reset() { this.revision++; this.status.set(null); this.loading.set(false); this.signing.set(false); this.error.set(''); }
  async load() {
    if (!this.auth.profile() || this.loading() || this.signing()) return;
    const revision = this.revision; this.loading.set(true); this.error.set('');
    try { const status = await firstValueFrom(this.http.get<WaiverStatus>('/api/me/waiver')); if (revision === this.revision) this.status.set(status); }
    catch (error) { if (revision === this.revision) this.error.set(message(error)); }
    finally { if (revision === this.revision) this.loading.set(false); }
  }
  async agree() {
    const version = this.status()?.version;
    if (!version || !this.auth.profile() || this.signing() || this.loading() || this.accepted()) return;
    const revision = this.revision; this.signing.set(true); this.error.set('');
    try { const status = await firstValueFrom(this.http.post<WaiverStatus>('/api/me/waiver', { version, agree: true })); if (revision === this.revision) this.status.set(status); }
    catch (error) { if (revision === this.revision) this.error.set(message(error)); }
    finally { if (revision === this.revision) this.signing.set(false); }
  }
}
