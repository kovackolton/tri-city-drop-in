import { ActionErrorDirective, FormFeedbackDirective } from '../form-feedback/form-feedback.directive';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AuthService, message } from '../../auth.service';
import { IconComponent } from '../icon/icon.component';
interface EmailSettings {
  dailyLimit: number; monthlyLimit: number; digestStartHour: number; digestDailyLimit: number;
  urgentReserve: number; batchSize: number; intervalMs: number;
}
interface SettingsResponse { values: EmailSettings; revision: number; configured: boolean; updatedAt: string | null; }
type NotificationTier = 'URGENT' | 'IMPORTANT' | 'ROUTINE' | 'IN_APP' | 'TIME_SENSITIVE';
interface NotificationRule { kind: string; name: string; message: string; audience: string; trigger: string; defaultTier: NotificationTier; }
interface RulesResponse { rules: Record<string, NotificationTier>; revision: number; catalog: NotificationRule[]; updatedAt: string | null; }
@Component({ selector: 'app-app-settings', imports: [ActionErrorDirective, FormFeedbackDirective, FormsModule, IconComponent], templateUrl: './app-settings.component.html', styleUrl: './app-settings.component.scss' })
export class AppSettingsComponent implements OnInit {
  readonly auth = inject(AuthService);
  private readonly http = inject(HttpClient);
  readonly loading = signal(false); readonly saving = signal(false);
  readonly error = signal(''); readonly notice = signal(''); readonly loaded = signal(false);
  configured = false; revision = 0; updatedAt: string | null = null;
  values: EmailSettings = { dailyLimit: 100, monthlyLimit: 3000, digestStartHour: 23, digestDailyLimit: 80, urgentReserve: 5, batchSize: 50, intervalMs: 1100 };
  readonly hours = Array.from({ length: 24 }, (_, hour) => ({ value: hour, label: `${String(hour).padStart(2, '0')}:00 UTC` }));
  readonly rulesLoading = signal(false); readonly rulesSaving = signal(false); readonly rulesError = signal(''); readonly rulesNotice = signal('');
  readonly catalog = signal<NotificationRule[]>([]); rules: Record<string, NotificationTier> = {}; private savedRules: Record<string, NotificationTier> = {};
  rulesRevision = 0; ruleSearch = ''; tierFilter = ''; audienceFilter = ''; ruleSort = 'name'; selectedRules = new Set<string>(); bulkTier: NotificationTier = 'IMPORTANT';
  readonly tiers: { value: NotificationTier; label: string }[] = [
    { value: 'URGENT', label: 'Urgent' }, { value: 'IMPORTANT', label: 'Important digest' }, { value: 'ROUTINE', label: 'Routine digest' }, { value: 'IN_APP', label: 'In-app only' }
  ];
  ngOnInit() { this.refresh(); }
  refresh() { void this.load(); void this.loadRules(); }
  async loadRules() {
    if (this.auth.profile()?.role !== 'ADMINISTRATOR' || this.rulesLoading() || this.rulesSaving()) return;
    this.rulesLoading.set(true); this.rulesError.set(''); this.rulesNotice.set('');
    try { this.acceptRules(await firstValueFrom(this.http.get<RulesResponse>('/api/admin/app-settings/notifications'))); }
    catch (error) { this.rulesError.set(message(error)); } finally { this.rulesLoading.set(false); }
  }
  private acceptRules(result: RulesResponse) { this.catalog.set(result.catalog); this.rules = { ...result.rules }; this.savedRules = { ...result.rules }; this.rulesRevision = result.revision; this.selectedRules = new Set(); }
  filteredRules() {
    const search = this.ruleSearch.trim().toLowerCase();
    return this.catalog().filter(row => (!this.tierFilter || this.rules[row.kind] === this.tierFilter) && (!this.audienceFilter || row.audience === this.audienceFilter) &&
      (!search || [row.name, row.kind, row.message, row.trigger].join(' ').toLowerCase().includes(search)))
      .sort((a, b) => (this.ruleSort === 'tier' ? this.tierLabel(this.rules[a.kind]).localeCompare(this.tierLabel(this.rules[b.kind])) : 0) || a.name.localeCompare(b.name));
  }
  audiences() { return [...new Set(this.catalog().map(row => row.audience))].sort(); }
  activeRuleFilters() { return Number(!!this.ruleSearch.trim()) + Number(!!this.tierFilter) + Number(!!this.audienceFilter); }
  clearRuleFilters() { this.ruleSearch = ''; this.tierFilter = ''; this.audienceFilter = ''; }
  tierLabel(tier: NotificationTier) { return tier === 'TIME_SENSITIVE' ? 'Time-sensitive' : this.tiers.find(t => t.value === tier)?.label ?? tier; }
  timing(tier: NotificationTier) {
    return { URGENT: 'Next worker run, normally within 5 minutes; can arrive after a digest.', IMPORTANT: 'Evening window; triggers a digest, at most one per user per UTC day.', ROUTINE: 'Included only when another important unread notification triggers a digest.', IN_APP: 'No email. Notification stays available in the app.', TIME_SENSITIVE: 'Urgent for time/location changes within 24 hours of old or new kickoff; otherwise important digest.' }[tier];
  }
  selectRule(kind: string, checked: boolean) { const next = new Set(this.selectedRules); checked ? next.add(kind) : next.delete(kind); this.selectedRules = next; }
  allVisibleSelected() { const rows = this.filteredRules(); return rows.length > 0 && rows.every(row => this.selectedRules.has(row.kind)); }
  selectVisible(checked: boolean) { for (const row of this.filteredRules()) this.selectRule(row.kind, checked); }
  applyBulkTier() { for (const kind of this.selectedRules) this.rules[kind] = this.bulkTier; this.rulesNotice.set('Selected tiers changed locally. Save notification rules to apply.'); }
  changedRules() { return this.catalog().filter(row => this.rules[row.kind] !== this.savedRules[row.kind]).length; }
  resetRule(row: NotificationRule) { this.rules[row.kind] = row.defaultTier; }
  async saveRules() {
    if (this.auth.profile()?.role !== 'ADMINISTRATOR' || this.rulesSaving() || this.rulesLoading() || !this.catalog().length) return;
    this.rulesSaving.set(true); this.rulesError.set(''); this.rulesNotice.set('');
    try { this.acceptRules(await firstValueFrom(this.http.patch<RulesResponse>('/api/admin/app-settings/notifications', { revision: this.rulesRevision, rules: this.rules }))); this.rulesNotice.set('Notification rules saved. The next worker execution uses them. Already emailed notifications are not sent again.'); }
    catch (error) { this.rulesError.set(message(error)); } finally { this.rulesSaving.set(false); }
  }
  private accept(result: SettingsResponse) { this.values = { ...result.values }; this.revision = result.revision; this.configured = result.configured; this.updatedAt = result.updatedAt; this.loaded.set(true); }
  async load() {
    if (this.auth.profile()?.role !== 'ADMINISTRATOR' || this.loading() || this.saving()) return;
    this.loading.set(true); this.error.set(''); this.notice.set('');
    try { this.accept(await firstValueFrom(this.http.get<SettingsResponse>('/api/admin/app-settings'))); }
    catch (error) { this.error.set(message(error)); } finally { this.loading.set(false); }
  }
  async save(form: NgForm) {
    if (this.auth.profile()?.role !== 'ADMINISTRATOR' || !this.loaded() || this.saving() || this.loading()) return;
    if (form.invalid) { form.control.markAllAsTouched(); this.error.set('Review the highlighted settings and allowed ranges.'); return; }
    this.saving.set(true); this.error.set(''); this.notice.set('');
    try {
      this.accept(await firstValueFrom(this.http.patch<SettingsResponse>('/api/admin/app-settings', { revision: this.revision, values: this.values })));
      this.notice.set('Settings saved. They apply when the email worker next runs, normally within five minutes. An execution already running keeps its current settings.');
    } catch (error) { this.error.set(message(error)); } finally { this.saving.set(false); }
  }
  updatedLabel() { return this.updatedAt ? new Date(this.updatedAt).toLocaleString() : ''; }
}
