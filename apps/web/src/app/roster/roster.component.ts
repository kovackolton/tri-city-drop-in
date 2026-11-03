import { Component, EventEmitter, Input, OnChanges, Output, ViewChild, inject, signal } from '@angular/core';
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
  imports: [PaymentReviewComponent, OrganizerSeatComponent, DatePipe, AvatarComponent, EventTeamsComponent],
  templateUrl: './roster.component.html',
  styleUrl: './roster.component.scss'
})
export class RosterComponent implements OnChanges {
  readonly emailLink = contactEmailLink;
  readonly phoneLink = contactPhoneLink;
  @Input({ required: true }) eventId!: string;
  @Output() changed = new EventEmitter<void>();
  @ViewChild(EventTeamsComponent) teamView?: EventTeamsComponent;
  private readonly http = inject(HttpClient);
  readonly seats = signal<OrganizerSeat[]>([]);
  readonly showAudit = signal(false);
  readonly audit = signal<{ id: string; action: string; createdAt: string; actor: { displayName: string }; details: { note?: string; reason?: string } }[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');
  ngOnChanges() { void this.load(); }
  async load() {
    this.loading.set(true); this.error.set('');
    try { this.seats.set(await firstValueFrom(this.http.get<OrganizerSeat[]>(`/api/organizer/events/${this.eventId}/roster`))); if (this.showAudit()) await this.loadAudit(); await this.teamView?.load(); }
    catch (error) { this.error.set(message(error)); }
    finally { this.loading.set(false); }
  }
  async toggleAudit() { this.showAudit.set(!this.showAudit()); if (this.showAudit()) { try { await this.loadAudit(); } catch (error) { this.error.set(message(error)); } } }
  private async loadAudit() { this.audit.set(await firstValueFrom(this.http.get<ReturnType<typeof this.audit>>(`/api/organizer/events/${this.eventId}/audit`))); }
}
