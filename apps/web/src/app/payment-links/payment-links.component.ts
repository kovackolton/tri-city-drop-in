import { Component, Input } from '@angular/core';
import { paymentProfileUrl, PaymentMethod } from '../../payment-links';
@Component({ selector: 'app-payment-links', template: `@if (methods().length) { <section class="payment-options" aria-label="Organizer payment options"><p class="text-xs text-muted mb-2">Organizer payment options</p><ul>@for (method of methods(); track method.key) { <li><a [href]="method.url" target="_blank" rel="noopener noreferrer" [title]="'Pay organizer with ' + method.name + ' (opens in a new tab)'" class="payment-link"><img [src]="'/icons/payments/' + method.key + '.svg'" width="26" height="26" alt="" class="payment-logo"><span>{{ method.name }}</span><span class="sr-only">: organizer payment profile, opens in a new tab</span></a></li> }</ul><p class="text-xs text-muted mt-2">Pay outside the app. Payment reports and organizer confirmation are still recorded here.</p></section> }`, styles: [`:host { display: block; } .payment-options { border-top: 1px solid var(--divider); padding-top: .8rem; margin-top: .8rem; } ul { display: flex; flex-wrap: wrap; gap: .65rem; } .payment-link { display: inline-flex; align-items: center; gap: .6rem; min-height: 44px; padding: .5rem .8rem; border: 1px solid var(--secondary-border); border-radius: .7rem; background: var(--secondary-bg); color: var(--secondary-text); font-size: .85rem; font-weight: 600; } .payment-link:hover { text-decoration: underline; text-underline-offset: .2em; } .payment-logo { box-sizing: content-box; background: var(--payment-logo-bg); padding: .25rem; border-radius: .35rem; flex-shrink: 0; }`] })
export class PaymentLinksComponent {
  @Input() venmoUrl?: string | null;
  @Input() cashAppUrl?: string | null;
  @Input() paypalUrl?: string | null;
  methods() {
    return ([{ key: 'venmo', name: 'Venmo', value: this.venmoUrl }, { key: 'cashapp', name: 'Cash App', value: this.cashAppUrl }, { key: 'paypal', name: 'PayPal', value: this.paypalUrl }] as const).flatMap(method => { const url = paymentProfileUrl(method.value, method.key as PaymentMethod); return url ? [{ ...method, url }] : []; });
  }
}
