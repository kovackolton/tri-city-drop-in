import { IconComponent } from '../icon/icon.component';
import { Component, EventEmitter, Input, Output, inject, signal } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { WaiverStore } from '../../waiver.store';
import { StrikesStore } from '../../strikes.store';
import { DialogComponent } from '../dialog/dialog.component';
import { Game } from '../../models';
import { RegistrationsStore } from '../../registrations.store';
@Component({
  selector: 'app-signup', imports: [IconComponent, FormsModule, CurrencyPipe, DialogComponent],
  templateUrl: './signup.component.html',
  styleUrl: './signup.component.scss'
})
export class SignupComponent {
  @Input({ required: true }) game!: Game;
  @Input() inviteToken = '';
  @Output() changed = new EventEmitter<void>();
  readonly waiver = inject(WaiverStore);
  readonly strikes = inject(StrikesStore);
  readonly store = inject(RegistrationsStore);
  readonly costConfirmation = signal<{ eventId: string; title: string; priceCents: number; guests: string[]; guestPaymentAcknowledged: boolean } | null>(null);
  readonly submitting = signal(false);
  readonly confirmCancel = signal(false);
  guests: string[] = [];
  guestPaymentAcknowledged = false;
  readonly acknowledgmentError = signal('');
  booking() { return this.store.seats().find(s => s.eventId === this.game.id && s.guestNumber === 0 && s.status !== 'CANCELLED'); }
  partySize() { const booking = this.booking(); return this.store.seats().filter(s => s.bookingId === booking?.bookingId).length; }
  guestLimit() { return Math.min(this.game.maxGuestsPerUser, this.game.capacity - 1); }
  add() { if (this.guests.length < this.guestLimit()) { this.guests = [...this.guests, '']; this.guestPaymentAcknowledged = false; } }
  remove(index: number) { this.guests = this.guests.filter((_, i) => i !== index); this.guestPaymentAcknowledged = false; }
  async join() {
    if (this.submitting() || !this.waiver.accepted() || this.strikes.blocked()) return;
    this.acknowledgmentError.set('');
    if (this.guests.length && !this.guestPaymentAcknowledged) { this.acknowledgmentError.set('Accept guest payment responsibility to continue.'); return; }
    if (this.game.priceCents > 0) {
      this.costConfirmation.set({ eventId: this.game.id, title: this.game.title, priceCents: this.game.priceCents, guests: this.guests.map(name => name.trim()), guestPaymentAcknowledged: this.guestPaymentAcknowledged }); return;
    }
    await this.submit(false);
  }
  async confirmCost() {
    const confirmation = this.costConfirmation(); if (!confirmation || this.submitting() || !this.waiver.accepted() || this.strikes.blocked()) return;
    if (confirmation.eventId !== this.game.id || confirmation.priceCents !== this.game.priceCents || JSON.stringify(confirmation.guests) !== JSON.stringify(this.guests.map(name => name.trim())) || confirmation.guestPaymentAcknowledged !== this.guestPaymentAcknowledged) {
      this.costConfirmation.set(null); this.acknowledgmentError.set('Booking details changed. Review the event cost again before joining.'); return;
    }
    await this.submit(true);
  }
  private async submit(costAcknowledged: boolean) {
    this.submitting.set(true);
    try { if (await (this.inviteToken ? this.store.join(this.game.id, this.guests.map(name => name.trim()), this.game.priceCents, this.guestPaymentAcknowledged, costAcknowledged, this.inviteToken) : this.store.join(this.game.id, this.guests.map(name => name.trim()), this.game.priceCents, this.guestPaymentAcknowledged, costAcknowledged))) {
      this.costConfirmation.set(null); this.guests = []; this.guestPaymentAcknowledged = false; this.changed.emit();
    } } finally { this.submitting.set(false); }
  }
  async cancel(bookingId: string) { if (await this.store.cancel(this.game.id, bookingId)) { this.confirmCancel.set(false); this.changed.emit(); } }
}
