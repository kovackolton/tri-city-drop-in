import { Component, Input } from '@angular/core';
@Component({
  selector: 'app-location-thumbnail',
  template: `<figure [style.width.px]="size">
    <div class="thumbnail" [style.width.px]="size" [style.height.px]="size">
      @if (photoUrl && failedUrl !== photoUrl) {
        <img [src]="photoUrl" [alt]="'Photo of ' + name" [width]="size" [height]="size" loading="lazy" decoding="async" referrerpolicy="no-referrer" (error)="failedUrl = photoUrl">
      } @else {
        <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-5h6v5M8 10h2m4 0h2M8 13h2m4 0h2" /></svg>
      }
    </div>
    @if (photoUrl && photoCredit && failedUrl !== photoUrl) { <figcaption>{{ photoCredit }}</figcaption> }
  </figure>`,
  styles: [':host { display: inline-flex; flex-shrink: 0; } figure { margin: 0; } .thumbnail { display: flex; align-items: center; justify-content: center; border: 1px solid rgb(127 150 130 / 20%); border-radius: .85rem; overflow: hidden; background: #eef3e8; color: #52725c; } img { display: block; height: 100%; width: 100%; object-fit: cover; } figcaption { margin-top: .3rem; font-size: .6rem; line-height: 1.3; overflow-wrap: anywhere; opacity: .8; }']
})
export class LocationThumbnailComponent {
  @Input() name = '';
  @Input() photoUrl: string | null | undefined = null;
  @Input() photoCredit: string | null | undefined = null;
  @Input() size = 80;
  failedUrl: string | null | undefined;
}
