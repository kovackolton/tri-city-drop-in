import { Component, EventEmitter, Input, Output, inject, signal } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { DialogComponent } from '../dialog/dialog.component';
import { RegistrationsStore, Seat } from '../../registrations.store';
import { message } from '../../auth.service';
interface CancellationInfo { late: boolean; alreadyCancelledForSub: boolean; seatCount: number; amountCents: number; cutoffHours: number; }
@Component({ selector: 'app-cancel-booking', imports: [DialogComponent, FormsModule, CurrencyPipe], template: `
<button type="button" class="secondary" [disabled]="store.busy() || store.loading()" (click)="open()">Cancel booking</button>
<app-dialog [open]="opened()" title="Confirm cancellation" [busy]="store.busy() || loading()" (closed)="opened.set(false)">
  @if (loading()) { <p role="status">Checking the cancellation rules...</p> }
  @if (info(); as details) {
    @if (details.late) {
      <p class="font-bold">You are inside the {{ details.cutoffHours }}-hour cancellation cutoff.</p>
      <p class="text-sm mt-3">Organizers need reasonable time to find replacements and notify waitlisted players. Short notice may not give them time to confirm and attend.</p>
      <p class="notice mt-3">All {{ details.seatCount }} seats stay reserved under your account. You are responsible for finding a sub for each seat and coordinating payment. No one is automatically promoted from the waitlist.</p>
      <p class="font-semibold mt-3">{{ details.amountCents === 0 ? 'No payment is due for these free seats.' : 'Payment responsibility retained: ' + (details.amountCents / 100 | currency:'USD':'USD ') }}</p>
      <label class="flex items-start gap-3 mt-4 text-sm"><input class="!w-auto !mt-1" type="checkbox" [(ngModel)]="acknowledged"><span>I acknowledge that I remain responsible for paying for every reserved seat, even if a sub says they will pay. If the organizer marks a seat unpaid, the normal payment strike applies to my account after the 24-hour grace period. The sub cannot receive a strike. I will arrange the replacement and communicate with the organizer.</span></label>
      <p class="text-xs text-muted mt-3">After confirming, return to My games to enter sub names before kickoff and view any waitlisted contacts who opted in. Organizers/admins can correct sub details afterward.</p>
    } @else { <p>Cancel all {{ details.seatCount }} seats? Your places will be released and eligible waitlisted parties will be promoted in order. No sub or late-payment responsibility is created.</p> }
    <div class="flex flex-wrap gap-3 mt-5"><button type="button" class="primary" [disabled]="store.busy() || loading() || details.late && !acknowledged || details.alreadyCancelledForSub" (click)="confirm()">{{ details.late ? 'I acknowledge & reserve for subs' : 'Confirm cancellation' }}</button><button type="button" class="secondary" [disabled]="store.busy()" (click)="opened.set(false)">Keep booking</button></div>
  }
  @if (error() || store.error()) { <p role="alert" class="notice error mt-3">{{ error() || store.error() }}</p> }
</app-dialog>` })
export class CancelBookingComponent {
  @Input({ required: true }) seat!: Seat;
  @Output() changed = new EventEmitter<void>();
  readonly store = inject(RegistrationsStore);
  private readonly http = inject(HttpClient);
  readonly opened = signal(false); readonly loading = signal(false); readonly error = signal('');
  readonly info = signal<CancellationInfo | null>(null); acknowledged = false;
  async open() { this.acknowledged = false; this.opened.set(true); await this.loadInfo(); }
  private async loadInfo() {
    this.loading.set(true); this.error.set(''); this.info.set(null);
    try { this.info.set(await firstValueFrom(this.http.get<CancellationInfo>(`/api/events/${this.seat.eventId}/signups/${this.seat.bookingId}/cancellation`))); }
    catch (error) { this.error.set(message(error)); } finally { this.loading.set(false); }
  }
  async confirm() {
    const info = this.info(); if (!info || this.store.busy() || this.loading() || info.late && !this.acknowledged || info.alreadyCancelledForSub) return;
    if (await this.store.cancel(this.seat.eventId, this.seat.bookingId, this.acknowledged)) { this.opened.set(false); this.changed.emit(); }
    else { this.acknowledged = false; await this.loadInfo(); }
  }
}
