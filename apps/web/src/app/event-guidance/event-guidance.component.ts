import { Component, Input } from '@angular/core';
@Component({
  selector: 'app-event-guidance',
  template: `<div class="space-y-3 text-sm break-words">
    <section class="joined-summary" aria-label="Confirmed players and minimum target">
      <div class="joined-heading"><div class="joined-total"><strong>{{ confirmed ?? 0 }}</strong><span>players joined<span class="joined-detail">Confirmed seats, including guests</span></span></div>
        @if (capacity != null) { <p class="joined-capacity">Capacity <strong>{{ capacity }}</strong>@if (waitlisted != null) { <span class="block">{{ waitlisted }} waiting</span> }</p> }
      </div>
      @if (minPlayers) { <div class="minimum-target"><p>Minimum target: <strong>{{ minPlayers }} players</strong><span class="block text-xs mt-1">{{ remaining() > 0 ? remaining() + ' more needed to reach the target.' : 'Target reached.' }}</span></p><p class="text-xs">Informational only; the organizer may run the game with fewer players.</p></div> }
    </section>
    @if (bibsProvided === true) { <p class="font-medium text-accent">Pinnies / bibs provided{{ bibCount ? ': ' + bibCount : '' }}</p> }
    @if (shirtColorCount) { <p class="font-medium text-accent">Bring {{ shirtColorCount }} different shirt {{ shirtColorCount === 1 ? 'color' : 'colors' }}@if (shirtColors?.length) { : {{ shirtColors?.join(', ') }}@if ((shirtColors?.length ?? 0) < shirtColorCount) { (remaining colors not specified) } }</p> }
  </div>`,
  styles: [`.joined-summary { padding: 1rem; border: 1px solid var(--event-info-border); border-radius: .85rem; background: var(--event-blue-bg); color: var(--event-blue-text); }
    .joined-heading { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 1rem; }
    .joined-total { display: flex; align-items: center; gap: .8rem; font-weight: 700; }
    .joined-total > strong { font-size: 2.75rem; line-height: 1; font-variant-numeric: tabular-nums; }
    .joined-detail { display: block; font-size: .7rem; font-weight: 400; margin-top: .2rem; }
    .joined-capacity { font-size: .8rem; }
    .minimum-target { display: flex; flex-wrap: wrap; justify-content: space-between; gap: .75rem; margin-top: .9rem; padding-top: .75rem; border-top: 1px solid var(--event-info-border); }
    .minimum-target > p:last-child { max-width: 20rem; }`]

})
export class EventGuidanceComponent {
  @Input() bibsProvided: boolean | null | undefined = null;
  @Input() bibCount: number | null | undefined = null;
  @Input() shirtColors: string[] | undefined = [];
  @Input() shirtColorCount: number | null | undefined = null;
  @Input() minPlayers: number | null | undefined = null;
  @Input() confirmed: number | null | undefined = 0;
  @Input() capacity: number | null | undefined = null;
  @Input() waitlisted: number | null | undefined = null;
  remaining() { return Math.max(0, (this.minPlayers ?? 0) - (this.confirmed ?? 0)); }
}
