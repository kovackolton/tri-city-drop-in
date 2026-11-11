import { Component, EventEmitter, Input, OnChanges, Output, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { message } from '../../auth.service';
interface SubSeat { id: string; status: string; subResponsibilityAcknowledgedAt?: string | null; subName?: string | null; subWillPay?: boolean; event: { startsAt: string; status: string }; }
@Component({ selector: 'app-substitute-seat', imports: [FormsModule], template: `
<section class="notice mt-3" aria-label="Late cancellation and sub details">
  <h5 class="font-semibold">Sub seat for {{ originalName || 'the original player' }}</h5>
  @if (seat.status !== 'CONFIRMED') { <p class="text-sm mt-2">This sub reservation was released. No payment is due for this cancelled seat. Recorded sub: {{ seat.subName || 'Not named' }}.</p> } @else {
  <p class="text-sm mt-2">Original booking retained. {{ organizer ? 'The booking account remains responsible for payment.' : 'You remain responsible for payment, even if the sub promises to pay.' }} {{ seat.subName ? 'Sub: ' + seat.subName : 'No sub named yet.' }}</p>
  @if (canEdit()) {
    <label class="mt-3 text-sm">Sub name<input type="text" [ngModel]="name" (ngModelChange)="name = $event; dirty = true" maxlength="80" [disabled]="busy()" placeholder="Person covering this seat"></label>
    <label class="flex items-start gap-3 mt-3 text-sm"><input class="!w-auto !mt-1" type="checkbox" [ngModel]="willPay" (ngModelChange)="willPay = $event; dirty = true" [disabled]="busy()"><span>The sub said they will pay instead. This does not transfer payment or strike responsibility away from the original booking account.</span></label>
    <button type="button" class="secondary mt-3" [disabled]="busy() || willPay && !name.trim()" (click)="save()">Save sub details</button>
  } @else { <p class="text-xs mt-3">{{ seat.subWillPay ? 'The sub said they would pay. The original booking account is still responsible.' : 'Payment remains with the original booking account.' }} Players cannot change sub details after kickoff. Contact an organizer for corrections.</p> }
  @if (notice()) { <p role="status" class="text-sm mt-2">{{ notice() }}</p> }@if (error()) { <p role="alert" class="text-sm mt-2">{{ error() }}</p> }
}
</section>` })
export class SubstituteSeatComponent implements OnChanges {
  @Input({ required: true }) seat!: SubSeat;
  @Input() organizer = false; @Input() originalName = '';
  @Output() changed = new EventEmitter<void>();
  private readonly http = inject(HttpClient); private previousId = '';
  readonly busy = signal(false); readonly error = signal(''); readonly notice = signal('');
  name = ''; willPay = false; dirty = false;
  ngOnChanges() { if (this.previousId !== this.seat.id || !this.dirty) { this.previousId = this.seat.id; this.name = this.seat.subName ?? ''; this.willPay = this.seat.subWillPay ?? false; this.dirty = false; } }
  canEdit() { return this.seat.status === 'CONFIRMED' && !!this.seat.subResponsibilityAcknowledgedAt && ['PUBLISHED', 'COMPLETED'].includes(this.seat.event.status) && (this.organizer || Date.parse(this.seat.event.startsAt) > Date.now()); }
  async save() {
    if (this.busy() || !this.canEdit() || this.willPay && !this.name.trim()) return;
    this.busy.set(true); this.error.set(''); this.notice.set('');
    try { await firstValueFrom(this.http.post(`/api/${this.organizer ? 'organizer/' : ''}signups/${this.seat.id}/substitute`, { subName: this.name.trim() || null, subWillPay: this.willPay })); this.dirty = false; this.notice.set('Sub saved. Payment responsibility stays with the original booking account.'); this.changed.emit(); }
    catch (error) { this.error.set(message(error)); } finally { this.busy.set(false); }
  }
}
