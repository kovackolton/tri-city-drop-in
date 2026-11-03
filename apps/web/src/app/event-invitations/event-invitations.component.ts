import { Component, EventEmitter, OnInit, Output, inject, signal } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { DialogComponent } from '../dialog/dialog.component';
import { WaiverStore } from '../../waiver.store';
import { StrikesStore } from '../../strikes.store';
import { message } from '../../auth.service';
import { eventTime, Location } from '../../models';
interface Invitation { id: string; event: { id: string; title: string; startsAt: string; priceCents: number; location: Location }; }
@Component({ selector: 'app-event-invitations', imports: [CurrencyPipe, DialogComponent], template: `@if (invitations().length || error()) {
  <section class="panel mt-5" aria-label="Game invitations"><div class="flex justify-between gap-3"><h2 class="text-xl font-bold">Invitations</h2><button class="secondary" [disabled]="busy()" (click)="load()">Refresh invitations</button></div>
    @if (error()) { <p role="alert" class="notice error mt-3">{{ error() }}</p> }
    @for (invite of invitations(); track invite.id) { <article class="mt-4 border-t border-divider pt-4"><h3 class="font-semibold">{{ invite.event.title }}</h3><p class="text-sm mt-1">{{ time(invite.event.startsAt, invite.event.location.timezone) }} &middot; {{ invite.event.location.name }}</p><p class="text-sm mt-2">{{ invite.event.priceCents === 0 ? 'Free' : (invite.event.priceCents / 100 | currency:'USD':'USD ') }} per player, payable in person if confirmed. Accepting follows the normal capacity/waitlist rules.</p><div class="flex flex-wrap gap-3 mt-3"><button class="primary" [disabled]="busy() || !waiver.accepted() || strikes.blocked()" (click)="respond(invite, 'accept')">Accept and join</button><button class="secondary" [disabled]="busy()" (click)="respond(invite, 'decline')">Decline</button></div></article> }
  </section>
}
<app-dialog [open]="!!costConfirmation()" title="Acknowledge invitation cost" [busy]="busy()" (closed)="costConfirmation.set(null)">
  @if (costConfirmation(); as invite) { <p class="font-bold">{{ invite.event.title }}</p><p class="text-2xl font-bold mt-3">{{ invite.event.priceCents / 100 | currency:'USD':'USD ' }} for your seat</p><p class="text-sm mt-3">I acknowledge this cost and agree to pay in person if confirmed. Nothing is due while waitlisted; this price applies if I am promoted. No online payment is taken.</p>@if (error()) { <p role="alert" class="notice error mt-3">{{ error() }}</p> }<div class="flex flex-wrap gap-3 mt-5"><button class="primary" [disabled]="busy() || !waiver.accepted() || strikes.blocked()" (click)="confirmCost()">I acknowledge the cost &amp; accept</button><button class="secondary" [disabled]="busy()" (click)="costConfirmation.set(null)">Go back</button></div> }
</app-dialog>` })
export class EventInvitationsComponent implements OnInit {
  readonly waiver = inject(WaiverStore);
  readonly strikes = inject(StrikesStore);
  private readonly http = inject(HttpClient);
  @Output() changed = new EventEmitter<void>();
  readonly costConfirmation = signal<Invitation | null>(null);
  readonly invitations = signal<Invitation[]>([]); readonly busy = signal(false); readonly error = signal(''); readonly time = eventTime;
  ngOnInit() { void this.load(); }
  async load(clearError = true) { if (clearError) this.error.set(''); try { this.invitations.set(await firstValueFrom(this.http.get<Invitation[]>('/api/me/event-invitations'))); } catch (error) { this.error.set(message(error)); } }
  async confirmCost() {
    const invite = this.costConfirmation(); if (!invite || this.busy()) return;
    const current = this.invitations().find(item => item.id === invite.id);
    if (!current || current.event.priceCents !== invite.event.priceCents) { this.costConfirmation.set(null); this.error.set('Invitation details changed. Review the current cost before accepting.'); return; }
    await this.respond(invite, 'accept', true);
  }
  async respond(invite: Invitation, action: 'accept' | 'decline', costAcknowledged = false) {
    if (this.busy() || action === 'accept' && (!this.waiver.accepted() || this.strikes.blocked())) return;
    if (action === 'accept' && invite.event.priceCents > 0 && !costAcknowledged) { this.error.set(''); this.costConfirmation.set({ ...invite, event: { ...invite.event } }); return; }
    this.busy.set(true); this.error.set('');
    try { await firstValueFrom(this.http.post(`/api/me/event-invitations/${invite.id}/${action}`, action === 'accept' ? { expectedPriceCents: invite.event.priceCents, costAcknowledged } : {})); this.costConfirmation.set(null); await this.load(); this.changed.emit(); }
    catch (error) { this.error.set(message(error)); await this.load(false); }
    finally { this.busy.set(false); }
  }
}
