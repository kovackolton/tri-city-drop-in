import { Component, Input, OnChanges, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { SharedGame, shareMessage } from '../../event-sharing';
@Component({ selector: 'app-event-share', templateUrl: './event-share.component.html', styles: [':host { display: block; min-width: 0; } .share-options { padding: 1rem; margin-top: .75rem; border: 1px solid var(--border); border-radius: .8rem; background: var(--surface-muted); }'] })
export class EventShareComponent implements OnChanges {
  @Input({ required: true }) eventId!: string;
  private readonly http = inject(HttpClient);
  readonly open = signal(false); readonly loading = signal(false); readonly data = signal<SharedGame | null>(null);
  readonly error = signal(''); readonly notice = signal('');
  readonly nativeShareAvailable = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  private revision = 0;
  ngOnChanges() { this.revision++; this.open.set(false); this.loading.set(false); this.data.set(null); this.error.set(''); this.notice.set(''); }
  async prepare() {
    if (this.open()) { this.open.set(false); return; }
    this.open.set(true); this.loading.set(true); this.error.set(''); this.notice.set('');
    const id = this.eventId, revision = ++this.revision;
    try { const data = await firstValueFrom(this.http.get<SharedGame>(`/api/public/games/${encodeURIComponent(id)}`)); if (revision === this.revision && id === this.eventId) this.data.set(data); }
    catch { if (revision === this.revision) { this.data.set(null); this.error.set('This game cannot be shared right now. It may have started, ended or been cancelled. Try refreshing.'); } }
    finally { if (revision === this.revision) this.loading.set(false); }
  }
  async share() {
    const data = this.data(); if (!data || !this.nativeShareAvailable) return;
    this.error.set(''); this.notice.set('');
    try { await navigator.share({ title: data.share.title, text: shareMessage(data.share), url: data.share.url }); }
    catch (error) { if ((error as { name?: string }).name !== 'AbortError') this.error.set('Sharing is unavailable in this browser. Use Copy link or select the address below.'); }
  }
  async copy() {
    const data = this.data(); if (!data) return;
    this.error.set(''); this.notice.set('');
    try { await navigator.clipboard.writeText(data.share.url); this.notice.set('Event link copied.'); }
    catch { this.error.set('Select and copy the event address below.'); }
  }
}
