import { Component, EventEmitter, Input, Output, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { message } from '../../auth.service';
import { DialogComponent } from '../dialog/dialog.component';
import { PaymentReview } from '../payment-review/payment-review.component';
export interface OrganizerSeat {
  id: string; bookingId: string; guestNumber: number; guestName: string | null; status: string; attendance: string; lateCancellation: boolean;
  subResponsibilityAcknowledgedAt?: string | null; subName?: string | null; subWillPay?: boolean;
  teamNumber?: number | null; queuedAt?: string;
  guestPaymentAcknowledgedAt?: string | null; guestPaymentTermsVersion?: string | null;
  user: { strikeCount?: number; eventCancellationCount?: number; accountName: string; nickname: string | null; skillLevel: number | null; adminSkillLevel?: number | null; preferredPositions?: string[]; displayName: string; contactEmail: string; phone: string | null; avatarUrl?: string | null; avatarColor?: string }; event: { startsAt: string; endsAt: string; status: string }; payment: PaymentReview | null;
  strikes: { id: string; reason: string; revokedAt: string | null; expiresAt: string | null }[];
}
@Component({
  selector: 'app-organizer-seat', imports: [FormsModule, DialogComponent],
  templateUrl: './organizer-seat.component.html',
  styleUrl: './organizer-seat.component.scss'
})
export class OrganizerSeatComponent {
  @Input({ required: true }) seat!: OrganizerSeat;
  @Input({ required: true }) eventId!: string;
  @Output() changed = new EventEmitter<void>();
  private readonly http = inject(HttpClient);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly confirm = signal('');
  readonly showStrikes = signal(false);
  note = '';
  reason = 'NO_SHOW';
  started() { return Date.parse(this.seat.event.startsAt) <= Date.now(); }
  ended() { return Date.parse(this.seat.event.endsAt) <= Date.now(); }
  label(reason: string) { return reason.replaceAll('_', ' ').toLowerCase(); }
  eligibility() {
    if (this.seat.strikes.some(s => s.reason === this.reason)) return 'This incident has already been reviewed.';
    if (this.reason === 'NO_SHOW' && this.seat.subResponsibilityAcknowledgedAt) return 'Subs do not receive attendance strikes. Review payment against the original booking account.';
    if (this.reason === 'NO_SHOW') return !this.seat.subResponsibilityAcknowledgedAt && this.seat.status === 'CONFIRMED' && this.seat.attendance === 'ABSENT' ? '' : 'Mark the confirmed player absent first.';
    if (this.reason === 'LATE_CANCELLATION') return (this.seat.status === 'CANCELLED' || !!this.seat.subResponsibilityAcknowledgedAt) && this.seat.lateCancellation ? '' : 'Only late player cancellations qualify.';
    const p = this.seat.payment;
    return this.seat.status === 'CONFIRMED' && p && p.amountCents > 0 && p.status === 'UNPAID' && p.organizerPaid === false && Date.parse(this.seat.event.endsAt) + 86400000 <= Date.now() ? '' : 'Payment strikes apply only to organizer-marked unpaid seats after the 24-hour grace period. The player report does not determine the strike.';
  }
  private async act(path: string, body: unknown) {
    if (this.busy()) return;
    this.busy.set(true); this.error.set('');
    try { await firstValueFrom(this.http.post(path, body)); this.confirm.set(''); this.changed.emit(); }
    catch (error) { this.error.set(message(error)); }
    finally { this.busy.set(false); }
  }
  mark(attendance: string) { return this.act(`/api/organizer/signups/${this.seat.id}/attendance`, { attendance }); }
  issue() { return this.act(`/api/organizer/signups/${this.seat.id}/strikes`, { reason: this.reason, note: this.note }); }
  revoke(id: string) { return this.act(`/api/organizer/signups/${this.seat.id}/strikes/${id}/revoke`, { note: this.note }); }
  override() { return this.act(`/api/organizer/events/${this.eventId}/bookings/${this.seat.bookingId}/${this.confirm()}`, { reason: this.note }); }
}
