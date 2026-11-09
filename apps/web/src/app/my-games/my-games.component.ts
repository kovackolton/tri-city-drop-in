import { IconComponent } from '../icon/icon.component';
import { CalendarPickerComponent } from '../calendar-picker/calendar-picker.component';
import { FormsModule } from '@angular/forms';
import { CalendarSelection, calendarDate, matchesCalendar } from '../../calendar';
import { OrganizerContactComponent } from '../organizer-contact/organizer-contact.component';
import { EventGuidanceComponent } from '../event-guidance/event-guidance.component';
import { LocationMapComponent } from '../location-map/location-map.component';
import { LocationThumbnailComponent } from '../location-thumbnail/location-thumbnail.component';
import { Component, Input, OnChanges, inject, signal } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { RegistrationsStore, Seat } from '../../registrations.store';
import { eventTime } from '../../models';
import { PaymentReviewComponent } from '../payment-review/payment-review.component';
import { AuthService } from '../../auth.service';
import { AvatarComponent } from '../avatar/avatar.component';
import { EventInvitationsComponent } from '../event-invitations/event-invitations.component';
import { PlayersComponent } from '../players/players.component';
@Component({
  selector: 'app-my-games', imports: [IconComponent, CalendarPickerComponent, FormsModule, CurrencyPipe, PaymentReviewComponent, PlayersComponent, AvatarComponent, LocationMapComponent, LocationThumbnailComponent, EventGuidanceComponent, OrganizerContactComponent, EventInvitationsComponent],
  templateUrl: './my-games.component.html',
  styleUrl: './my-games.component.scss'
})
export class MyGamesComponent implements OnChanges {
  @Input() revealHistory = false;
  ngOnChanges() { if (this.revealHistory) this.showPast.set(true); }
  readonly auth = inject(AuthService);
  readonly store = inject(RegistrationsStore);
  readonly confirming = signal('');
  readonly playersEvent = signal('');
  readonly showPast = signal(false);
  calendar: CalendarSelection = { period: 'all', date: calendarDate(new Date()) };
  search = ''; location = ''; organizer = ''; bookingStatus = ''; paymentFilter = '';
  locations() { return [...new Set(this.store.seats().map(seat => seat.event.location.name))].sort(); }
  organizers() { return [...new Set(this.store.seats().flatMap(seat => [seat.event.organizer.displayName, ...(seat.event.coOrganizers ?? []).map(user => user.displayName)]))].sort(); }
  needsPayment(host: Seat) { return this.party(host).some(seat => seat.status === 'CONFIRMED' && ['PUBLISHED', 'COMPLETED'].includes(seat.event.status) && Date.parse(seat.event.endsAt) <= Date.now() && seat.payment && seat.payment.amountCents > 0 && !['VOID', 'NOT_REQUIRED'].includes(seat.payment.status) && seat.payment.playerPaid === null); }
  matches(host: Seat) {
    const query = this.search.trim().toLowerCase();
    return matchesCalendar(host.event.startsAt, host.event.location?.timezone ?? 'UTC', this.calendar)
      && (!query || `${host.event.title} ${host.event.location.name} ${host.event.location.city ?? ''}`.toLowerCase().includes(query))
      && (!this.location || host.event.location.name === this.location)
      && (!this.organizer || (host.event.organizer.displayName === this.organizer || host.event.coOrganizers?.some(user => user.displayName === this.organizer)))
      && (!this.bookingStatus || host.status === this.bookingStatus)
      && (!this.paymentFilter || (this.paymentFilter === 'needs' ? this.needsPayment(host) : this.party(host).some(seat => seat.payment && seat.payment.amountCents > 0 && !['VOID', 'NOT_REQUIRED'].includes(seat.payment.status) && seat.payment.playerPaid === (this.paymentFilter === 'paid'))));
  }
  clearFilters() { this.calendar = { period: 'all', date: calendarDate(new Date()) }; this.search = ''; this.location = ''; this.organizer = ''; this.bookingStatus = ''; this.paymentFilter = ''; }
  readonly time = eventTime;
  month(value: string, zone: string) { return new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: zone }).format(new Date(value)); }
  day(value: string, zone: string) { return new Intl.DateTimeFormat('en-US', { day: 'numeric', timeZone: zone }).format(new Date(value)); }
  label(value: string) { return value.replaceAll('_', ' ').toLowerCase(); }
  gameGroups() {
    const now = Date.now();
    const grouped = new Map<string, Seat>();
    for (const seat of this.bookingHistory()) {
      const previous = grouped.get(seat.eventId);
      if (!previous || previous.status === 'CANCELLED' && seat.status !== 'CANCELLED') grouped.set(seat.eventId, seat);
    }
    const hosts = [...grouped.values()].filter(host => this.matches(host));
    return [
      { id: 'upcoming', games: hosts.filter(seat => Date.parse(seat.event.endsAt) > now).sort((a, b) => Date.parse(a.event.startsAt) - Date.parse(b.event.startsAt)) },
      { id: 'past', games: hosts.filter(seat => Date.parse(seat.event.endsAt) <= now).sort((a, b) => Date.parse(b.event.startsAt) - Date.parse(a.event.startsAt)) }
    ];
  }
  bookingHistory(eventId?: string) { return this.store.seats().filter(seat => seat.guestNumber === 0 && (!eventId || seat.eventId === eventId)).sort((a, b) => Date.parse(b.queuedAt ?? b.event.startsAt) - Date.parse(a.queuedAt ?? a.event.startsAt) || b.id.localeCompare(a.id)); }
  previousBookings(host: Seat) { return this.bookingHistory(host.eventId).filter(seat => seat.bookingId !== host.bookingId); }
  party(host: Seat) { return this.store.seats().filter(s => s.bookingId === host.bookingId); }
  canCancel(host: Seat) { return host.status !== 'CANCELLED' && ['DRAFT', 'PUBLISHED'].includes(host.event.status) && new Date(host.event.startsAt).getTime() > Date.now(); }
  async cancel(host: Seat) { if (await this.store.cancel(host.eventId, host.bookingId)) this.confirming.set(''); }
}
