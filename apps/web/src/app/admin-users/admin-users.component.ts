import { Component, Input, OnChanges, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { message } from '../../auth.service';
import { AvatarComponent } from '../avatar/avatar.component';
interface AdminUser { id: string; displayName: string; accountName: string; nickname: string | null; email: string; contactEmail: string; phone: string | null; role: string; skillLevel: number | null; avatarUrl: string | null; avatarColor: string; organizerRequest: { id: string; requestedAt: string } | null; }
interface UserPage { items: AdminUser[]; nextCursor: string | null; pendingCount: number; }
@Component({ selector: 'app-admin-users', imports: [FormsModule, AvatarComponent, DatePipe], templateUrl: './admin-users.component.html' })
export class AdminUsersComponent implements OnChanges {
  @Input() requestsOnly = false;
  private readonly http = inject(HttpClient);
  readonly users = signal<AdminUser[]>([]);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly pendingCount = signal(0);
  readonly nextCursor = signal<string | null>(null);
  readonly confirming = signal<{ id: string; action: 'grant' | 'clear'; name: string } | null>(null);
  search = ''; pendingOnly = false;
  private loadedFilter = { search: '', pending: false };
  ngOnChanges() { this.pendingOnly = this.requestsOnly; void this.load(); }
  async load(more = false) {
    if (this.loading()) return;
    this.loading.set(true); this.error.set('');
    const filter = more ? this.loadedFilter : { search: this.search, pending: this.pendingOnly };
    try {
      const page = await firstValueFrom(this.http.get<UserPage>('/api/admin/users', { params: { search: filter.search, pending: String(filter.pending), ...(more && this.nextCursor() ? { cursor: this.nextCursor()! } : {}) } }));
      if (!more) this.loadedFilter = filter;
      this.users.set(more ? [...this.users(), ...page.items] : page.items); this.nextCursor.set(page.nextCursor); this.pendingCount.set(page.pendingCount);
    } catch (error) { this.error.set(message(error)); }
    finally { this.loading.set(false); }
  }
  filter(pending: boolean) { this.pendingOnly = pending; this.confirming.set(null); void this.load(); }
  async review() {
    const confirmation = this.confirming();
    if (!confirmation || this.busy() || this.loading()) return;
    this.busy.set(true); this.error.set(''); this.notice.set('');
    try {
      await firstValueFrom(this.http.post(`/api/admin/organizer-requests/${confirmation.id}/${confirmation.action}`, {}));
      this.confirming.set(null); await this.load(); this.notice.set(confirmation.action === 'grant' ? 'Organizer access granted. The player has been notified.' : 'Request cleared. The player has been notified.');
    } catch (error) { this.error.set(message(error)); }
    finally { this.busy.set(false); }
  }
}
