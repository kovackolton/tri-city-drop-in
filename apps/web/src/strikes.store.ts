import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AuthService, message } from './auth.service';
export interface StrikeRecord {
  id: string; reason: string; note: string | null; permanent: boolean; automatic: boolean; current: boolean;
  createdAt: string; revokedAt: string | null; expiresAt: string | null;
  signup: null | { id: string; bookingId: string; guestNumber: number; guestName: string | null;
    event: { id: string; title: string; startsAt: string; endsAt: string; location: { name: string; address: string; timezone: string }; organizerContactEmail: string | null; organizerContactPhone: string | null; contactCallAllowed: boolean; contactTextAllowed: boolean };
    payment: null | { amountCents: number; playerPaid: boolean | null; organizerPaid: boolean | null; playerReviewedAt: string | null; organizerReviewedAt: string | null };
  };
}
export interface StrikeReport { count: number; limit: number; blocked: boolean; items: StrikeRecord[]; }
@Injectable({ providedIn: 'root' })
export class StrikesStore {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  readonly report = signal<StrikeReport | null>(null);
  readonly count = computed(() => this.report()?.count ?? 0);
  readonly blocked = computed(() => this.report()?.blocked ?? false);
  readonly loading = signal(false); readonly error = signal('');
  private revision = 0;
  reset() { this.revision++; this.report.set(null); this.loading.set(false); this.error.set(''); }
  async load() {
    if (!this.auth.profile() || this.loading()) return;
    const revision = this.revision; this.loading.set(true); this.error.set('');
    try { const report = await firstValueFrom(this.http.get<StrikeReport>('/api/me/strikes')); if (revision === this.revision) this.report.set(report); }
    catch (error) { if (revision === this.revision) this.error.set(message(error)); }
    finally { if (revision === this.revision) this.loading.set(false); }
  }
}
