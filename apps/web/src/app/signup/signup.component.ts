import { Component, EventEmitter, Input, Output, inject, signal } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Game } from '../../models';
import { RegistrationsStore } from '../../registrations.store';
@Component({
  selector: 'app-signup', imports: [FormsModule, CurrencyPipe],
  templateUrl: './signup.component.html',
  styleUrl: './signup.component.scss'
})
export class SignupComponent {
  @Input({ required: true }) game!: Game;
  @Output() changed = new EventEmitter<void>();
  readonly store = inject(RegistrationsStore);
  readonly confirmCancel = signal(false);
  guests: string[] = [];
  booking() { return this.store.seats().find(s => s.eventId === this.game.id && s.guestNumber === 0 && s.status !== 'CANCELLED'); }
  partySize() { const booking = this.booking(); return this.store.seats().filter(s => s.bookingId === booking?.bookingId).length; }
  guestLimit() { return Math.min(this.game.maxGuestsPerUser, this.game.capacity - 1); }
  add() { if (this.guests.length < this.guestLimit()) this.guests = [...this.guests, '']; }
  remove(index: number) { this.guests = this.guests.filter((_, i) => i !== index); }
  async join() { if (await this.store.join(this.game.id, this.guests.map(s => s.trim()), this.game.priceCents)) { this.guests = []; this.changed.emit(); } }
  async cancel(bookingId: string) { if (await this.store.cancel(this.game.id, bookingId)) { this.confirmCancel.set(false); this.changed.emit(); } }
}
