import { DOCUMENT } from '@angular/common';
import { Injectable, OnDestroy, inject, signal } from '@angular/core';

type Theme = 'light' | 'dark';
const preferenceKey = 'tri-city-theme';
@Injectable({ providedIn: 'root' })
export class ThemeService implements OnDestroy {
  private readonly document = inject(DOCUMENT);
  private readonly window = this.document.defaultView;
  private readonly media = this.window?.matchMedia?.('(prefers-color-scheme: dark)');
  private preference: Theme | null = null;
  readonly dark = signal(false);
  private readonly systemChanged = () => { if (!this.preference) this.apply(this.media?.matches ? 'dark' : 'light'); };
  private readonly storageChanged = (event: StorageEvent) => {
    if (event.key !== preferenceKey && event.key !== null) return;
    this.preference = event.newValue === 'light' || event.newValue === 'dark' ? event.newValue : null;
    this.apply(this.preference ?? (this.media?.matches ? 'dark' : 'light'));
  };
  constructor() {
    try {
      const saved = this.window?.localStorage.getItem(preferenceKey);
      this.preference = saved === 'light' || saved === 'dark' ? saved : null;
    } catch { /* Theme still works when storage is blocked. */ }
    this.apply(this.preference ?? (this.media?.matches ? 'dark' : 'light'));
    this.media?.addEventListener('change', this.systemChanged);
    this.window?.addEventListener('storage', this.storageChanged);
  }
  toggle() {
    this.preference = this.dark() ? 'light' : 'dark';
    this.apply(this.preference);
    try { this.window?.localStorage.setItem(preferenceKey, this.preference); } catch { /* Keep this session's selection. */ }
  }
  private apply(theme: Theme) { this.dark.set(theme === 'dark'); this.document.documentElement.dataset['theme'] = theme; }
  ngOnDestroy() {
    this.media?.removeEventListener('change', this.systemChanged);
    this.window?.removeEventListener('storage', this.storageChanged);
  }
}
