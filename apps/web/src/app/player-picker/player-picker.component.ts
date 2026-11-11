import { Component, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { message } from '../../auth.service';
import { AvatarComponent } from '../avatar/avatar.component';
export interface PlayerChoice { id: string; displayName: string; accountName: string; skillLevel?: number | null; adminSkillLevel?: number | null; avatarUrl?: string | null; avatarColor?: string; mode: 'INVITE' | 'BOOK'; }
interface BulkPreview { previewId: string; minimumSkill: number; count: number; draft: boolean; }
@Component({ selector: 'app-player-picker', imports: [FormsModule, AvatarComponent], templateUrl: './player-picker.component.html', styleUrl: './player-picker.component.scss' })
export class PlayerPickerComponent implements OnChanges, OnDestroy {
  @Input() players: PlayerChoice[] = [];
  @Input() eventId = '';
  @Input() priceCents = 0;
  @Input() eventStatus = 'DRAFT';
  @Input() isPrivate = false;
  @Input() disabled = false;
  @Output() playersChange = new EventEmitter<PlayerChoice[]>();
  @Output() changed = new EventEmitter<void>();
  private readonly http = inject(HttpClient);
  private revision = 0;
  readonly results = signal<PlayerChoice[]>([]);
  readonly searching = signal(false); readonly busy = signal(false);
  readonly error = signal(''); readonly notice = signal('');
  readonly bulkPreview = signal<BulkPreview | null>(null);
  search = ''; minimumSkill = ''; bulkEnabled = false; bulkSkill = 3;
  ngOnChanges(changes: SimpleChanges) { if (changes['eventId']) { this.revision++; this.results.set([]); this.players = []; this.search = ''; this.minimumSkill = ''; this.bulkEnabled = false; this.bulkPreview.set(null); this.error.set(''); this.notice.set(''); this.busy.set(false); this.searching.set(false); } }
  ngOnDestroy() { this.revision++; }
  clearFoundPlayers() { if (!this.disabled && !this.busy() && !this.searching()) this.results.set([]); }
  activeFilterCount() { return [!!this.search.trim(), !!this.eventId && !!this.minimumSkill].filter(Boolean).length; }
  selected(id: string) { return this.players.some(player => player.id === id); }
  private update(players: PlayerChoice[]) { this.players = players; this.playersChange.emit(players); }
  select(player: PlayerChoice) { if (!this.disabled && !this.busy() && !this.selected(player.id) && this.players.length < 100) this.update([...this.players, { ...player, mode: 'INVITE' }]); }
  remove(id: string) { if (!this.disabled && !this.busy()) this.update(this.players.filter(player => player.id !== id)); }
  mode(id: string, mode: 'INVITE' | 'BOOK') { if (!this.disabled && !this.busy()) this.update(this.players.map(player => player.id === id ? { ...player, mode } : player)); }
  bookingCount() { return this.players.filter(player => player.mode === 'BOOK').length; }
  async find() {
    if (this.disabled || this.busy() || this.searching() || (this.search.trim().length < 2 && !this.minimumSkill)) return;
    const revision = this.revision; this.searching.set(true); this.error.set('');
    try { const users = await firstValueFrom(this.http.get<PlayerChoice[]>('/api/organizer/players', { params: { search: this.search.trim(), ...(this.eventId && this.minimumSkill ? { minimumSkill: this.minimumSkill } : {}) } })); if (revision === this.revision) this.results.set(users); }
    catch (error) { if (revision === this.revision) this.error.set(message(error)); }
    finally { if (revision === this.revision) this.searching.set(false); }
  }
  async save() {
    if (!this.eventId || !this.players.length || this.disabled || this.busy()) return;
    const revision = this.revision; this.busy.set(true); this.error.set(''); this.notice.set('');
    try {
      const result = await firstValueFrom(this.http.post<{ items: { mode: string; status: string; alreadyAdded: boolean; draft: boolean }[] }>(`/api/organizer/events/${this.eventId}/players/batch`, { players: this.players.map(player => ({ userId: player.id, mode: player.mode })), ...(this.bookingCount() ? { expectedPriceCents: this.priceCents } : {}) }));
      if (revision !== this.revision) return;
      const invited = result.items.filter(item => item.mode === 'INVITE').length, booked = result.items.filter(item => item.mode === 'BOOK').length;
      this.notice.set(`Saved: ${invited} invitation(s), ${booked} booking(s). ${this.eventStatus === 'DRAFT' ? 'Draft invitations wait until publication; bookings are provisional.' : 'Check the roster for confirmed/waitlisted places.'}`);
      this.update([]); this.results.set([]); this.bulkPreview.set(null); this.changed.emit();
    } catch (error) { if (revision === this.revision) this.error.set(message(error)); }
    finally { if (revision === this.revision) this.busy.set(false); }
  }
  invalidateBulk() { this.bulkPreview.set(null); }
  async previewBulk() {
    if (!this.eventId || this.disabled || this.busy() || !Number.isInteger(this.bulkSkill) || this.bulkSkill < 1 || this.bulkSkill > 5) return;
    const revision = this.revision, minimumSkill = this.bulkSkill; this.busy.set(true); this.error.set(''); this.bulkPreview.set(null);
    try { const preview = await firstValueFrom(this.http.post<BulkPreview>(`/api/organizer/events/${this.eventId}/players/bulk-preview`, { minimumSkill })); if (revision === this.revision && minimumSkill === this.bulkSkill) this.bulkPreview.set(preview); }
    catch (error) { if (revision === this.revision) this.error.set(message(error)); }
    finally { if (revision === this.revision) this.busy.set(false); }
  }
  async sendBulk() {
    const preview = this.bulkPreview(); if (!preview || !preview.count || this.disabled || this.busy()) return;
    const revision = this.revision; this.busy.set(true); this.error.set('');
    try { const result = await firstValueFrom(this.http.post<{ count: number; draft: boolean }>(`/api/organizer/events/${this.eventId}/players/bulk-invite`, { previewId: preview.previewId, confirm: true })); if (revision !== this.revision) return; this.notice.set(`${result.count} bulk invitation(s) ${result.draft ? 'queued until publication' : 'sent in-app'}. No seats were booked.`); this.bulkPreview.set(null); this.changed.emit(); }
    catch (error) { if (revision === this.revision) { this.error.set(message(error)); this.bulkPreview.set(null); } }
    finally { if (revision === this.revision) this.busy.set(false); }
  }
}
