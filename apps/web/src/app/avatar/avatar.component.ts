import { Component, Input } from '@angular/core';
import { avatarInitial, avatarPalette } from '../../avatar';
@Component({
  selector: 'app-avatar',
  template: `<span class="avatar" [style.width.px]="size" [style.height.px]="size" [style.font-size.px]="size * .4" [style.background]="palette().background" [style.color]="palette().foreground" aria-hidden="true">
    @if (photoUrl && failedUrl !== photoUrl) { <img [src]="photoUrl" alt="" [width]="size" [height]="size" loading="lazy" referrerpolicy="no-referrer" (error)="failedUrl = photoUrl"> }
    @else { {{ initial() }} }
  </span>`,
  styles: [':host { display: inline-flex; flex-shrink: 0; vertical-align: middle; } .avatar { display: inline-flex; align-items: center; justify-content: center; border-radius: 50%; overflow: hidden; font-weight: 700; line-height: 1; } img { width: 100%; height: 100%; object-fit: cover; }']
})
export class AvatarComponent {
  @Input() name: string | null | undefined = '';
  @Input() color: string | null | undefined = 'emerald';
  @Input() photoUrl: string | null | undefined = null;
  @Input() size = 40;
  failedUrl: string | null | undefined;
  initial() { return avatarInitial(this.name); }
  palette() { return avatarPalette(this.color); }
}
