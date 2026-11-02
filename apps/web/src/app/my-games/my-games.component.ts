import { Component, inject, signal } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { RegistrationsStore, Seat } from '../../registrations.store';
import { eventTime } from '../../models';
import { PaymentReviewComponent } from '../payment-review/payment-review.component';
import { PlayersComponent } from '../players/players.component';
@Component({
  selector: 'app-my-games', imports: [CurrencyPipe, PaymentReviewComponent, PlayersComponent],
  templateUrl: './my-games.component.html',
  styleUrl: './my-games.component.scss'
})
export class MyGamesComponent {
  readonly store = inject(RegistrationsStore);
  readonly confirming = signal('');
  readonly playersEvent = signal('');
  readonly time = eventTime;
  hosts() { return this.store.seats().filter(s => s.guestNumber === 0); }
  party(host: Seat) { return this.store.seats().filter(s => s.bookingId === host.bookingId); }
  canCancel(host: Seat) { return host.status !== 'CANCELLED' && host.event.status === 'PUBLISHED' && new Date(host.event.startsAt).getTime() > Date.now(); }
  async cancel(host: Seat) { if (await this.store.cancel(host.eventId, host.bookingId)) this.confirming.set(''); }
}
