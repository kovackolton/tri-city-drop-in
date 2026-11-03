import { Component, Input, OnChanges, inject } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { googleDirectionsUrl, googleEmbedUrl } from '../../location-media';
@Component({
  selector: 'app-location-map',
  template: `<div class="venue-map">
    @if (safeUrl) { <iframe [src]="safeUrl" [title]="'Map showing ' + name" width="600" height="220" loading="lazy" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe> }
    <a [href]="directionsUrl" target="_blank" rel="noopener noreferrer">Get directions in Google Maps <span aria-hidden="true">&#8599;</span></a>
  </div>`,
  styles: [':host { display: block; } iframe { display: block; width: 100%; min-width: 200px; height: 220px; border: 1px solid var(--border); border-radius: .85rem; background: var(--surface-muted); } a { display: inline-block; margin-top: .6rem; font-size: .75rem; font-weight: 600; text-decoration: underline; text-underline-offset: 3px; color: var(--accent); }']
})
export class LocationMapComponent implements OnChanges {
  @Input() name = '';
  @Input() address = '';
  @Input() embedUrl: string | null | undefined = null;
  private readonly sanitizer = inject(DomSanitizer);
  safeUrl: SafeResourceUrl | null = null;
  directionsUrl = '';
  ngOnChanges() {
    const url = googleEmbedUrl(this.embedUrl);
    // Only this exact HTTPS Google endpoint is trusted; raw iframe HTML is never rendered.
    this.safeUrl = url ? this.sanitizer.bypassSecurityTrustResourceUrl(url) : null;
    this.directionsUrl = googleDirectionsUrl(this.name, this.address);
  }
}
