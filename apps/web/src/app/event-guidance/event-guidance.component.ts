import { Component, Input } from '@angular/core';
@Component({
  selector: 'app-event-guidance',
  template: `<div class="space-y-2 text-sm">
    @if (bibsProvided === true) { <p class="font-medium text-emerald-800">Pinnies / bibs provided</p> }
    @else if (bibsProvided === false && shirtColorCount) { <p class="font-medium text-emerald-800">Bring {{ shirtColorCount }} different shirt {{ shirtColorCount === 1 ? 'color' : 'colors' }}</p> }
    @if (minPlayers) {
      <div class="rounded-xl border p-3" [class.border-amber-200]="remaining() > 0" [class.bg-amber-50]="remaining() > 0" [class.border-emerald-200]="remaining() === 0" [class.bg-emerald-50]="remaining() === 0">
        <p class="font-semibold">Player target: {{ confirmed ?? 0 }} / {{ minPlayers }} confirmed</p>
        <p class="text-xs mt-1">{{ remaining() > 0 ? remaining() + ' more to reach the target.' : 'Player target reached.' }} Informational only; the organizer may run the game with fewer players.</p>
      </div>
    }
  </div>`
})
export class EventGuidanceComponent {
  @Input() bibsProvided: boolean | null | undefined = null;
  @Input() shirtColorCount: number | null | undefined = null;
  @Input() minPlayers: number | null | undefined = null;
  @Input() confirmed: number | null | undefined = 0;
  remaining() { return Math.max(0, (this.minPlayers ?? 0) - (this.confirmed ?? 0)); }
}
