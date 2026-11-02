import { EventGuidanceComponent } from '../event-guidance/event-guidance.component';
import { LocationMapComponent } from '../location-map/location-map.component';
import { LocationThumbnailComponent } from '../location-thumbnail/location-thumbnail.component';
import { Component, inject, signal } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { RegistrationsStore, Seat } from '../../registrations.store';
import { eventTime } from '../../models';
import { PaymentReviewComponent } from '../payment-review/payment-review.component';
import { AuthService } from '../../auth.service';
import { AvatarComponent } from '../avatar/avatar.component';
import { PlayersComponent } from '../players/players.component';
@Component({
  selector: 'app-my-games', imports: [CurrencyPipe, PaymentReviewComponent, PlayersComponent, AvatarComponent, LocationMapComponent, LocationThumbnailComponent, EventGuidanceComponent],
  templateUrl: './my-games.component.html',
  styleUrl: './my-games.component.scss'
})
export class MyGamesComponent {
  readonly auth = inject(AuthService);
  readonly store = inject(RegistrationsStore);
  readonly confirming = signal('');
  readonly playersEvent = signal('');
  readonly showPast = signal(false);
  readonly time = eventTime;
  month(value: string, zone: string) { return new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: zone }).format(new Date(value)); }
  day(value: string, zone: string) { return new Intl.DateTimeFormat('en-US', { day: 'numeric', timeZone: zone }).format(new Date(value)); }
  label(value: string) { return value.replaceAll('_', ' ').toLowerCase(); }
  gameGroups() {
    const now = Date.now();
    const hosts = this.store.seats().filter(seat => seat.guestNumber === 0);
    return [
      { id: 'upcoming', games: hosts.filter(seat => Date.parse(seat.event.endsAt) > now).sort((a, b) => Date.parse(a.event.startsAt) - Date.parse(b.event.startsAt)) },
      { id: 'past', games: hosts.filter(seat => Date.parse(seat.event.endsAt) <= now).sort((a, b) => Date.parse(b.event.startsAt) - Date.parse(a.event.startsAt)) }
    ];
  }
  party(host: Seat) { return this.store.seats().filter(s => s.bookingId === host.bookingId); }
  canCancel(host: Seat) { return host.status !== 'CANCELLED' && host.event.status === 'PUBLISHED' && new Date(host.event.startsAt).getTime() > Date.now(); }
  async cancel(host: Seat) { if (await this.store.cancel(host.eventId, host.bookingId)) this.confirming.set(''); }
}
