import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { Game, eventTime } from '../../models';
import { AuthService } from '../../auth.service';
import { LocationMapComponent } from '../location-map/location-map.component';
import { LocationThumbnailComponent } from '../location-thumbnail/location-thumbnail.component';
import { OrganizerContactComponent } from '../organizer-contact/organizer-contact.component';
import { EventGuidanceComponent } from '../event-guidance/event-guidance.component';
import { EventShareComponent } from '../event-share/event-share.component';
import { SignupComponent } from '../signup/signup.component';
@Component({ selector: 'app-event-card', imports: [CurrencyPipe, LocationMapComponent, LocationThumbnailComponent, OrganizerContactComponent, EventGuidanceComponent, EventShareComponent, SignupComponent], templateUrl: './event-card.component.html', styleUrl: './event-card.component.scss' })
export class EventCardComponent {
  @Input({ required: true }) game!: Game;
  @Output() changed = new EventEmitter<void>(); @Output() signIn = new EventEmitter<void>();
  readonly auth = inject(AuthService); readonly time = eventTime;
}
