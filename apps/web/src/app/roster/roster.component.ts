import { PlayerPickerComponent } from '../player-picker/player-picker.component';
import { IconComponent } from '../icon/icon.component';
import { Component, EventEmitter, Input, OnChanges, SimpleChanges, Output, ViewChild, computed, inject, signal } from '@angular/core';
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
  imports: [PlayerPickerComponent, IconComponent, FormsModule, PaymentReviewComponent, OrganizerSeatComponent, DatePipe, AvatarComponent, EventTeamsComponent],
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
  @Input() shirtColors: string[] = [];
  readonly savingAttendance = signal('');
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
  readonly audit = signal<{ id: string; action: string; createdAt: string; actor: { displayName: string }; details: { note?: string; reason?: string; seatCount?: number; cancelledAt?: string; lateCancellation?: boolean; previousStatus?: string } }[]>([]);
  readonly loading = signal(false);
  readonly auditLoading = signal(false);
  readonly error = signal('');
  readonly showAddPlayer = signal(false);
  canAddPlayers() { return !this.archived && ['DRAFT', 'PUBLISHED'].includes(this.eventStatus) && Date.parse(this.startsAt) > Date.now(); }
  toggleAddPlayer() { this.showAddPlayer.update(open => !open); }
  search = '';
  private loadRevision = 0;
  private auditRevision = 0;
  ngOnChanges(changes?: SimpleChanges) {
    if (changes && !changes['eventId']) { if (changes['eventStatus'] || changes['archived']) void this.load(); return; }
    this.showAddPlayer.set(false);
    this.seats.set([]); this.audit.set([]); this.auditRevision++; this.auditLoading.set(false);
    this.view.set('players'); this.statusFilter.set('active'); this.expandedSeat.set(''); this.search = '';
    void this.load();
  }
  name(seat: OrganizerSeat) { return seat.guestNumber === 0 ? seat.user.displayName : seat.guestName || 'Guest'; }
  label(value: string) { return value.replaceAll('_', ' ').toLowerCase(); }
  activeFilterCount() { return [!!this.search.trim(), this.statusFilter() !== 'all'].filter(Boolean).length; }
  filteredSeats() {
    const search = this.search.trim().toLocaleLowerCase(), filter = this.statusFilter();
    return this.seats().filter(seat => (filter === 'all' || (filter === 'active' ? seat.status !== 'CANCELLED' : seat.status === filter)) &&
      (!search || [this.name(seat), seat.user.accountName, seat.user.displayName].some(name => name.toLocaleLowerCase().includes(search))));
  }
  seatGroups() {
    const groups = new Map<string, { key: string; label: string; team: number | null; seats: OrganizerSeat[] }>();
    for (const seat of this.filteredSeats()) {
      const team = seat.status === 'CONFIRMED' ? seat.teamNumber ?? null : null;
      const key = seat.status === 'WAITLISTED' ? 'waitlist' : seat.status === 'CANCELLED' ? 'cancelled' : team ? 'team-' + team : 'unassigned';
      if (!groups.has(key)) groups.set(key, { key, label: key === 'waitlist' ? 'Waitlist' : key === 'cancelled' ? 'Cancelled bookings' : team ? 'Team ' + team : 'Unassigned players', team, seats: [] });
      groups.get(key)!.seats.push(seat);
    }
    return [...groups.values()].sort((a, b) => (a.team ?? (a.key === 'unassigned' ? 100 : a.key === 'waitlist' ? 101 : 102)) - (b.team ?? (b.key === 'unassigned' ? 100 : b.key === 'waitlist' ? 101 : 102)));
  }
  shirt(team: number | null | undefined) { return team && team > 0 ? this.shirtColors[team - 1]?.trim() || '' : ''; }
  shirtSwatch(team: number | null | undefined) { const color = this.shirt(team).toLowerCase(); return ({ dark: '#20242c', light: '#f1f3f5', black: '#111111', white: '#ffffff', red: '#c02f2a', blue: '#3c7cdb', green: '#348062', yellow: '#f1cf3a', orange: '#df7527', purple: '#8655bc', pink: '#e48ebc', grey: '#838b96', gray: '#838b96' } as Record<string, string>)[color] ?? 'transparent'; }
  endedSeat(seat: OrganizerSeat) { return Date.parse(seat.event.endsAt) <= Date.now(); }
  canReviewAttendance(seat: OrganizerSeat) { return !this.archived && seat.status === 'CONFIRMED' && ['PUBLISHED', 'COMPLETED'].includes(seat.event.status) && Date.parse(seat.event.startsAt) <= Date.now(); }
  async markAttendance(seat: OrganizerSeat, attendance: string, control?: HTMLSelectElement) {
    if (this.savingAttendance() || !this.canReviewAttendance(seat)) { if (control) control.value = seat.attendance; return; }
    this.savingAttendance.set(seat.id); this.error.set('');
    try { await firstValueFrom(this.http.post(`/api/organizer/signups/${seat.id}/attendance`, { attendance })); await this.load(); this.changed.emit(); }
    catch (error) { if (control?.isConnected) control.value = seat.attendance; this.error.set(message(error)); }
    finally { this.savingAttendance.set(''); }
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
