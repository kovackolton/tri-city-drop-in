import { Component, EventEmitter, OnInit, Output, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AuthService, message } from '../../auth.service';
import { Location } from '../../models';
@Component({
  selector: 'app-locations', imports: [FormsModule],
  templateUrl: './locations.component.html',
  styleUrl: './locations.component.scss'
})
export class LocationsComponent implements OnInit {
  readonly auth = inject(AuthService);
  private readonly http = inject(HttpClient);
  @Output() changed = new EventEmitter<void>();
  readonly locations = signal<Location[]>([]);
  readonly editing = signal(''); readonly deleting = signal(''); readonly checked = signal('');
  readonly busy = signal(false); readonly error = signal(''); readonly notice = signal('');
  form = { name: '', address: '', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone };
  ngOnInit() { void this.load(); }
  fingerprint() { return JSON.stringify(this.form); }
  invalidate() { this.checked.set(''); this.notice.set(''); }
  reset() { this.editing.set(''); this.form = { name: '', address: '', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }; this.invalidate(); }
  edit(location: Location) { this.editing.set(location.id); this.form = { name: location.name, address: location.address, timezone: location.timezone }; this.invalidate(); }
  async load() { try { this.locations.set(await firstValueFrom(this.http.get<Location[]>('/api/locations'))); } catch (e) { this.error.set(message(e)); } }
  async check() {
    if (this.busy()) return;
    this.busy.set(true); this.error.set(''); this.checked.set('');
    const fingerprint = this.fingerprint();
    try {
      const result = await firstValueFrom(this.http.post<{ duplicate: Location | null }>('/api/locations/check', this.form));
      if (fingerprint !== this.fingerprint()) return;
      if (result.duplicate && result.duplicate.id !== this.editing()) this.error.set(`Already exists: ${result.duplicate.name}, ${result.duplicate.address}. Use that location.`);
      else { this.checked.set(fingerprint); this.notice.set('No duplicate found. Ready to save.'); }
    } catch (e) { this.error.set(message(e)); } finally { this.busy.set(false); }
  }
  async save() {
    if (this.busy() || this.checked() !== this.fingerprint()) return;
    this.busy.set(true); this.error.set('');
    try { await firstValueFrom(this.editing() ? this.http.patch(`/api/locations/${this.editing()}`, this.form) : this.http.post('/api/locations', this.form)); this.reset(); await this.load(); this.notice.set('Location saved.'); this.changed.emit(); }
    catch (e) { this.error.set(message(e)); } finally { this.busy.set(false); }
  }
  async remove(id: string) {
    if (this.busy()) return;
    this.busy.set(true); this.error.set('');
    try { await firstValueFrom(this.http.delete(`/api/locations/${id}`)); this.deleting.set(''); if (this.editing() === id) this.reset(); await this.load(); this.changed.emit(); this.notice.set('Location deleted.'); }
    catch (e) { this.error.set(message(e)); } finally { this.busy.set(false); }
  }
}
