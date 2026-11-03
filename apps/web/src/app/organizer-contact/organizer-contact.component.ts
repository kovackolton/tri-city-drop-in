import { Component, Input } from '@angular/core';
import { contactEmailLink, contactPhoneLink } from '../../avatar';
@Component({
  selector: 'app-organizer-contact',
  template: `@if (email || phone) { <div class="text-sm border-t border-stone-100 pt-3 mt-3"><p class="text-xs text-stone-500 mb-2">Organizer contact{{ name ? ': ' + name : '' }}</p><div class="flex flex-wrap items-center gap-x-4 gap-y-2">@if (email) { <a class="text-emerald-800 underline break-all" [href]="emailLink(email)">{{ email }}</a> }@if (phone) { <span>{{ phone }}</span><span class="flex items-center gap-2">@if (callAllowed) { <a class="font-bold text-emerald-800 underline" [href]="phoneLink(phone)" aria-label="Call organizer" title="Call">C</a> } @else { <span class="text-stone-400" title="Calls not available">C</span> }<span aria-hidden="true">|</span>@if (textAllowed) { <a class="font-bold text-emerald-800 underline" [href]="textLink(phone)" aria-label="Text organizer" title="Text">T</a> } @else { <span class="text-stone-400" title="Texts not available">T</span> }</span> }</div></div> }`
})
export class OrganizerContactComponent {
  @Input() name: string | null | undefined = '';
  @Input() email: string | null | undefined = null;
  @Input() phone: string | null | undefined = null;
  @Input() callAllowed: boolean | undefined = false;
  @Input() textAllowed: boolean | undefined = false;
  readonly emailLink = contactEmailLink;
  readonly phoneLink = contactPhoneLink;
  textLink(phone: string) { return 'sms:' + phone.replace(/[^+0-9]/g, ''); }
}
