import { IconComponent } from '../icon/icon.component';
import { CalendarPickerComponent } from '../calendar-picker/calendar-picker.component';
import { CalendarSelection, calendarDate, matchesCalendar } from '../../calendar';
import { EventShareComponent } from '../event-share/event-share.component';
import { EventGuidanceComponent } from '../event-guidance/event-guidance.component';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CurrencyPipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AuthService, message } from '../../auth.service';
import { Location, ManagedEvent, EventOverview, eventTime } from '../../models';
import { RosterComponent } from '../roster/roster.component';
import { LocationsComponent } from '../locations/locations.component';
import { DialogComponent } from '../dialog/dialog.component';
import { AvatarComponent } from '../avatar/avatar.component';
import { OrganizerContactComponent } from '../organizer-contact/organizer-contact.component';

@Component({
  selector: 'app-organizer', imports: [IconComponent, CalendarPickerComponent, DialogComponent, AvatarComponent, OrganizerContactComponent, EventShareComponent, FormsModule, CurrencyPipe, RosterComponent, LocationsComponent, EventGuidanceComponent],
  templateUrl: './organizer.component.html',
  styleUrl: './organizer.component.scss'
})
export class OrganizerComponent implements OnInit {
  readonly auth = inject(AuthService);
  readonly view = signal<'events' | 'locations'>('events');
  readonly showEventForm = signal(false);
  readonly choosingStatus = signal(false);
  readonly cancelling = signal('');
  readonly editingId = signal(''); readonly deleting = signal('');
  private original: ManagedEvent | null = null;
  private readonly http = inject(HttpClient);
  readonly locations = signal<Location[]>([]);
  readonly events = signal<ManagedEvent[]>([]);
  readonly eventScope = signal<'mine' | 'all'>('mine');
  readonly overview = signal<EventOverview[]>([]);
  calendar: CalendarSelection = { period: 'all', date: calendarDate(new Date()) };
  eventSearch = ''; eventHistory = 'all'; eventReview = ''; eventStatus = ''; eventLocation = '';
  selectEventHistory(value: string) { this.eventHistory = value; void this.load(); }
  calendarChanged(selection: CalendarSelection) { this.calendar = selection; void this.load(); }
  clearEventFilters() { this.calendar = { period: 'all', date: calendarDate(new Date()) }; this.eventSearch = ''; this.eventHistory = 'all'; this.eventReview = ''; this.eventStatus = ''; this.eventLocation = ''; void this.load(); }
  visibleOverview() { return this.overview().filter(game => matchesCalendar(game.startsAt, game.location.timezone, this.calendar) && (!this.eventSearch.trim() || `${game.title} ${game.organizer.displayName} ${game.location.name}`.toLowerCase().includes(this.eventSearch.trim().toLowerCase()))); }
  private loadRevision = 0;
  organizerNames(game: ManagedEvent | EventOverview) { return [game.organizer?.displayName ?? 'Unknown', ...(game.coOrganizers ?? []).map(user => user.displayName)].join(', '); }
  minimalView() { return this.eventScope() === 'all' && this.auth.profile()?.role !== 'ADMINISTRATOR'; }
  async selectEventScope(scope: 'mine' | 'all') {
    if (this.busy() || scope === this.eventScope()) return;
    this.eventScope.set(scope); this.events.set([]); this.overview.set([]);
    this.rosterEvent.set(''); this.cancelling.set(''); this.deleting.set('');
    await this.load();
  }
  readonly expandedEvent = signal('');
  readonly reviewCompletion = signal<ManagedEvent | null>(null);
  playersHadOpportunity = false;
  toggleEvent(id: string) { this.expandedEvent.set(this.expandedEvent() === id ? '' : id); this.rosterEvent.set(''); }
  reviewLabel(game: ManagedEvent) { return game.reviewStatus === 'COMPLETED' ? 'Completed' : game.reviewStatus === 'IN_PROGRESS' ? 'In progress' : 'Needs review'; }
  startReviewCompletion(game: ManagedEvent) { this.playersHadOpportunity = false; this.reviewCompletion.set(game); this.error.set(''); }
  async completeReview() {
    const game = this.reviewCompletion(); if (!game || !this.playersHadOpportunity || this.auth.profile()?.role !== 'ADMINISTRATOR') return;
    await this.act(async () => { await firstValueFrom(this.http.post(`/api/organizer/events/${game.id}/review/complete`, { playersHadOpportunity: true })); this.reviewCompletion.set(null); }, 'Event review completed. Payment and strike records are unchanged.');
  }
  readonly rosterEvent = signal('');
  readonly busy = signal(false);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly fieldErrors = signal<Record<string, string>>({});
  clearFieldError(name: string) { this.fieldErrors.update(errors => { const next = { ...errors }; delete next[name]; return next; }); }
  revealInvalidField(event: Event) {
    const field = event.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
    this.fieldErrors.update(errors => ({ ...errors, [field.name]: field.validationMessage }));
    let section = field.closest('details');
    while (section) { section.open = true; section = section.parentElement?.closest('details') ?? null; }
  }
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
  organizerSearch = '';
  readonly organizerResults = signal<{ id: string; displayName: string; accountName: string }[]>([]);
  readonly selectedOrganizers = signal<{ id: string; displayName: string; accountName: string }[]>([]);
  readonly searchingOrganizers = signal(false);
  private organizerSearchRevision = 0;
  primaryOrganizerId() { return this.original?.organizerId ?? this.auth.profile()?.id; }
  async searchOrganizers() {
    const revision = ++this.organizerSearchRevision;
    this.searchingOrganizers.set(true); this.error.set('');
    try { const users = await firstValueFrom(this.http.get<ReturnType<typeof this.organizerResults>>('/api/organizer/organizers', { params: { search: this.organizerSearch } })); if (revision === this.organizerSearchRevision) this.organizerResults.set(users.filter(user => user.id !== this.primaryOrganizerId())); }
    catch (error) { if (revision === this.organizerSearchRevision) this.error.set(message(error)); }
    finally { if (revision === this.organizerSearchRevision) this.searchingOrganizers.set(false); }
  }
  selectOrganizer(user: { id: string; displayName: string; accountName: string }) { if (user.id !== this.primaryOrganizerId() && !this.event.coOrganizerIds.includes(user.id) && this.event.coOrganizerIds.length < 20) { this.selectedOrganizers.update(users => [...users, user]); this.event.coOrganizerIds = [...this.event.coOrganizerIds, user.id]; } }
  removeOrganizer(id: string) { this.selectedOrganizers.update(users => users.filter(user => user.id !== id)); this.event.coOrganizerIds = this.event.coOrganizerIds.filter(value => value !== id); }
  resetOrganizerSearch() { this.organizerSearchRevision++; this.organizerSearch = ''; this.organizerResults.set([]); this.selectedOrganizers.set([]); this.searchingOrganizers.set(false); }
  event = { coOrganizerIds: [] as string[], isPrivate: false, title: '', locationId: '', startsAt: '', endsAt: '', capacity: 20, price: '0', maxGuestsPerUser: 1, cancellationCutoffHours: 12, description: '', status: 'DRAFT', bibsProvided: false, bibCount: null as number | null, shirtColors: ['dark', 'light'], shirtColorCount: 2 as number | null, minPlayers: null as number | null, teamCount: 2, teamBalancingEnabled: false, organizerContactEmail: '', organizerContactPhone: '', contactCallAllowed: false, contactTextAllowed: false };
  updateShirtColors(count: number | null) {
    this.event.shirtColorCount = count;
    if (Number.isInteger(count) && count! >= 1 && count! <= 10) this.event.shirtColors = Array.from({ length: count! }, (_, i) => this.event.shirtColors[i] ?? ['dark', 'light'][i] ?? '');
  }
  ngOnInit() { if (this.auth.profile()?.role === 'ADMINISTRATOR') this.eventScope.set('all'); void this.load(); }
  async load() {
    const revision = ++this.loadRevision;
    const minimal = this.minimalView();
    this.loading.set(true); this.error.set('');
    try {
      const [locations, events] = await Promise.all([firstValueFrom(this.http.get<Location[]>('/api/locations')), firstValueFrom(this.http.get<ManagedEvent[] | EventOverview[]>(minimal ? '/api/organizer/events/overview' : '/api/organizer/events', { params: minimal ? { period: this.calendar.period, date: this.calendar.date, search: this.eventSearch } : { scope: this.eventScope(), period: this.calendar.period, date: this.calendar.date, search: this.eventSearch, history: this.eventHistory, review: this.eventReview, status: this.eventStatus, locationId: this.eventLocation } }))]);
      if (revision !== this.loadRevision) return;
      this.locations.set(locations);
      if (minimal) { this.overview.set(events as EventOverview[]); this.events.set([]); }
      else { this.events.set(events as ManagedEvent[]); this.overview.set([]); }
    } catch (error) { if (revision === this.loadRevision) this.error.set(message(error)); }
    finally { if (revision === this.loadRevision) this.loading.set(false); }
  }
  private async act(work: () => Promise<unknown>, success: string) {
    if (this.busy()) return;
    this.busy.set(true); this.error.set(''); this.success.set('');
    try { await work(); await this.load(); this.success.set(success); }
    catch (error) { this.error.set(message(error)); }
    finally { this.busy.set(false); }
  }
  closeStatusDialog() { if (!this.busy()) this.choosingStatus.set(false); }
  async confirmCreation(status: 'DRAFT' | 'PUBLISHED') {
    if (!this.choosingStatus() || this.editingId()) return;
    await this.createEvent(status);
  }
  async createEvent(chosenStatus?: 'DRAFT' | 'PUBLISHED') {
    if (this.busy()) return;
    const price = this.event.price.trim();
    if (!/^\d+(\.\d{1,2})?$/.test(price)) { this.error.set('Enter a nonnegative USD price with at most two decimal places.'); return; }
    const [dollars, cents = ''] = price.split('.');
    const priceCents = Number(dollars) * 100 + Number(cents.padEnd(2, '0'));
    if (!Number.isSafeInteger(priceCents) || priceCents > 2147483647) { this.error.set('The price is too large.'); return; }
    const startsAt = new Date(this.event.startsAt), endsAt = new Date(this.event.endsAt);
    if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime())) { this.error.set('Enter valid start and end times.'); return; }
    if (!this.editingId() && (startsAt.getTime() <= Date.now() || endsAt <= startsAt)) { this.error.set('Choose a future start and an end after the start.'); return; }
    if (!this.editingId() && !chosenStatus) { this.error.set(''); this.choosingStatus.set(true); return; }
    await this.act(async () => {
      const { price: _, status, isPrivate, ...event } = this.event;
      const payload = { ...event, bibCount: event.bibsProvided ? event.bibCount : null, shirtColors: event.shirtColors.slice(0, event.shirtColorCount ?? 0), startsAt: this.original && this.event.startsAt === this.localTime(this.original.startsAt) ? this.original.startsAt : startsAt.toISOString(), endsAt: this.original && this.event.endsAt === this.localTime(this.original.endsAt) ? this.original.endsAt : endsAt.toISOString(), priceCents };
      await firstValueFrom(this.editingId() ? this.http.patch('/api/organizer/events/' + this.editingId(), { ...payload, ...(status === 'DRAFT' ? { status } : {}) }) : this.http.post('/api/events', { ...payload, isPrivate, status: chosenStatus, initialPlayerIds: this.selectedPlayers().map(player => player.id), initialPlayerMode: isPrivate ? 'INVITE' : this.initialPlayerMode }));
      this.cancelEdit();
    }, 'Event saved.');
  }
  cancelEdit() { this.resetOrganizerSearch(); this.fieldErrors.set({}); this.choosingStatus.set(false); this.showEventForm.set(false); this.selectedPlayers.set([]); this.playerResults.set([]); this.playerSearch = ''; this.initialPlayerMode = 'INVITE'; this.editingId.set(''); this.original = null; this.event = { coOrganizerIds: [] as string[], isPrivate: false, title: '', locationId: '', startsAt: '', endsAt: '', capacity: 20, price: '0', maxGuestsPerUser: 1, cancellationCutoffHours: 12, description: '', status: 'DRAFT', bibsProvided: false, bibCount: null as number | null, shirtColors: ['dark', 'light'], shirtColorCount: 2 as number | null, minPlayers: null as number | null, teamCount: 2, teamBalancingEnabled: false, organizerContactEmail: '', organizerContactPhone: '', contactCallAllowed: false, contactTextAllowed: false }; }
  localTime(value: string) { const d = new Date(value); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }
  canEdit(game: ManagedEvent) { const profile = this.auth.profile(); return !game.deletedAt && !!profile && (profile.role === 'ADMINISTRATOR' || profile.role === 'ORGANIZER' && (game.organizerId === profile.id || !!game.coOrganizerIds?.includes(profile.id))) && ['DRAFT', 'PUBLISHED'].includes(game.status); }
  canReturnToDraft(game: ManagedEvent) { return this.canEdit(game) && game.status === 'PUBLISHED' && Date.parse(game.startsAt) > Date.now(); }
  canDraftWhileEditing() { return !!this.original && this.canReturnToDraft(this.original); }
  edit(game: ManagedEvent) {
    if (!this.canEdit(game)) return;
    this.resetOrganizerSearch();
    this.selectedOrganizers.set((game.coOrganizers ?? []).map(user => ({ ...user, accountName: user.accountName ?? user.displayName })));
    this.fieldErrors.set({});
    this.showEventForm.set(true); this.view.set('events');
    this.selectedPlayers.set([]); this.playerResults.set([]); this.original = game; this.editingId.set(game.id);
    this.event = { coOrganizerIds: [...(game.coOrganizerIds ?? [])], isPrivate: game.isPrivate ?? false, title: game.title, description: game.description ?? '', locationId: game.location.id, startsAt: this.localTime(game.startsAt), endsAt: this.localTime(game.endsAt), capacity: game.capacity, price: (game.priceCents / 100).toFixed(2), maxGuestsPerUser: game.maxGuestsPerUser, cancellationCutoffHours: game.cancellationCutoffHours, status: game.status, bibsProvided: game.bibsProvided ?? false, bibCount: game.bibCount ?? null, shirtColors: Array.from({ length: game.shirtColorCount ?? 2 }, (_, i) => game.shirtColors?.[i] ?? ['dark', 'light'][i] ?? ''), shirtColorCount: game.shirtColorCount ?? 2, minPlayers: game.minPlayers ?? null, teamCount: game.teamCount ?? 2, teamBalancingEnabled: game.teamBalancingEnabled ?? false, organizerContactEmail: game.organizerContactEmail ?? '', organizerContactPhone: game.organizerContactPhone ?? '', contactCallAllowed: game.contactCallAllowed ?? false, contactTextAllowed: game.contactTextAllowed ?? false };
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  canShare(game: ManagedEvent) { return !game.deletedAt && game.status === 'PUBLISHED' && Date.parse(game.startsAt) > Date.now(); }
  canCancel(game: ManagedEvent) { return !game.deletedAt && ['DRAFT', 'PUBLISHED'].includes(game.status) && new Date(game.startsAt) > new Date(); }
  canComplete(game: ManagedEvent) { return this.auth.profile()?.role === 'ADMINISTRATOR' && game.reviewStatus !== 'COMPLETED'; }
  async transition(id: string, action: 'cancel' | 'complete') { await this.act(() => firstValueFrom(this.http.post(`/api/organizer/events/${id}/${action}`, {})), action === 'cancel' ? 'Event cancelled; players notified in the app.' : 'Event completed.'); this.cancelling.set(''); }
  async remove(id: string) { await this.act(() => firstValueFrom(this.http.delete('/api/admin/events/' + id)), 'Event deleted; history retained.'); this.deleting.set(''); }
  async publish(id: string) { await this.act(() => firstValueFrom(this.http.post(`/api/events/${id}/publish`, {})), 'Event published.'); }
}
