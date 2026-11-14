import { ActionErrorDirective, FormFeedbackDirective } from '../form-feedback/form-feedback.directive';
import { IconComponent } from '../icon/icon.component';
import { Component, Input, OnChanges, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AuthService, message } from '../../auth.service';
import { StrikeReport } from '../../strikes.store';
import { DialogComponent } from '../dialog/dialog.component';
import { AvatarComponent } from '../avatar/avatar.component';
type UserRole = 'PLAYER' | 'ORGANIZER' | 'ADMINISTRATOR';
interface AdminUser { id: string; createdAt: string; displayName: string; accountName: string; nickname: string | null; email: string; contactEmail: string; phone: string | null; role: UserRole; strikeCount: number; skillLevel: number | null; adminSkillLevel: number | null; avatarUrl: string | null; avatarColor: string; organizerRequest: { id: string; requestedAt: string } | null; }
interface UserPage { items: AdminUser[]; nextCursor: string | null; pendingCount: number; totalCount: number; page?: number; pageSize?: number; totalPages?: number; }
@Component({ selector: 'app-admin-users', imports: [ActionErrorDirective, FormFeedbackDirective, IconComponent, FormsModule, AvatarComponent, DatePipe, DialogComponent], templateUrl: './admin-users.component.html', styleUrl: './admin-users.component.scss' })
export class AdminUsersComponent implements OnChanges {
  @Input() requestsOnly = false;
  readonly strikeUser = signal<AdminUser | null>(null);
  readonly strikeReport = signal<StrikeReport | null>(null);
  readonly strikeLoading = signal(false);
  strikeNote = ''; private strikeRequestId = '';
  async openStrikes(user: AdminUser) {
    if (this.busy() || this.loading()) return;
    this.strikeUser.set(user); this.strikeReport.set(null); this.strikeNote = ''; this.strikeRequestId = crypto.randomUUID(); this.error.set('');
    await this.loadStrikeReport();
  }
  private async loadStrikeReport() {
    const user = this.strikeUser(); if (!user) return;
    this.strikeLoading.set(true);
    try {
      const report = await firstValueFrom(this.http.get<StrikeReport>(`/api/admin/users/${user.id}/strikes`));
      if (this.strikeUser()?.id === user.id) { this.strikeReport.set(report); this.users.update(users => users.map(item => item.id === user.id ? { ...item, strikeCount: report.count } : item)); }
    } catch (error) { this.error.set(message(error)); }
    finally { this.strikeLoading.set(false); }
  }
  async issuePermanent() {
    const user = this.strikeUser(); if (!user || this.busy() || this.strikeLoading() || !this.strikeNote.trim()) return;
    this.busy.set(true); this.error.set('');
    try {
      await firstValueFrom(this.http.post(`/api/admin/users/${user.id}/strikes`, { note: this.strikeNote, requestId: this.strikeRequestId }));
      this.strikeNote = ''; this.strikeRequestId = crypto.randomUUID(); await this.loadStrikeReport(); this.notice.set('Permanent strike recorded. The player has been notified.');
    } catch (error) { this.error.set(message(error)); }
    finally { this.busy.set(false); }
  }
  async revokePermanent(id: string) {
    const user = this.strikeUser(); if (!user || this.busy() || this.strikeLoading() || !this.strikeNote.trim()) return;
    this.busy.set(true); this.error.set('');
    try {
      await firstValueFrom(this.http.post(`/api/admin/users/${user.id}/strikes/${id}/revoke`, { note: this.strikeNote }));
      this.strikeNote = ''; await this.loadStrikeReport(); this.notice.set('Permanent strike cleared. The original reason remains in history.');
    } catch (error) { this.error.set(message(error)); }
    finally { this.busy.set(false); }
  }
  ratingDrafts: Record<string, number | null> = {};
  roleDrafts: Record<string, UserRole> = {};
  readonly auth = inject(AuthService);
  readonly roleConfirmation = signal<{ id: string; name: string; previous: UserRole; role: UserRole } | null>(null);
  roleLabel(role: UserRole) { return role === 'PLAYER' ? 'Player' : role === 'ORGANIZER' ? 'Organizer' : 'Administrator'; }
  confirmRole(user: AdminUser) { if (this.roleDrafts[user.id] !== user.role) this.roleConfirmation.set({ id: user.id, name: user.accountName, previous: user.role, role: this.roleDrafts[user.id] }); }
  async saveRole() {
    const confirmation = this.roleConfirmation();
    if (!confirmation || this.busy() || this.loading()) return;
    this.busy.set(true); this.error.set(''); this.notice.set('');
    try {
      await firstValueFrom(this.http.patch(`/api/admin/users/${confirmation.id}/role`, { role: confirmation.role }));
      this.roleConfirmation.set(null);
      if (confirmation.id === this.auth.profile()?.id) await this.auth.refreshProfile();
      if (this.auth.profile()?.role === 'ADMINISTRATOR') await this.load(false, this.page());
      this.notice.set(`Role changed to ${this.roleLabel(confirmation.role)} for ${confirmation.name}. They have been notified.`);
    } catch (error) { this.error.set(message(error)); }
    finally { this.busy.set(false); }
  }
  private readonly http = inject(HttpClient);
  readonly users = signal<AdminUser[]>([]);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly pendingCount = signal(0);
  readonly page = signal(1); readonly totalPages = signal(1); pageSize = 25; private loadedPageSize = 25;
  pageNumbers() { const start = Math.max(1, Math.min(this.page() - 2, this.totalPages() - 4)); return Array.from({ length: Math.min(5, this.totalPages()) }, (_, index) => start + index); }
  rangeStart() { return this.totalCount() ? (this.page() - 1) * this.loadedPageSize + 1 : 0; }
  rangeEnd() { return Math.min(this.totalCount(), (this.page() - 1) * this.loadedPageSize + this.users().length); }
  goToPage(page: number) { if (!this.busy() && page >= 1 && page <= this.totalPages()) void this.load(true, page); }
  changePageSize() { if (!this.busy()) void this.load(true, 1); }
  readonly nextCursor = signal<string | null>(null);
  readonly confirming = signal<{ id: string; action: 'grant' | 'clear'; name: string } | null>(null);
  readonly expandedUser = signal('');
  readonly totalCount = signal(0);
  roleFilter = ''; ratingFilter = ''; accessFilter = ''; sort = 'name'; direction = 'asc';
  search = ''; pendingOnly = false;
  private loadedFilter = { search: '', pending: false, role: '', rating: '', access: '', sort: 'name', direction: 'asc' };
  ngOnChanges() { this.pendingOnly = this.requestsOnly; void this.load(); }
  async load(more = false, targetPage?: number) {
    if (this.loading()) return;
    this.loading.set(true); this.error.set(''); this.roleConfirmation.set(null); this.confirming.set(null);
    const requestedPage = targetPage ?? (more ? this.page() + 1 : 1);
    const filter = more || targetPage !== undefined ? this.loadedFilter : { search: this.search, pending: this.pendingOnly, role: this.roleFilter, rating: this.ratingFilter, access: this.accessFilter, sort: this.sort, direction: this.direction };
    try {
      const page = await firstValueFrom(this.http.get<UserPage>('/api/admin/users', { params: { search: filter.search, pending: String(filter.pending), role: filter.role, rating: filter.rating, access: filter.access, sort: filter.sort, direction: filter.direction, page: String(requestedPage), pageSize: String(this.pageSize) } }));
      this.loadedFilter = filter; this.loadedPageSize = this.pageSize; this.ratingDrafts = {}; this.roleDrafts = {}; this.expandedUser.set('');
      for (const user of page.items) { this.ratingDrafts[user.id] = user.adminSkillLevel; this.roleDrafts[user.id] = user.role; }
      this.users.set(page.items); this.page.set(page.page ?? requestedPage); this.totalPages.set(page.totalPages ?? Math.max(1, Math.ceil((page.totalCount ?? page.items.length) / this.pageSize))); this.nextCursor.set(page.nextCursor); this.pendingCount.set(page.pendingCount); this.totalCount.set(page.totalCount ?? this.users().length);
    } catch (error) { this.pageSize = this.loadedPageSize; this.error.set(message(error)); }
    finally { this.loading.set(false); }
  }
  sortBy(sort: string) { this.direction = this.sort === sort && this.direction === 'asc' ? 'desc' : 'asc'; this.sort = sort; void this.load(); }
  ariaSort(sort: string): 'ascending' | 'descending' | 'none' { return this.sort !== sort ? 'none' : this.direction === 'asc' ? 'ascending' : 'descending'; }
  activeFilterCount() { const filters = this.loadedFilter; return [!!filters.search.trim(), filters.pending, !!filters.role, !!filters.rating, !!filters.access].filter(Boolean).length; }
  clearFilters() { this.search = ''; this.pendingOnly = false; this.roleFilter = ''; this.ratingFilter = ''; this.accessFilter = ''; this.sort = 'name'; this.direction = 'asc'; void this.load(); }
  filter(pending: boolean) { this.pendingOnly = pending; this.confirming.set(null); void this.load(); }
  async saveRating(user: AdminUser) {
    if (this.busy() || this.loading()) return;
    this.busy.set(true); this.error.set(''); this.notice.set('');
    try {
      const result = await firstValueFrom(this.http.patch<{ adminSkillLevel: number | null }>(`/api/admin/users/${user.id}/rating`, { adminSkillLevel: this.ratingDrafts[user.id] }));
      this.users.update(users => users.map(item => item.id === user.id ? { ...item, adminSkillLevel: result.adminSkillLevel } : item));
      this.notice.set(`Administrator rating ${result.adminSkillLevel === null ? 'cleared' : 'saved'} for ${user.accountName}.`);
    } catch (error) { this.error.set(message(error)); }
    finally { this.busy.set(false); }
  }
  async review() {
    const confirmation = this.confirming();
    if (!confirmation || this.busy() || this.loading()) return;
    this.busy.set(true); this.error.set(''); this.notice.set('');
    try {
      await firstValueFrom(this.http.post(`/api/admin/organizer-requests/${confirmation.id}/${confirmation.action}`, {}));
      this.confirming.set(null); await this.load(false, this.page()); this.notice.set(confirmation.action !== 'clear' ? 'Organizer access granted. The player has been notified.' : 'Request cleared. The player has been notified.');
    } catch (error) { this.error.set(message(error)); }
    finally { this.busy.set(false); }
  }
}
