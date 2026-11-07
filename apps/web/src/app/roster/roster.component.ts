import { IconComponent } from '../icon/icon.component';
import { Component, EventEmitter, Input, OnChanges, Output, ViewChild, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { EventTeamsComponent } from '../event-teams/event-teams.component';
import { AvatarComponent } from '../avatar/avatar.component';
import { contactEmailLink, contactPhoneLink } from '../../avatar';
import { message } from '../../auth.service';
import { PaymentReviewComponent } from '../payment-review/payment-review.component';
import { OrganizerSeat, OrganizerSeatComponent } from '../organizer-seat/organizer-seat.component';
import { DatePipe } from '@angular/common';
@Component({
  selector: 'app-roster',
  imports: [IconComponent, FormsModule, PaymentReviewComponent, OrganizerSeatComponent, DatePipe, AvatarComponent, EventTeamsComponent],
  templateUrl: './roster.component.html',
  styleUrl: './roster.component.scss'
})
export class RosterComponent implements OnChanges {
  readonly emailLink = contactEmailLink;
  readonly phoneLink = contactPhoneLink;
  @Input({ required: true }) eventId!: string;
  @Input() eventStatus = '';
  @Input() archived = false;
  @Input() startsAt = '';
  @Input() priceCents = 0;
  @Input() isPrivate = false;
  @Output() changed = new EventEmitter<void>();
  @ViewChild(EventTeamsComponent) teamView?: EventTeamsComponent;
  private readonly http = inject(HttpClient);
  readonly seats = signal<OrganizerSeat[]>([]);
  readonly view = signal<'players' | 'teams' | 'history'>('players');
  readonly statusFilter = signal('active');
  readonly expandedSeat = signal('');
  readonly counts = computed(() => ({
    confirmed: this.seats().filter(seat => seat.status === 'CONFIRMED').length,
    waitlisted: this.seats().filter(seat => seat.status === 'WAITLISTED').length,
    cancelled: this.seats().filter(seat => seat.status === 'CANCELLED').length
  }));
  readonly audit = signal<{ id: string; action: string; createdAt: string; actor: { displayName: string }; details: { note?: string; reason?: string } }[]>([]);
  readonly loading = signal(false);
  readonly auditLoading = signal(false);
  readonly error = signal('');
  readonly showAddPlayer = signal(false);
  readonly addingPlayer = signal(false);
  readonly searchingPlayers = signal(false);
  readonly playerResults = signal<{ id: string; displayName: string; accountName: string; skillLevel?: number | null; adminSkillLevel?: number | null }[]>([]);
  readonly selectedPlayer = signal<{ id: string; displayName: string; accountName: string } | null>(null);
  readonly addError = signal(''); readonly addNotice = signal('');
  playerSearch = ''; addMode: 'INVITE' | 'BOOK' = 'INVITE';
  private playerSearchRevision = 0;
  canAddPlayers() { return !this.archived && ['DRAFT', 'PUBLISHED'].includes(this.eventStatus) && Date.parse(this.startsAt) > Date.now(); }
  toggleAddPlayer() { if (this.addingPlayer()) return; this.showAddPlayer.update(open => !open); }
  async searchExistingPlayers() {
    if (this.searchingPlayers() || this.addingPlayer() || this.playerSearch.trim().length < 2) return;
    const eventId = this.eventId, revision = ++this.playerSearchRevision;
    this.searchingPlayers.set(true); this.addError.set(''); this.addNotice.set(''); this.playerResults.set([]); this.selectedPlayer.set(null);
    try {
      const players = await firstValueFrom(this.http.get<ReturnType<typeof this.playerResults>>('/api/organizer/players', { params: { search: this.playerSearch.trim() } }));
      if (revision === this.playerSearchRevision && eventId === this.eventId) this.playerResults.set(players);
    } catch (error) { if (revision === this.playerSearchRevision && eventId === this.eventId) this.addError.set(message(error)); }
    finally { if (revision === this.playerSearchRevision) this.searchingPlayers.set(false); }
  }
  async addSelectedPlayer() {
    const player = this.selectedPlayer(); if (!player || this.addingPlayer() || !this.canAddPlayers()) return;
    const eventId = this.eventId, revision = this.playerSearchRevision;
    this.addingPlayer.set(true); this.addError.set(''); this.addNotice.set('');
    try {
      const result = await firstValueFrom(this.http.post<{ mode: string; status: string; draft: boolean; alreadyAdded: boolean }>(`/api/organizer/events/${eventId}/players`, { userId: player.id, mode: this.addMode, ...(this.addMode === 'BOOK' ? { expectedPriceCents: this.priceCents } : {}) }));
      if (eventId !== this.eventId || revision !== this.playerSearchRevision) return;
      this.addNotice.set(result.alreadyAdded ? `${player.displayName} already has this booking or a pending invitation.` : result.mode === 'INVITE' ? `${player.displayName}: ${result.draft ? 'invitation queued until publication' : 'invitation sent'}.` : `${player.displayName}: ${result.status === 'WAITLISTED' ? 'added to the waitlist' : 'seat confirmed'}${result.draft ? ' (provisional draft booking)' : ''}. Player notified.`);
      this.selectedPlayer.set(null); this.playerResults.update(players => players.filter(item => item.id !== player.id));
      this.playerChanged();
    } catch (error) { if (eventId === this.eventId && revision === this.playerSearchRevision) this.addError.set(message(error)); }
    finally { if (eventId === this.eventId) this.addingPlayer.set(false); }
  }
  search = '';
  private loadRevision = 0;
  private auditRevision = 0;
  ngOnChanges() {
    this.playerSearchRevision++; this.searchingPlayers.set(false); this.addingPlayer.set(false); this.showAddPlayer.set(false);
    this.playerResults.set([]); this.selectedPlayer.set(null); this.playerSearch = ''; this.addMode = 'INVITE'; this.addError.set(''); this.addNotice.set('');
    this.seats.set([]); this.audit.set([]); this.auditRevision++; this.auditLoading.set(false);
    this.view.set('players'); this.statusFilter.set('active'); this.expandedSeat.set(''); this.search = '';
    void this.load();
  }
  name(seat: OrganizerSeat) { return seat.guestNumber === 0 ? seat.user.displayName : seat.guestName || 'Guest'; }
  label(value: string) { return value.replaceAll('_', ' ').toLowerCase(); }
  filteredSeats() {
    const search = this.search.trim().toLocaleLowerCase(), filter = this.statusFilter();
    return this.seats().filter(seat => (filter === 'all' || (filter === 'active' ? seat.status !== 'CANCELLED' : seat.status === filter)) &&
      (!search || [this.name(seat), seat.user.accountName, seat.user.displayName].some(name => name.toLocaleLowerCase().includes(search))));
  }
  paymentSummary(seat: OrganizerSeat) {
    const payment = seat.payment;
    if (!payment) return 'No charge';
    if (payment.status === 'VOID') return 'Payment voided';
    if (payment.status === 'NOT_REQUIRED' || payment.amountCents === 0) return 'Free';
    if (payment.playerPaid !== null && payment.organizerPaid !== null && payment.playerPaid !== payment.organizerPaid) return 'Payment reports differ';
    if (payment.status === 'PAID') return 'Payment received';
    return payment.playerPaid === false && payment.organizerPaid === false ? 'Unpaid' : 'Payment review pending';
  }
  activeStrikes(seat: OrganizerSeat) { return seat.strikes.filter(strike => !strike.revokedAt).length; }
  togglePlayer(id: string) { this.expandedSeat.set(this.expandedSeat() === id ? '' : id); }
  async openView(view: 'players' | 'teams' | 'history') {
    this.view.set(view); this.error.set('');
    if (view === 'history') { try { await this.loadAudit(); } catch (error) { this.error.set(message(error)); } }
  }
  playerChanged() { void this.load(); this.changed.emit(); }
  async load() {
    const id = this.eventId, revision = ++this.loadRevision;
    this.loading.set(true); this.error.set('');
    try {
      const seats = await firstValueFrom(this.http.get<OrganizerSeat[]>(`/api/organizer/events/${id}/roster`));
      if (id !== this.eventId || revision !== this.loadRevision) return;
      this.seats.set(seats);
      if (this.view() === 'history') await this.loadAudit();
      await this.teamView?.load();
    } catch (error) { if (id === this.eventId && revision === this.loadRevision) this.error.set(message(error)); }
    finally { if (id === this.eventId && revision === this.loadRevision) this.loading.set(false); }
  }
  async refreshHistory() { this.error.set(''); try { await this.loadAudit(); } catch (error) { this.error.set(message(error)); } }
  private async loadAudit() {
    const id = this.eventId, revision = ++this.auditRevision;
    this.auditLoading.set(true);
    try {
      const audit = await firstValueFrom(this.http.get<ReturnType<typeof this.audit>>(`/api/organizer/events/${id}/audit`));
      if (id === this.eventId && revision === this.auditRevision) this.audit.set(audit);
    } catch (error) { if (id === this.eventId && revision === this.auditRevision) throw error; }
    finally { if (id === this.eventId && revision === this.auditRevision) this.auditLoading.set(false); }
  }
}
