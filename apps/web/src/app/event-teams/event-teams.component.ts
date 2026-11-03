import { Component, EventEmitter, Input, OnChanges, Output, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { message } from '../../auth.service';
import { AvatarComponent } from '../avatar/avatar.component';
import { DialogComponent } from '../dialog/dialog.component';
interface TeamPlayer { id: string; displayName: string; accountName: string; isGuest: boolean; rating: number | null; teamNumber: number | null; avatarUrl: string | null; avatarColor: string; }
interface TeamData { teamCount: number; teamBalancingEnabled: boolean; editable: boolean; players: TeamPlayer[]; }
@Component({ selector: 'app-event-teams', imports: [FormsModule, AvatarComponent, DialogComponent], templateUrl: './event-teams.component.html' })
export class EventTeamsComponent implements OnChanges {
  @Input({ required: true }) eventId!: string;
  @Output() changed = new EventEmitter<void>();
  private readonly http = inject(HttpClient);
  readonly data = signal<TeamData | null>(null);
  readonly busy = signal(false); readonly error = signal(''); readonly notice = signal(''); readonly confirming = signal(false);
  private loadRevision = 0;
  teamCount = 2; enabled = false;
  ngOnChanges() { void this.load(); }
  numbers() { return Array.from({ length: this.data()?.teamCount ?? 0 }, (_, i) => i + 1); }
  members(number: number | null) { return this.data()?.players.filter(player => player.teamNumber === number) ?? []; }
  async load() {
    const id = this.eventId, revision = ++this.loadRevision; this.error.set('');
    try { const data = await firstValueFrom(this.http.get<TeamData>(`/api/organizer/events/${id}/teams`)); if (id === this.eventId && revision === this.loadRevision) { this.data.set(data); this.teamCount = data.teamCount; this.enabled = data.teamBalancingEnabled; } }
    catch (error) { if (id === this.eventId && revision === this.loadRevision) this.error.set(message(error)); }
  }
  private async act(path: string, body: unknown, notice: string) {
    if (this.busy()) return;
    this.busy.set(true); this.error.set(''); this.notice.set('');
    try { await firstValueFrom(this.http.post(`/api/organizer/events/${this.eventId}/teams/${path}`, body)); this.confirming.set(false); await this.load(); this.notice.set(notice); this.changed.emit(); }
    catch (error) { this.error.set(message(error)); }
    finally { this.busy.set(false); }
  }
  save() { return this.act('settings', { teamCount: this.teamCount, teamBalancingEnabled: this.enabled }, 'Team settings saved.'); }
  async assign(id: string, number: string, select?: HTMLSelectElement) { await this.act('assign', { signupId: id, teamNumber: number === '' ? null : Number(number) }, 'Team assignment saved.'); if (select) select.value = String(this.data()?.players.find(player => player.id === id)?.teamNumber ?? ''); }
  balance() { return this.act('balance', {}, 'Teams balanced. Review and adjust assignments as needed.'); }
}
