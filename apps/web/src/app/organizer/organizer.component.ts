import { CalendarGameDatesDirective } from '../calendar-picker/calendar-game-dates.directive';
import { paymentProfileUrl, PaymentMethod } from '../../payment-links';
import { PlayerPickerComponent, PlayerChoice } from '../player-picker/player-picker.component';
import { IconComponent } from '../icon/icon.component';
import { CalendarPickerComponent } from '../calendar-picker/calendar-picker.component';
import { CalendarSelection, calendarDate, matchesCalendar } from '../../calendar';
import { EventShareComponent } from '../event-share/event-share.component';
import { EventGuidanceComponent } from '../event-guidance/event-guidance.component';
import { Component, OnInit, OnChanges, SimpleChanges, Input, Output, EventEmitter, inject, signal } from '@angular/core';
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

export type WorkspaceShortcut = 'upcoming' | 'recent' | 'review' | 'all' | 'locations';

@Component({
  selector: 'app-organizer', imports: [CalendarGameDatesDirective, PlayerPickerComponent, IconComponent, CalendarPickerComponent, DialogComponent, AvatarComponent, OrganizerContactComponent, EventShareComponent, FormsModule, CurrencyPipe, RosterComponent, LocationsComponent, EventGuidanceComponent],
  templateUrl: './organizer.component.html',
  styleUrl: './organizer.component.scss'
})
export class OrganizerComponent implements OnInit, OnChanges {
  @Input() shortcutRequest: { view: WorkspaceShortcut; id: number; eventId?: string } | null = null;
  @Output() shortcutChanged = new EventEmitter<WorkspaceShortcut>();
  reviewTargetId = '';
  private reviewScrollPending = false;
  ngOnChanges(changes: SimpleChanges) {
    if (!changes['shortcutRequest'] || !this.shortcutRequest) return;
    const request = this.shortcutRequest;
    this.selectShortcut(request.view, false);
    if (request.eventId) {
      this.reviewTargetId = request.eventId; this.reviewScrollPending = true;
      this.eventReview = ''; this.eventHistory = 'past';
      if (this.auth.profile()?.role === 'ADMINISTRATOR') this.eventScope.set('all');
    }
    if (!changes['shortcutRequest'].firstChange) void this.load();
  }
  selectShortcut(shortcut: WorkspaceShortcut, reload = true) {
    if (this.busy()) return;
    this.reviewTargetId = ''; this.reviewScrollPending = false;
    this.view.set(shortcut === 'locations' ? 'locations' : 'events');
    this.eventScope.set('mine'); this.events.set([]); this.overview.set([]);
    if (shortcut !== 'locations') {
      this.eventHistory = shortcut === 'review' ? 'past' : shortcut;
      this.calendar = { period: 'all', date: calendarDate(new Date()) };
      this.eventSearch = ''; this.eventStatus = ''; this.eventLocation = '';
      this.eventReview = ['review', 'recent'].includes(shortcut) ? 'open' : '';
      this.expandedEvent.set(''); this.rosterEvent.set('');
    }
    this.shortcutChanged.emit(shortcut);
    if (reload) void this.load();
  }
  selectSection(section: 'events' | 'locations') { this.view.set(section); this.emitShortcut(); if (section === 'events') void this.load(); }
  private emitShortcut() { this.shortcutChanged.emit(this.view() === 'locations' ? 'locations' : this.eventHistory === 'past' ? 'review' : this.eventHistory as WorkspaceShortcut); }

