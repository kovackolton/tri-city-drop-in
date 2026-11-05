import { Component, Input, OnChanges, signal } from '@angular/core';
import { GuideImage, guideScreenshotPath } from './how-to-content';
@Component({
  selector: 'app-guide-screenshot',
  template: `<figure><div class="image-frame"><img [src]="source()" [alt]="image.title" [hidden]="!loaded()" decoding="async" (load)="loaded.set(true)" (error)="loaded.set(false)">@if (!loaded()) { <div class="screenshot-placeholder"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 15 5-5 6 6 3-3 4 4"/><circle cx="16" cy="9" r="1"/></svg><p class="placeholder-label">Screenshot coming soon</p><p>{{ image.title }}</p></div> }</div><figcaption>{{ image.title }}</figcaption></figure>`,
  styles: [`:host{display:block;margin:1.75rem 0}figure{margin:0}.image-frame{border:1px dashed var(--input-border);border-radius:.8rem;overflow:hidden;background:var(--surface-muted)}img{display:block;width:100%;max-height:42rem;object-fit:contain}img[hidden]{display:none}.screenshot-placeholder{min-height:11rem;padding:2rem 1rem;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.6rem;color:var(--muted);text-align:center;font-size:.875rem}.placeholder-label{font-weight:700;color:var(--text)}figcaption{font-size:.8rem;color:var(--muted);margin-top:.6rem}`]
})
export class GuideScreenshotComponent implements OnChanges {
  @Input({ required: true }) image!: GuideImage;
  readonly loaded = signal(false);
  source() { return guideScreenshotPath(this.image); }
  ngOnChanges() { this.loaded.set(false); }
}
