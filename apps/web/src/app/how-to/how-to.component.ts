import { Component, ElementRef, EventEmitter, Input, Output, ViewChild, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../auth.service';
import { GuideScreenshotComponent } from './guide-screenshot.component';
import { searchHowToGuides, visibleHowToGuides } from './how-to-content';

@Component({ selector: 'app-how-to', imports: [FormsModule, GuideScreenshotComponent], templateUrl: './how-to.component.html', styleUrl: './how-to.component.scss' })
export class HowToComponent {
  readonly auth = inject(AuthService);
  @Input() set guideId(value: string) { this.selectedId.set(value || 'start'); }
  @Output() guideChanged = new EventEmitter<string>();
  @ViewChild('guideHeading') heading?: ElementRef<HTMLElement>;
  readonly selectedId = signal('start');
  readonly search = signal('');
  readonly directoryOpen = signal(false);
  readonly allowed = computed(() => visibleHowToGuides(this.auth.profile()?.role));
  readonly filtered = computed(() => searchHowToGuides(this.auth.profile()?.role, this.search()));
  readonly groups = computed(() => [...new Set(this.filtered().map(guide => guide.category))].map(name => ({ name, guides: this.filtered().filter(guide => guide.category === name) })));
  readonly guide = computed(() => this.allowed().find(guide => guide.id === this.selectedId()) ?? this.allowed()[0]);
  readonly unavailable = computed(() => !this.allowed().some(guide => guide.id === this.selectedId()));
  readonly related = computed(() => this.guide().related.map(id => this.allowed().find(guide => guide.id === id)).filter(guide => !!guide));
  openGuide(id: string) {
    if (!this.allowed().some(guide => guide.id === id)) return;
    this.selectedId.set(id); this.directoryOpen.set(false); this.guideChanged.emit(id);
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => { this.heading?.nativeElement.focus({ preventScroll: true }); this.heading?.nativeElement.scrollIntoView({ block: 'start' }); });
  }
  jumpTo(id: string) { document.getElementById('guide-section-' + id)?.scrollIntoView({ block: 'start' }); document.getElementById('guide-section-' + id)?.focus({ preventScroll: true }); }
}