  readonly auth = inject(AuthService);
  readonly view = signal<'events' | 'locations'>('events');
  readonly showEventForm = signal(false);
  skillRestricted = false; skillDirection: 'above' | 'below' = 'above'; skillThreshold = 3;
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
  eventSearch = ''; eventHistory = 'upcoming'; eventReview = ''; eventStatus = ''; eventLocation = '';
  selectEventHistory(value: string) { this.reviewTargetId = ''; this.reviewScrollPending = false; this.eventHistory = value; this.eventReview = ['past', 'recent'].includes(value) ? 'open' : ''; this.eventStatus = ''; this.calendar = { period: 'all', date: calendarDate(new Date()) }; this.expandedEvent.set(''); this.rosterEvent.set(''); this.emitShortcut(); void this.load(); }
  calendarChanged(selection: CalendarSelection) { this.calendar = selection; void this.load(); }
  clearEventFilters() { this.calendar = { period: 'all', date: calendarDate(new Date()) }; this.eventSearch = ''; this.eventReview = ['past', 'recent'].includes(this.eventHistory) ? 'open' : ''; this.eventStatus = ''; this.eventLocation = ''; void this.load(); }
  visibleOverview() { return this.overview().filter(game => matchesCalendar(game.startsAt, game.location.timezone, this.calendar) && (!this.eventSearch.trim() || `${game.title} ${game.organizer.displayName} ${game.location.name}`.toLowerCase().includes(this.eventSearch.trim().toLowerCase()))); }
  private loadRevision = 0;
  organizerNames(game: ManagedEvent | EventOverview) { return [game.organizer?.displayName ?? 'Unknown', ...(game.coOrganizers ?? []).map(user => user.displayName)].join(', '); }
  minimalView() { return this.eventScope() === 'all' && this.auth.profile()?.role !== 'ADMINISTRATOR'; }
  async selectEventScope(scope: 'mine' | 'all') {
    if (this.busy() || scope === this.eventScope()) return;
    this.reviewTargetId = ''; this.reviewScrollPending = false;
    this.eventScope.set(scope); this.events.set([]); this.overview.set([]);
    this.rosterEvent.set(''); this.cancelling.set(''); this.deleting.set('');
    await this.load();
  }
  readonly expandedEvent = signal('');
  readonly reviewCompletion = signal<ManagedEvent | null>(null);
  playersHadOpportunity = false;
  toggleEvent(id: string) { this.expandedEvent.set(this.expandedEvent() === id ? '' : id); this.rosterEvent.set(''); }
  eventPhase(game: ManagedEvent) { return game.status === 'CANCELLED' ? 'cancelled' : game.status === 'COMPLETED' || Date.parse(game.endsAt) <= Date.now() ? 'past' : Date.parse(game.startsAt) <= Date.now() ? 'ongoing' : 'upcoming'; }
  activeEventFilterCount() { const full = !this.minimalView(); return [this.calendar.period !== 'all', !!this.eventSearch.trim(), full && this.eventHistory !== 'all', full && !!this.eventReview, full && (!!this.eventStatus && this.eventStatus !== 'all' || !this.eventStatus && ['upcoming', 'recent'].includes(this.eventHistory)), full && !!this.eventLocation, full && !!this.reviewTargetId].filter(Boolean).length; }
  calendarMarkerQuery() { return JSON.stringify({ scope: this.eventScope(), history: this.eventHistory, review: this.eventReview, status: this.eventStatus, locationId: this.eventLocation, search: this.eventSearch }); }
  reviewLabel(game: ManagedEvent) { return game.reviewStatus === 'COMPLETED' ? 'Completed' : game.reviewStatus === 'IN_PROGRESS' ? 'In progress' : 'Needs review'; }
  startReviewCompletion(game: ManagedEvent) { this.playersHadOpportunity = false; this.reviewCompletion.set(game); this.error.set(''); }
  async completeReview() {
    const game = this.reviewCompletion(); if (!game || !this.playersHadOpportunity || this.auth.profile()?.role !== 'ADMINISTRATOR') return;
    await this.act(async () => { await firstValueFrom(this.http.post(`/api/organizer/events/${game.id}/review/complete`, { playersHadOpportunity: true })); this.reviewCompletion.set(null); }, 'Event review completed. Payment and strike records are unchanged.');
  }
  readonly rosterEvent = signal('');
  readonly busy = signal(false);
  readonly loading = signal(true);
  readonly calendarRevision = signal(0);
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
  readonly selectedPlayers = signal<PlayerChoice[]>([]);
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
  event = { coOrganizerIds: [] as string[], isPrivate: false, title: '', locationId: '', startsAt: '', endsAt: '', capacity: 20, price: '0', maxGuestsPerUser: 1, cancellationCutoffHours: 12, description: '', status: 'DRAFT', bibsProvided: false, bibCount: null as number | null, shirtColors: ['dark', 'light'], shirtColorCount: 2 as number | null, minPlayers: null as number | null, teamCount: 2, teamBalancingEnabled: false, organizerContactEmail: '', organizerContactPhone: '', organizerVenmoUrl: '', organizerCashAppUrl: '', organizerPaypalUrl: '', organizerZelleContact: '', contactCallAllowed: false, contactTextAllowed: false };
  readonly paymentProfiles = {
    venmo: { field: 'organizerVenmoUrl', prefix: 'https://venmo.com/u/' },
    cashapp: { field: 'organizerCashAppUrl', prefix: 'https://cash.app/$' },
    paypal: { field: 'organizerPaypalUrl', prefix: 'https://paypal.me/' }
  } as const;
  paymentUsername(method: PaymentMethod) {
    const { field, prefix } = this.paymentProfiles[method], value = this.event[field];
    const normalized = paymentProfileUrl(value, method);
    return normalized ? normalized.slice(prefix.length) : value.startsWith(prefix) ? value.slice(prefix.length) : value;
  }
  setPaymentUsername(method: PaymentMethod, value: string) {
    const { field, prefix } = this.paymentProfiles[method];
    const normalized = paymentProfileUrl(value, method);
    const username = normalized ? normalized.slice(prefix.length) : value.trim().replace(/^[@$]/, '');
    this.event[field] = username ? prefix + username : '';
    this.clearFieldError(field);
  }
  updateShirtColors(count: number | null) {
    this.event.shirtColorCount = count;
    if (Number.isInteger(count) && count! >= 1 && count! <= 10) this.event.shirtColors = Array.from({ length: count! }, (_, i) => this.event.shirtColors[i] ?? ['dark', 'light'][i] ?? '');
  }
  ngOnInit() { void this.load(); }
  async load() {
    const revision = ++this.loadRevision;
    const minimal = this.minimalView();
    this.loading.set(true); this.error.set('');
    try {
      const [locations, events] = await Promise.all([firstValueFrom(this.http.get<Location[]>('/api/locations')), firstValueFrom(this.http.get<ManagedEvent[] | EventOverview[]>(minimal ? '/api/organizer/events/overview' : '/api/organizer/events', { params: minimal ? { period: this.calendar.period, date: this.calendar.date, search: this.eventSearch } : { scope: this.eventScope(), period: this.calendar.period, date: this.calendar.date, search: this.eventSearch, history: this.eventHistory, review: this.eventReview, status: this.eventStatus, locationId: this.eventLocation, ...(this.reviewTargetId ? { eventId: this.reviewTargetId } : {}) } }))]);
      if (revision !== this.loadRevision) return;
      this.calendarRevision.update(value => value + 1);
      this.locations.set(locations);
      if (minimal) { this.overview.set(events as EventOverview[]); this.events.set([]); }
      else { this.events.set(events as ManagedEvent[]); this.overview.set([]); }
      if (this.reviewTargetId) {
        const game = (events as ManagedEvent[]).find(game => game.id === this.reviewTargetId);
        if (!game) this.error.set('This game is unavailable for review. It may have been deleted or your organizer access changed.');
        else {
          this.expandedEvent.set(game.id); this.rosterEvent.set(game.id);
          if (this.reviewScrollPending) {
            this.reviewScrollPending = false;
            requestAnimationFrame(() => { const panel = document.getElementById('event-management-' + game.id); panel?.scrollIntoView({ block: 'start' }); panel?.focus({ preventScroll: true }); });
          }
        }
      }
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
    if (this.skillRestricted && (!Number.isInteger(this.skillThreshold) || this.skillThreshold < 1 || this.skillThreshold > 5)) { this.error.set('Choose a skill level from 1 to 5.'); return; }
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
      const payload = { ...event, minimumSkillLevel: this.skillRestricted && this.skillDirection === 'above' ? this.skillThreshold : null, maximumSkillLevel: this.skillRestricted && this.skillDirection === 'below' ? this.skillThreshold : null, bibCount: event.bibsProvided ? event.bibCount : null, shirtColors: event.shirtColors.slice(0, event.shirtColorCount ?? 0), startsAt: this.original && this.event.startsAt === this.localTime(this.original.startsAt) ? this.original.startsAt : startsAt.toISOString(), endsAt: this.original && this.event.endsAt === this.localTime(this.original.endsAt) ? this.original.endsAt : endsAt.toISOString(), priceCents };
      await firstValueFrom(this.editingId() ? this.http.patch('/api/organizer/events/' + this.editingId(), { ...payload, ...(status === 'DRAFT' ? { status } : {}) }) : this.http.post('/api/events', { ...payload, isPrivate, status: chosenStatus, initialPlayers: this.selectedPlayers().map(player => ({ userId: player.id, mode: player.mode })) }));
      this.cancelEdit();
    }, 'Event saved.');
  }
  cancelEdit() { this.skillRestricted = false; this.skillDirection = 'above'; this.skillThreshold = 3; this.resetOrganizerSearch(); this.fieldErrors.set({}); this.choosingStatus.set(false); this.showEventForm.set(false); this.selectedPlayers.set([]); this.editingId.set(''); this.original = null; this.event = { coOrganizerIds: [] as string[], isPrivate: false, title: '', locationId: '', startsAt: '', endsAt: '', capacity: 20, price: '0', maxGuestsPerUser: 1, cancellationCutoffHours: 12, description: '', status: 'DRAFT', bibsProvided: false, bibCount: null as number | null, shirtColors: ['dark', 'light'], shirtColorCount: 2 as number | null, minPlayers: null as number | null, teamCount: 2, teamBalancingEnabled: false, organizerContactEmail: '', organizerContactPhone: '', organizerVenmoUrl: '', organizerCashAppUrl: '', organizerPaypalUrl: '', organizerZelleContact: '', contactCallAllowed: false, contactTextAllowed: false }; }
  localTime(value: string) { const d = new Date(value); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }
  canEdit(game: ManagedEvent) { const profile = this.auth.profile(); return !game.deletedAt && !!profile && (profile.role === 'ADMINISTRATOR' || profile.role === 'ORGANIZER' && (game.organizerId === profile.id || !!game.coOrganizerIds?.includes(profile.id))) && ['DRAFT', 'PUBLISHED'].includes(game.status); }
  canReturnToDraft(game: ManagedEvent) { return this.canEdit(game) && game.status === 'PUBLISHED' && Date.parse(game.startsAt) > Date.now(); }
  canDraftWhileEditing() { return !!this.original && this.canReturnToDraft(this.original); }
  edit(game: ManagedEvent) {
    if (!this.canEdit(game)) return;
    this.skillRestricted = game.minimumSkillLevel != null || game.maximumSkillLevel != null; this.skillDirection = game.maximumSkillLevel != null ? 'below' : 'above'; this.skillThreshold = game.minimumSkillLevel ?? game.maximumSkillLevel ?? 3;
    this.resetOrganizerSearch();
    this.selectedOrganizers.set((game.coOrganizers ?? []).map(user => ({ ...user, accountName: user.accountName ?? user.displayName })));
    this.fieldErrors.set({});
    this.showEventForm.set(true); this.view.set('events');
    this.selectedPlayers.set([]); this.original = game; this.editingId.set(game.id);
    this.event = { coOrganizerIds: [...(game.coOrganizerIds ?? [])], isPrivate: game.isPrivate ?? false, title: game.title, description: game.description ?? '', locationId: game.location.id, startsAt: this.localTime(game.startsAt), endsAt: this.localTime(game.endsAt), capacity: game.capacity, price: (game.priceCents / 100).toFixed(2), maxGuestsPerUser: game.maxGuestsPerUser, cancellationCutoffHours: game.cancellationCutoffHours, status: game.status, bibsProvided: game.bibsProvided ?? false, bibCount: game.bibCount ?? null, shirtColors: Array.from({ length: game.shirtColorCount ?? 2 }, (_, i) => game.shirtColors?.[i] ?? ['dark', 'light'][i] ?? ''), shirtColorCount: game.shirtColorCount ?? 2, minPlayers: game.minPlayers ?? null, teamCount: game.teamCount ?? 2, teamBalancingEnabled: game.teamBalancingEnabled ?? false, organizerContactEmail: game.organizerContactEmail ?? '', organizerContactPhone: game.organizerContactPhone ?? '', organizerVenmoUrl: game.organizerVenmoUrl ?? '', organizerCashAppUrl: game.organizerCashAppUrl ?? '', organizerPaypalUrl: game.organizerPaypalUrl ?? '', organizerZelleContact: game.organizerZelleContact ?? '', contactCallAllowed: game.contactCallAllowed ?? false, contactTextAllowed: game.contactTextAllowed ?? false };
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  canShare(game: ManagedEvent) { return !game.deletedAt && game.status === 'PUBLISHED' && Date.parse(game.startsAt) > Date.now(); }
  canCancel(game: ManagedEvent) { return !game.deletedAt && ['DRAFT', 'PUBLISHED'].includes(game.status) && new Date(game.startsAt) > new Date(); }
  canComplete(game: ManagedEvent) { return this.auth.profile()?.role === 'ADMINISTRATOR' && game.reviewStatus !== 'COMPLETED'; }
  async transition(id: string, action: 'cancel' | 'complete') { await this.act(() => firstValueFrom(this.http.post(`/api/organizer/events/${id}/${action}`, {})), action === 'cancel' ? 'Event cancelled; players notified in the app.' : 'Event completed.'); this.cancelling.set(''); }
  async remove(id: string) { await this.act(() => firstValueFrom(this.http.delete('/api/admin/events/' + id)), 'Event deleted; history retained.'); this.deleting.set(''); }
  async publish(id: string) { await this.act(() => firstValueFrom(this.http.post(`/api/events/${id}/publish`, {})), 'Event published.'); }
}
