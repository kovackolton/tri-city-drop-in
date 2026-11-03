import { EventShareComponent } from '../event-share/event-share.component';
import { EventGuidanceComponent } from '../event-guidance/event-guidance.component';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CurrencyPipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AuthService, message } from '../../auth.service';
import { Location, ManagedEvent, eventTime } from '../../models';
import { RosterComponent } from '../roster/roster.component';
import { LocationsComponent } from '../locations/locations.component';

@Component({
  selector: 'app-organizer', imports: [EventShareComponent, FormsModule, CurrencyPipe, RosterComponent, LocationsComponent, EventGuidanceComponent],
  templateUrl: './organizer.component.html',
  styleUrl: './organizer.component.scss'
})
export class OrganizerComponent implements OnInit {
  readonly auth = inject(AuthService);
  readonly view = signal<'events' | 'locations'>('events');
  readonly showEventForm = signal(false);
  readonly cancelling = signal('');
  readonly editingId = signal(''); readonly deleting = signal('');
  private original: ManagedEvent | null = null;
  private readonly http = inject(HttpClient);
  readonly locations = signal<Location[]>([]);
  readonly events = signal<ManagedEvent[]>([]);
  readonly rosterEvent = signal('');
  readonly busy = signal(false);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly success = signal('');
  readonly deviceTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  readonly time = eventTime;
  playerSearch = ''; initialPlayerMode: 'INVITE' | 'BOOK' = 'INVITE';
  readonly playerResults = signal<{ id: string; displayName: string; accountName: string; skillLevel?: number | null; adminSkillLevel?: number | null }[]>([]);
  readonly selectedPlayers = signal<{ id: string; displayName: string; accountName: string; skillLevel?: number | null; adminSkillLevel?: number | null }[]>([]);
  readonly searchingPlayers = signal(false);
  async searchPlayers() {
    if (this.searchingPlayers()) return;
    this.searchingPlayers.set(true); this.error.set('');
    try { this.playerResults.set(await firstValueFrom(this.http.get<ReturnType<typeof this.playerResults>>('/api/organizer/players', { params: { search: this.playerSearch } }))); }
    catch (error) { this.error.set(message(error)); } finally { this.searchingPlayers.set(false); }
  }
  selectPlayer(player: { id: string; displayName: string; accountName: string; skillLevel?: number | null; adminSkillLevel?: number | null }) { if (!this.selectedPlayers().some(selected => selected.id === player.id) && this.selectedPlayers().length < 100) this.selectedPlayers.update(players => [...players, player]); }
  removePlayer(id: string) { this.selectedPlayers.update(players => players.filter(player => player.id !== id)); }
  event = { title: '', locationId: '', startsAt: '', endsAt: '', capacity: 20, price: '0', maxGuestsPerUser: 1, cancellationCutoffHours: 12, description: '', status: 'DRAFT', bibsProvided: false, shirtColorCount: 2 as number | null, minPlayers: null as number | null, teamCount: 2, teamBalancingEnabled: false, organizerContactEmail: '', organizerContactPhone: '', contactCallAllowed: false, contactTextAllowed: false };
  ngOnInit() { void this.load(); }
  async load() {
    this.loading.set(true); this.error.set('');
    try {
      const [locations, events] = await Promise.all([firstValueFrom(this.http.get<Location[]>('/api/locations')), firstValueFrom(this.http.get<ManagedEvent[]>('/api/organizer/events'))]);
      this.locations.set(locations); this.events.set(events);
    } catch (error) { this.error.set(message(error)); }
    finally { this.loading.set(false); }
  }
  private async act(work: () => Promise<unknown>, success: string) {
    if (this.busy()) return;
    this.busy.set(true); this.error.set(''); this.success.set('');
    try { await work(); await this.load(); this.success.set(success); }
    catch (error) { this.error.set(message(error)); }
    finally { this.busy.set(false); }
  }
  async createEvent() {
    const price = this.event.price.trim();
    if (!/^\d+(\.\d{1,2})?$/.test(price)) { this.error.set('Enter a nonnegative USD price with at most two decimal places.'); return; }
    const [dollars, cents = ''] = price.split('.');
    const priceCents = Number(dollars) * 100 + Number(cents.padEnd(2, '0'));
    if (!Number.isSafeInteger(priceCents) || priceCents > 2147483647) { this.error.set('The price is too large.'); return; }
    const startsAt = new Date(this.event.startsAt), endsAt = new Date(this.event.endsAt);
    if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime())) { this.error.set('Enter valid start and end times.'); return; }
    await this.act(async () => {
      const { price: _, status, ...event } = this.event;
      const payload = { ...event, shirtColorCount: event.bibsProvided ? null : event.shirtColorCount, startsAt: this.original && this.event.startsAt === this.localTime(this.original.startsAt) ? this.original.startsAt : startsAt.toISOString(), endsAt: this.original && this.event.endsAt === this.localTime(this.original.endsAt) ? this.original.endsAt : endsAt.toISOString(), priceCents };
      await firstValueFrom(this.editingId() ? this.http.patch('/api/admin/events/' + this.editingId(), payload) : this.http.post('/api/events', { ...payload, status, initialPlayerIds: this.selectedPlayers().map(player => player.id), initialPlayerMode: this.initialPlayerMode }));
      this.cancelEdit();
    }, 'Event saved.');
  }
  cancelEdit() { this.showEventForm.set(false); this.selectedPlayers.set([]); this.playerResults.set([]); this.playerSearch = ''; this.initialPlayerMode = 'INVITE'; this.editingId.set(''); this.original = null; this.event = { title: '', locationId: '', startsAt: '', endsAt: '', capacity: 20, price: '0', maxGuestsPerUser: 1, cancellationCutoffHours: 12, description: '', status: 'DRAFT', bibsProvided: false, shirtColorCount: 2 as number | null, minPlayers: null as number | null, teamCount: 2, teamBalancingEnabled: false, organizerContactEmail: '', organizerContactPhone: '', contactCallAllowed: false, contactTextAllowed: false }; }
  localTime(value: string) { const d = new Date(value); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }
  edit(game: ManagedEvent) {
    this.showEventForm.set(true); this.view.set('events');
    this.selectedPlayers.set([]); this.playerResults.set([]); this.original = game; this.editingId.set(game.id);
    this.event = { title: game.title, description: game.description ?? '', locationId: game.location.id, startsAt: this.localTime(game.startsAt), endsAt: this.localTime(game.endsAt), capacity: game.capacity, price: (game.priceCents / 100).toFixed(2), maxGuestsPerUser: game.maxGuestsPerUser, cancellationCutoffHours: game.cancellationCutoffHours, status: game.status, bibsProvided: game.bibsProvided ?? false, shirtColorCount: game.shirtColorCount ?? 2, minPlayers: game.minPlayers ?? null, teamCount: game.teamCount ?? 2, teamBalancingEnabled: game.teamBalancingEnabled ?? false, organizerContactEmail: game.organizerContactEmail ?? '', organizerContactPhone: game.organizerContactPhone ?? '', contactCallAllowed: game.contactCallAllowed ?? false, contactTextAllowed: game.contactTextAllowed ?? false };
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  canShare(game: ManagedEvent) { return game.status === 'PUBLISHED' && Date.parse(game.startsAt) > Date.now(); }
  canCancel(game: ManagedEvent) { return ['DRAFT', 'PUBLISHED'].includes(game.status) && new Date(game.startsAt) > new Date(); }
  canComplete(game: ManagedEvent) { return game.status === 'PUBLISHED' && new Date(game.endsAt) <= new Date(); }
  async transition(id: string, action: 'cancel' | 'complete') { await this.act(() => firstValueFrom(this.http.post(`/api/organizer/events/${id}/${action}`, {})), action === 'cancel' ? 'Event cancelled; players notified in the app.' : 'Event completed.'); this.cancelling.set(''); }
  async remove(id: string) { await this.act(() => firstValueFrom(this.http.delete('/api/admin/events/' + id)), 'Event deleted; history retained.'); this.deleting.set(''); }
  async publish(id: string) { await this.act(() => firstValueFrom(this.http.post(`/api/events/${id}/publish`, {})), 'Event published.'); }
}
