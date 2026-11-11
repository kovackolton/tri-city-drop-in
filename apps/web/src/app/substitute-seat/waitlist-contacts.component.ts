import { Component, Input, OnDestroy, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { contactEmailLink, contactPhoneLink } from '../../avatar';
import { message } from '../../auth.service';
@Component({ selector: 'app-waitlist-contacts', template: `<details class="mt-4" (toggle)="toggled($any($event.target).open)"><summary class="cursor-pointer text-sm font-semibold text-accent">Potential subs from the waitlist</summary><p class="text-xs text-muted mt-2">Only people who opted in are listed. Contact them to coordinate; this does not confirm or promote anyone, and no place or payment is transferred. Before arranging a waitlisted person, coordinate their existing waitlist booking with the organizer to avoid duplicate places.</p>@if (loading()) { <p role="status">Loading contacts...</p> }@if (error()) { <p role="alert" class="text-sm mt-2">{{ error() }}</p> }<ul>@for (contact of contacts(); track $index) { <li class="mt-3 border-t border-divider pt-3"><p class="font-semibold text-sm">{{ contact.name }}</p><div class="flex flex-wrap gap-3 mt-2"><a class="text-accent underline break-all" [href]="emailLink(contact.email)">{{ contact.email }}</a>@if (contact.phone) { <a class="text-accent underline" [href]="phoneLink(contact.phone)">{{ contact.phone }}</a> }</div></li> } @empty { @if (!loading() && !error()) { <li class="text-sm text-muted mt-3">No opted-in waitlisted contacts are currently available. Contact the organizer for help.</li> } }</ul></details>` })
export class WaitlistContactsComponent implements OnDestroy {
  @Input({ required: true }) eventId = ''; @Input({ required: true }) bookingId = '';
  private readonly http = inject(HttpClient); private revision = 0;
  readonly emailLink = contactEmailLink; readonly phoneLink = contactPhoneLink;
  readonly contacts = signal<{ name: string; email: string; phone: string | null }[]>([]); readonly error = signal(''); readonly loading = signal(false);
  ngOnDestroy() { this.revision++; this.contacts.set([]); }
  async toggled(open: boolean) {
    const revision = ++this.revision; this.contacts.set([]); this.error.set(''); this.loading.set(false); if (!open) return;
    this.loading.set(true);
    try { const contacts = await firstValueFrom(this.http.get<{ name: string; email: string; phone: string | null }[]>(`/api/events/${this.eventId}/signups/${this.bookingId}/waitlist-contacts`)); if (revision === this.revision) this.contacts.set(contacts); }
    catch (error) { if (revision === this.revision) this.error.set(message(error)); } finally { if (revision === this.revision) this.loading.set(false); }
  }
}
