import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AuthService, message } from './auth.service';
export interface InboxItem { id: string; kind: string; title: string; message: string; createdAt: string; readAt: string | null; }
@Injectable({ providedIn: 'root' })
export class NotificationsStore {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  readonly items = signal<InboxItem[]>([]);
  readonly unread = signal(0);
  readonly loading = signal(false);
  readonly error = signal('');
  private revision = 0;
  reset() { this.revision++; this.items.set([]); this.unread.set(0); this.loading.set(false); this.error.set(''); }
  async load() {
    if (!this.auth.profile() || this.loading()) return;
    const revision = this.revision;
    this.loading.set(true); this.error.set('');
    try {
      const result = await firstValueFrom(this.http.get<{ items: InboxItem[]; unread: number }>('/api/me/notifications'));
      if (revision === this.revision) { this.items.set(result.items); this.unread.set(result.unread); }
    } catch (error) { if (revision === this.revision) this.error.set(message(error)); }
    finally { if (revision === this.revision) this.loading.set(false); }
  }
  async read(id?: string) {
    if (this.loading()) return;
    const revision = this.revision;
    this.loading.set(true); this.error.set('');
    try {
      await firstValueFrom(this.http.post('/api/me/notifications/' + (id ? id + '/read' : 'read-all'), {}));
      if (revision === this.revision) { this.loading.set(false); await this.load(); }
    } catch (error) { if (revision === this.revision) this.error.set(message(error)); }
    finally { if (revision === this.revision) this.loading.set(false); }
  }
}
